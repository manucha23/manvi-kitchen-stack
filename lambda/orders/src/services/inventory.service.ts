import { GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../utils';

/**
 * Get the count key for an item-slot-date combination
 * Format: itemId-slot-YYYY-MM-DD
 */
function getCountKey(itemId: string, slot: string, date: string): string {
  return `${itemId}-${slot}-${date}`;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Check if a date string represents today
 */
function isToday(dateStr: string): boolean {
  return dateStr === getTodayDate();
}

/**
 * Get or initialize order count for an item-slot-date, with lazy reset
 */
export const getOrInitializeOrderCount = async (itemId: string, slot: string, date: string): Promise<{ currentCount: number, countKey: string }> => {
  const countKey = getCountKey(itemId, slot, date);
  
  const result = await docClient.send(new GetCommand({
    TableName: process.env.ITEM_ORDER_COUNT_TABLE!,
    Key: { countKey }
  }));

  if (!result.Item) {
    // First order of this item-slot-date, initialize with 0
    return { currentCount: 0, countKey };
  }

  // Check if we need to lazy reset (if item is from previous day)
  const lastResetTimestamp = result.Item.lastResetTimestamp;
  if (lastResetTimestamp) {
    const lastResetDate = lastResetTimestamp.split('T')[0];
    if (lastResetDate < date) {
      return { currentCount: 0, countKey };
    }
  }

  return { currentCount: result.Item.currentCount || 0, countKey };
};

/**
 * Increment order count when an order is placed
 */
export const incrementOrderCount = async (itemId: string, slot: string, date: string, quantity: number): Promise<void> => {
  const countKey = getCountKey(itemId, slot, date);
  const now = new Date().toISOString();

  await docClient.send(new UpdateCommand({
    TableName: process.env.ITEM_ORDER_COUNT_TABLE!,
    Key: { countKey },
    UpdateExpression: 'SET currentCount = if_not_exists(currentCount, :zero) + :qty, lastResetTimestamp = :now, itemId = :itemId, #date = :date, updatedAt = :now',
    ExpressionAttributeNames: {
      '#date': 'date'
    },
    ExpressionAttributeValues: {
      ':qty': quantity,
      ':zero': 0,
      ':now': now,
      ':itemId': itemId,
      ':date': date
    }
  }));
};

/**
 * Decrement order count when an order is cancelled
 */
export const decrementOrderCount = async (itemId: string, slot: string, date: string, quantity: number): Promise<void> => {
  const countKey = getCountKey(itemId, slot, date);

  await docClient.send(new UpdateCommand({
    TableName: process.env.ITEM_ORDER_COUNT_TABLE!,
    Key: { countKey },
    UpdateExpression: 'SET currentCount = if_not_exists(currentCount, :zero) - :qty',
    ExpressionAttributeValues: {
      ':qty': quantity,
      ':zero': 0
    }
  }));
};

/**
 * Check if item is accepting orders and has availability
 */
export const checkOrderAvailability = async (itemId: string, slot: string, date: string, requestedQty: number): Promise<{ available: boolean, reason?: string }> => {
  const summarySlot = slot.toLowerCase().includes('lunch') ? 'lunch' : 'dinner';

  // Get configuration for this item and global config
  const [itemConfigResult, globalConfigResult] = await Promise.all([
    docClient.send(new GetCommand({
      TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
      Key: { itemId }
    })),
    docClient.send(new GetCommand({
      TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
      Key: { itemId: 'GLOBAL' }
    }))
  ]);

  const itemConfig = itemConfigResult.Item;
  const globalConfig = globalConfigResult.Item;

  // Check global killswitch first
  if (globalConfig?.globalKillswitch === true) {
    return { available: false, reason: 'Order acceptance is temporarily disabled' };
  }

  // Check item-specific killswitch
  if (itemConfig?.isAcceptingOrders === false) {
    return { available: false, reason: `${itemConfig.itemName || 'This item'} is not accepting orders at the moment` };
  }

  const limitKey = summarySlot === 'lunch' ? 'lunchLimit' : 'dinnerLimit';
  const limit = itemConfig?.[limitKey];

  if (limit === undefined || limit === null) {
    return { available: false, reason: `No order limit configured for this item` };
  }

  // Get current count
  const { currentCount } = await getOrInitializeOrderCount(itemId, summarySlot, date);
  
  // Check if adding this quantity would exceed limit
  if (currentCount + requestedQty > limit) {
    const remaining = Math.max(0, limit - currentCount);
    return { 
      available: false, 
      reason: `Only ${remaining} ${remaining === 1 ? 'order' : 'orders'} available for this item in ${summarySlot}` 
    };
  }

  return { available: true };
};
