import { PutCommand, GetCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from './utils';
import { getNextOrderId } from './order-counter';
import { blockInventory, checkAvailability } from './inventory-manager';

const SLOTS = ['saturday-lunch', 'saturday-dinner', 'sunday-lunch', 'sunday-dinner'];

const validateSlot = (slot: string): boolean => {
  return SLOTS.includes(slot);
};

const formatSlotDate = (slot: string): string => {
  const now = new Date();
  const currentDay = now.getDay();
  const targetDay = slot.startsWith('saturday') ? 6 : 0;
  let daysUntilTarget = targetDay - currentDay;
  if (daysUntilTarget <= 0) daysUntilTarget += 7;
  const slotDate = new Date(now);
  slotDate.setDate(now.getDate() + daysUntilTarget);
  slotDate.setHours(0, 0, 0, 0);
  return slotDate.toISOString().split('T')[0];
};

const isSameDay = (slot: string): boolean => {
  const slotDate = formatSlotDate(slot);
  const today = new Date().toISOString().split('T')[0];
  return slotDate === today;
};

export const createOrder = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { customerId, items, slot } = body;

    if (!slot || !validateSlot(slot)) {
      return createErrorResponse(400, 'Invalid delivery slot');
    }

    if (isSameDay(slot)) {
      return createErrorResponse(400, 'Cannot order for same day');
    }

    const slotDate = formatSlotDate(slot);
    
    // Fetch item details and check availability
    const itemIds = items.map((i: any) => i.itemId);
    const itemsResult = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [process.env.ITEM_TABLE!]: {
          Keys: itemIds.map((id: string) => ({ itemId: id }))
        }
      }
    }));

    const itemsMap = new Map(
      (itemsResult.Responses?.[process.env.ITEM_TABLE!] || []).map((item: any) => [item.itemId, item])
    );

    let totalAmount = 0;
    for (const orderItem of items) {
      const item = itemsMap.get(orderItem.itemId);
      if (!item) {
        return createErrorResponse(400, `Item ${orderItem.itemId} not found`);
      }
      if (!item.available) {
        return createErrorResponse(400, `Item ${item.name} is not available`);
      }
      
      const available = await checkAvailability(orderItem.itemId, slot, slotDate, orderItem.quantity);
      
      if (!available) {
        return createErrorResponse(400, `Item ${item.name} is sold out for this slot`);
      }
      
      totalAmount += item.price * orderItem.quantity;
    }

    const orderId = getNextOrderId();
    
    const order = {
      orderId,
      version: 1,
      customerId,
      items,
      slot,
      slotDate,
      totalAmount,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ORDER_TABLE,
      Item: order
    }));

    // Block inventory
    for (const orderItem of items) {
      await blockInventory(orderItem.itemId, slot, slotDate, orderItem.quantity, orderId);
    }

    return createSuccessResponse(201, order);
  } catch (error) {
    console.error('Error creating order:', error);
    return createErrorResponse(500, 'Failed to create order');
  }
};