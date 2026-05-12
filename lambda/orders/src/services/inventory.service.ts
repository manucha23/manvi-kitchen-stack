import { GetCommand, PutCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../utils';
import { Slot } from '../models';

const DEFAULT_LUNCH_CUTOFF = '13:00';
const DEFAULT_DINNER_CUTOFF = '20:00';
const IST_TIME_ZONE = 'Asia/Kolkata';

export interface CapacityOrderItem {
  itemId: string;
  quantity: number;
}

export interface AvailabilityResponse {
  itemId: string;
  slot: Slot;
  slotDate: string;
  limit: number | null;
  currentCount: number;
  availableCount: number;
  isAcceptingOrders: boolean;
  globalKillswitch: boolean;
  cutoffTime: string;
  cutoffPassed: boolean;
  available: boolean;
  reason?: string;
}

interface GlobalCapacityConfig {
  globalKillswitch: boolean;
  lunchCutoffTime: string;
  dinnerCutoffTime: string;
}

function getCountKey(itemId: string, slot: string, date: string): string {
  return `${itemId}-${slot}-${date}`;
}

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
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));

  return {
    date: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute,
  };
}

function cutoffToMinutes(cutoff: string): number {
  const [hour, minute] = cutoff.split(':').map(Number);
  return hour * 60 + minute;
}

function getTtlForSlotDate(slotDate: string): number {
  const [year, month, day] = slotDate.split('-').map(Number);
  const utcMillis = Date.UTC(year, month - 1, day, 18, 30, 0); // IST midnight at end of slot date
  return Math.floor((utcMillis + 48 * 60 * 60 * 1000) / 1000);
}

function aggregateItems(items: CapacityOrderItem[]): CapacityOrderItem[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.itemId, (totals.get(item.itemId) || 0) + item.quantity);
  }
  return Array.from(totals.entries()).map(([itemId, quantity]) => ({ itemId, quantity }));
}

export const getTodayInIst = (): string => getIstParts().date;

export const getGlobalCapacityConfig = async (): Promise<GlobalCapacityConfig> => {
  const result = await docClient.send(new GetCommand({
    TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
    Key: { itemId: 'GLOBAL' },
  }));

  return {
    globalKillswitch: result.Item?.globalKillswitch === true,
    lunchCutoffTime: isValidCutoff(result.Item?.lunchCutoffTime) ? result.Item.lunchCutoffTime : DEFAULT_LUNCH_CUTOFF,
    dinnerCutoffTime: isValidCutoff(result.Item?.dinnerCutoffTime) ? result.Item.dinnerCutoffTime : DEFAULT_DINNER_CUTOFF,
  };
};

export const validateSameDaySlotAndCutoff = async (
  slot: Slot,
  slotDate: string,
): Promise<{ valid: true; cutoffTime: string; cutoffPassed: boolean } | { valid: false; reason: string; cutoffTime?: string; cutoffPassed?: boolean }> => {
  if (![Slot.LUNCH, Slot.DINNER].includes(slot)) {
    return { valid: false, reason: `Invalid slot. Must be one of: ${Slot.LUNCH}, ${Slot.DINNER}` };
  }

  const istNow = getIstParts();
  if (slotDate !== istNow.date) {
    return { valid: false, reason: 'Orders are accepted for today only' };
  }

  const globalConfig = await getGlobalCapacityConfig();
  const cutoffTime = slot === Slot.LUNCH ? globalConfig.lunchCutoffTime : globalConfig.dinnerCutoffTime;
  const cutoffPassed = istNow.minutes > cutoffToMinutes(cutoffTime);
  if (cutoffPassed) {
    return {
      valid: false,
      reason: slot === Slot.LUNCH ? 'Lunch orders are closed for today' : 'Dinner orders are closed for today',
      cutoffTime,
      cutoffPassed,
    };
  }

  return { valid: true, cutoffTime, cutoffPassed };
};

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

export const getAvailability = async (itemId: string, slot: Slot, slotDate = getTodayInIst()): Promise<AvailabilityResponse> => {
  const [globalConfig, itemConfig, cutoffValidation] = await Promise.all([
    getGlobalCapacityConfig(),
    getItemConfig(itemId),
    validateSameDaySlotAndCutoff(slot, slotDate),
  ]);

  const cutoffTime = cutoffValidation.cutoffTime || (slot === Slot.LUNCH ? globalConfig.lunchCutoffTime : globalConfig.dinnerCutoffTime);
  const cutoffPassed = cutoffValidation.cutoffPassed === true;
  const isAcceptingOrders = itemConfig?.isAcceptingOrders !== false;
  const limitKey = slot === Slot.LUNCH ? 'lunchLimit' : 'dinnerLimit';
  const limit = itemConfig?.[limitKey] ?? null;

  let currentCount = 0;
  let availableCount = typeof limit === 'number' ? limit : 0;
  const countRecord = await getCountRecord(itemId, slot, slotDate);
  if (countRecord) {
    currentCount = countRecord.currentCount || 0;
    availableCount = countRecord.availableCount ?? Math.max(0, (typeof limit === 'number' ? limit : 0) - currentCount);
  }

  let reason: string | undefined;
  if (!cutoffValidation.valid) reason = cutoffValidation.reason;
  else if (globalConfig.globalKillswitch) reason = 'Order acceptance is temporarily disabled';
  else if (!isAcceptingOrders) reason = `${itemConfig?.itemName || 'This item'} is not accepting orders at the moment`;
  else if (typeof limit !== 'number') reason = 'No order limit configured for this item';
  else if (availableCount <= 0) reason = `Only 0 orders available for this item in ${slot}`;

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
    available: !reason,
    reason,
  };
};

export const checkOrderAvailability = async (
  itemId: string,
  slot: Slot,
  date: string,
  requestedQty: number,
): Promise<{ available: boolean; reason?: string }> => {
  const availability = await getAvailability(itemId, slot, date);

  if (!availability.available) {
    return { available: false, reason: availability.reason };
  }

  if (availability.availableCount < requestedQty) {
    return {
      available: false,
      reason: `Only ${availability.availableCount} ${availability.availableCount === 1 ? 'order' : 'orders'} available for this item in ${slot}`,
    };
  }

  return { available: true };
};

async function initializeCountRecord(itemId: string, slot: Slot, slotDate: string, limit: number): Promise<void> {
  const now = new Date().toISOString();
  await docClient.send(new PutCommand({
    TableName: process.env.ITEM_ORDER_COUNT_TABLE!,
    Item: {
      countKey: getCountKey(itemId, slot, slotDate),
      itemId,
      slot,
      date: slotDate,
      currentCount: 0,
      availableCount: limit,
      lastResetTimestamp: now,
      updatedAt: now,
      ttl: getTtlForSlotDate(slotDate),
    },
    ConditionExpression: 'attribute_not_exists(countKey)',
  })).catch((error) => {
    if (error?.name !== 'ConditionalCheckFailedException') throw error;
  });
}

export const reserveCapacityForOrderItems = async (items: CapacityOrderItem[], slot: Slot, slotDate: string): Promise<void> => {
  const aggregatedItems = aggregateItems(items);
  const now = new Date().toISOString();

  for (const item of aggregatedItems) {
    const availability = await getAvailability(item.itemId, slot, slotDate);
    if (!availability.available || typeof availability.limit !== 'number') {
      throw new Error(availability.reason || 'Item is not available');
    }
    if (availability.availableCount < item.quantity) {
      throw new Error(`Only ${availability.availableCount} ${availability.availableCount === 1 ? 'order' : 'orders'} available for this item in ${slot}`);
    }
    await initializeCountRecord(item.itemId, slot, slotDate, availability.limit);
  }

  await docClient.send(new TransactWriteCommand({
    TransactItems: aggregatedItems.map((item) => ({
      Update: {
        TableName: process.env.ITEM_ORDER_COUNT_TABLE!,
        Key: { countKey: getCountKey(item.itemId, slot, slotDate) },
        UpdateExpression: 'SET currentCount = currentCount + :qty, availableCount = availableCount - :qty, updatedAt = :now, lastResetTimestamp = :now, itemId = :itemId, slot = :slot, #date = :date, #ttl = :ttl',
        ConditionExpression: 'availableCount >= :qty',
        ExpressionAttributeNames: {
          '#date': 'date',
          '#ttl': 'ttl',
        },
        ExpressionAttributeValues: {
          ':qty': item.quantity,
          ':now': now,
          ':itemId': item.itemId,
          ':slot': slot,
          ':date': slotDate,
          ':ttl': getTtlForSlotDate(slotDate),
        },
      },
    })),
  }));
};

export const releaseCapacityForOrderItems = async (items: CapacityOrderItem[], slot: Slot, slotDate: string): Promise<void> => {
  const aggregatedItems = aggregateItems(items);
  const now = new Date().toISOString();

  await docClient.send(new TransactWriteCommand({
    TransactItems: aggregatedItems.map((item) => ({
      Update: {
        TableName: process.env.ITEM_ORDER_COUNT_TABLE!,
        Key: { countKey: getCountKey(item.itemId, slot, slotDate) },
        UpdateExpression: 'SET currentCount = currentCount - :qty, availableCount = availableCount + :qty, updatedAt = :now',
        ConditionExpression: 'attribute_exists(countKey) AND currentCount >= :qty',
        ExpressionAttributeValues: {
          ':qty': item.quantity,
          ':now': now,
        },
      },
    })),
  }));
};

export const incrementOrderCount = reserveCapacityForOrderItems;
export const decrementOrderCount = releaseCapacityForOrderItems;
