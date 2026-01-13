import { GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { docClient } from '../utils';

const sfnClient = new SFNClient({});

export const blockInventory = async (itemId: string, slot: string, date: string, quantity: number, orderId: string) => {
  const slotKey = `${itemId}#${slot}#${date}`;
  console.log('Blocking inventory:', { itemId, slot, date, quantity, orderId });

  // Reduce available quantity
  await docClient.send(new UpdateCommand({
    TableName: process.env.SLOT_AVAILABILITY_TABLE,
    Key: { slotKey },
    UpdateExpression: 'SET availableQuantity = availableQuantity - :qty',
    ExpressionAttributeValues: { ':qty': quantity },
    ConditionExpression: 'availableQuantity >= :qty'
  }));
};

// Start Step Function to auto-release after 15 minutes if not confirmed
export const triggerStateMachine = async (orderId: string) => {
  if (process.env.CLEANUP_STATE_MACHINE_ARN) {
    await sfnClient.send(new StartExecutionCommand({
      stateMachineArn: process.env.CLEANUP_STATE_MACHINE_ARN,
      name: `${orderId}-${Date.now()}`,
      input: JSON.stringify({ orderId})
    }));
  }
};

export const confirmInventory = async (orderId: string) => {
  // No-op: Step Function will check order status
  console.log(`Order ${orderId} confirmed, Step Function will handle cleanup`);
};

export const releaseInventory = async (orderId: string) => {
  // Get order to find items
  const orderResult = await docClient.send(new QueryCommand({
    TableName: process.env.ORDER_TABLE,
    KeyConditionExpression: 'orderId = :orderId',
    ExpressionAttributeValues: { ':orderId': orderId }
  }));

  const order = orderResult.Items?.[0];
  if (!order) return;

  // Restore quantity for each item
  for (const item of order.items || []) {
    const slotKey = `${item.itemId}#${order.slot}#${order.slotDate}`;
    await docClient.send(new UpdateCommand({
      TableName: process.env.SLOT_AVAILABILITY_TABLE,
      Key: { slotKey },
      UpdateExpression: 'SET availableQuantity = availableQuantity + :qty',
      ExpressionAttributeValues: { ':qty': item.quantity }
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
