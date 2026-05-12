import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './utils';

const DEFAULT_LUNCH_CUTOFF = '13:00';
const DEFAULT_DINNER_CUTOFF = '20:00';
const IST_TIME_ZONE = 'Asia/Kolkata';

export type Slot = 'lunch' | 'dinner';

function isValidCutoff(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function getIstParts(date = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + minute,
  };
}

function cutoffToMinutes(cutoff: string): number {
  const [hour, minute] = cutoff.split(':').map(Number);
  return hour * 60 + minute;
}

function getCountKey(itemId: string, slot: Slot, slotDate: string): string {
  return `${itemId}-${slot}-${slotDate}`;
}

export function getTodayInIst(): string {
  return getIstParts().date;
}

async function getGlobalConfig() {
  const result = await docClient.send(new GetCommand({
    TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
    Key: { itemId: 'GLOBAL' },
  }));

  return {
    globalKillswitch: result.Item?.globalKillswitch === true,
    lunchCutoffTime: isValidCutoff(result.Item?.lunchCutoffTime) ? result.Item.lunchCutoffTime : DEFAULT_LUNCH_CUTOFF,
    dinnerCutoffTime: isValidCutoff(result.Item?.dinnerCutoffTime) ? result.Item.dinnerCutoffTime : DEFAULT_DINNER_CUTOFF,
  };
}

async function getItemConfig(itemId: string) {
  const result = await docClient.send(new GetCommand({
    TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
    Key: { itemId },
  }));
  return result.Item;
}

async function getCountRecord(itemId: string, slot: Slot, slotDate: string) {
  const result = await docClient.send(new GetCommand({
    TableName: process.env.ITEM_ORDER_COUNT_TABLE!,
    Key: { countKey: getCountKey(itemId, slot, slotDate) },
  }));
  return result.Item;
}

export async function getAvailability(itemId: string, slot: Slot, slotDate = getTodayInIst()) {
  const [globalConfig, itemConfig, countRecord] = await Promise.all([
    getGlobalConfig(),
    getItemConfig(itemId),
    getCountRecord(itemId, slot, slotDate),
  ]);

  const cutoffTime = slot === 'lunch' ? globalConfig.lunchCutoffTime : globalConfig.dinnerCutoffTime;
  const cutoffPassed = getIstParts().minutes > cutoffToMinutes(cutoffTime);
  const limitKey = slot === 'lunch' ? 'lunchLimit' : 'dinnerLimit';
  const limit = itemConfig?.[limitKey] ?? null;
  const currentCount = countRecord?.currentCount || 0;
  const availableCount = countRecord?.availableCount ?? (typeof limit === 'number' ? limit : 0);
  const isAcceptingOrders = itemConfig?.isAcceptingOrders !== false;

  return {
    itemId,
    slot,
    slotDate,
    limit,
    currentCount,
    availableCount,
    isAcceptingOrders,
    globalKillswitch: globalConfig.globalKillswitch,
    cutoffTime,
    cutoffPassed,
    available: globalConfig.globalKillswitch !== true &&
      isAcceptingOrders &&
      !cutoffPassed &&
      typeof limit === 'number' &&
      availableCount > 0,
  };
}

export async function getTodayAvailability(itemId: string) {
  const slotDate = getTodayInIst();
  const [lunch, dinner] = await Promise.all([
    getAvailability(itemId, 'lunch', slotDate),
    getAvailability(itemId, 'dinner', slotDate),
  ]);

  return { lunch, dinner };
}
