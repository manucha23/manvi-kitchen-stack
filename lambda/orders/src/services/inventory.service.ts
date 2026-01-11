import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../utils';

export const blockInventory = async (itemId: string, slot: string, date: string, quantity: number, orderId: string) => {
  const slotKey = `${itemId}#${slot}#${date}`;
  const blockId = `${orderId}#${itemId}`;
  const ttl = Math.floor(Date.now() / 1000) + 900; // 15 minutes

  // Reduce available quantity
  await docClient.send(new UpdateCommand({
    TableName: process.env.SLOT_AVAILABILITY_TABLE,
    Key: { slotKey },
    UpdateExpression: 'SET availableQuantity = availableQuantity - :qty',
    ExpressionAttributeValues: { ':qty': quantity },
    ConditionExpression: 'availableQuantity >= :qty'
  }));

  // Track the block for potential reversal
  await docClient.send(new PutCommand({
    TableName: process.env.INVENTORY_TABLE,
    Item: {
      slotKey,
      blockId,
      orderId,
      itemId,
      slot,
      date,
      quantity,
      status: 'BLOCKED',
      blockedAt: new Date().toISOString(),
      ttl
    }
  }));
};

export const confirmInventory = async (orderId: string) => {
  const result = await docClient.send(new QueryCommand({
    TableName: process.env.INVENTORY_TABLE,
    IndexName: 'orderId-index',
    KeyConditionExpression: 'orderId = :orderId',
    FilterExpression: '#status = :blocked',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':orderId': orderId, ':blocked': 'BLOCKED' }
  }));

  for (const item of result.Items || []) {
    // Simply delete the block - no need to keep confirmed records
    await docClient.send(new DeleteCommand({
      TableName: process.env.INVENTORY_TABLE,
      Key: { slotKey: item.slotKey, blockId: item.blockId }
    }));
  }
};

export const releaseInventory = async (orderId: string) => {
  const result = await docClient.send(new QueryCommand({
    TableName: process.env.INVENTORY_TABLE,
    IndexName: 'orderId-index',
    KeyConditionExpression: 'orderId = :orderId',
    ExpressionAttributeValues: { ':orderId': orderId }
  }));

  for (const item of result.Items || []) {
    // Validate item data before using
    if (!item.itemId || !item.slot || !item.date || typeof item.quantity !== 'number') {
      console.error('Invalid inventory item data:', item);
      continue;
    }

    // Restore quantity
    const slotKey = `${item.itemId}#${item.slot}#${item.date}`;
    await docClient.send(new UpdateCommand({
      TableName: process.env.SLOT_AVAILABILITY_TABLE,
      Key: { slotKey },
      UpdateExpression: 'SET availableQuantity = availableQuantity + :qty',
      ExpressionAttributeValues: { ':qty': item.quantity }
    }));

    // Delete block record - validate slotKey and blockId exist and are strings
    if (!item.slotKey || !item.blockId || typeof item.slotKey !== 'string' || typeof item.blockId !== 'string') {
      console.error('Missing or invalid slotKey/blockId for deletion:', item);
      continue;
    }
    await docClient.send(new DeleteCommand({
      TableName: process.env.INVENTORY_TABLE,
      Key: { slotKey: item.slotKey, blockId: item.blockId }
    }));
  }
};

export const checkAvailability = async (itemId: string, slot: string, date: string, requestedQty: number) => {
  const slotKey = `${itemId}#${slot}#${date}`;
  
  const result = await docClient.send(new GetCommand({
    TableName: process.env.SLOT_AVAILABILITY_TABLE,
    Key: { slotKey }
  }));

  if (!result.Item) {
    return false; // Slot not opened yet
  }

  return result.Item.availableQuantity >= requestedQty;
};

export const updateSlotQuantity = async (itemId: string, slot: string, date: string, newQuantity: number) => {
  const slotKey = `${itemId}#${slot}#${date}`;
  
  await docClient.send(new UpdateCommand({
    TableName: process.env.SLOT_AVAILABILITY_TABLE,
    Key: { slotKey },
    UpdateExpression: 'SET availableQuantity = :qty, totalQuantity = :qty, updatedAt = :now',
    ExpressionAttributeValues: {
      ':qty': newQuantity,
      ':now': new Date().toISOString()
    }
  }));
};
