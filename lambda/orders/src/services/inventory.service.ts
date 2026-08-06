import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../utils';

const DEFAULT_OPEN_TIME = '11:00';
const DEFAULT_CLOSE_TIME = '21:00';
const DEFAULT_DELIVERY_PROMISE_MINUTES = 60;
const IST_TIME_ZONE = 'Asia/Kolkata';

export interface OrderingConfig {
  isAcceptingOrders: boolean;
  openTime: string;
  closeTime: string;
  deliveryPromiseMinutes: number;
}

export interface OrderingWindowValidation {
  valid: boolean;
  reason?: string;
  config: OrderingConfig;
  promisedDeliveryAt?: string;
}

function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
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

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export const getOrderingConfig = async (): Promise<OrderingConfig> => {
  const result = await docClient.send(new GetCommand({
    TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
    Key: { itemId: 'GLOBAL' },
  }));

  const deliveryPromiseMinutes = Number(result.Item?.deliveryPromiseMinutes);

  return {
    isAcceptingOrders: result.Item?.isAcceptingOrders !== false && result.Item?.globalKillswitch !== true,
    openTime: isValidTime(result.Item?.openTime) ? result.Item.openTime : DEFAULT_OPEN_TIME,
    closeTime: isValidTime(result.Item?.closeTime) ? result.Item.closeTime : DEFAULT_CLOSE_TIME,
    deliveryPromiseMinutes: Number.isInteger(deliveryPromiseMinutes) && deliveryPromiseMinutes > 0
      ? deliveryPromiseMinutes
      : DEFAULT_DELIVERY_PROMISE_MINUTES,
  };
};

export const getPromisedDeliveryAt = (promiseMinutes: number, date = new Date()): string => {
  return new Date(date.getTime() + promiseMinutes * 60 * 1000).toISOString();
};

export const validateOrderingWindow = async (date = new Date()): Promise<OrderingWindowValidation> => {
  const config = await getOrderingConfig();
  if (!config.isAcceptingOrders) {
    return { valid: false, reason: 'Ordering is temporarily disabled', config };
  }

  const now = getIstParts(date);
  const openMinutes = timeToMinutes(config.openTime);
  const closeMinutes = timeToMinutes(config.closeTime);
  const withinWindow = openMinutes <= closeMinutes
    ? now.minutes >= openMinutes && now.minutes <= closeMinutes
    : now.minutes >= openMinutes || now.minutes <= closeMinutes;

  if (!withinWindow) {
    return {
      valid: false,
      reason: `Orders are accepted between ${config.openTime} and ${config.closeTime} IST`,
      config,
    };
  }

  return {
    valid: true,
    config,
    promisedDeliveryAt: getPromisedDeliveryAt(config.deliveryPromiseMinutes, date),
  };
};
