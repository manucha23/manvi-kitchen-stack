import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from './utils';

const getSlotAvailability = async (itemId: string) => {
  const slots = ['saturday-lunch', 'saturday-dinner', 'sunday-lunch', 'sunday-dinner'];
  const availability: any = {};
  
  for (const slot of slots) {
    const slotDate = getNextSlotDate(slot);
    const slotKey = `${itemId}#${slot}#${slotDate}`;
    
    const result = await docClient.send(new ScanCommand({
      TableName: process.env.SLOT_AVAILABILITY_TABLE!,
      FilterExpression: 'slotKey = :slotKey',
      ExpressionAttributeValues: { ':slotKey': slotKey }
    }));
    
    const qty = result.Items?.[0]?.availableQuantity || 0;
    availability[slot] = {
      quantity: qty,
      isAvailable: qty > 0
    };
  }
  
  return availability;
};

const getNextSlotDate = (slot: string): string => {
  const now = new Date();
  const currentDay = now.getDay();
  let targetDay = slot.startsWith('saturday') ? 6 : 0;
  let daysUntilTarget = targetDay - currentDay;
  if (daysUntilTarget <= 0) daysUntilTarget += 7;
  const slotDate = new Date(now);
  slotDate.setDate(now.getDate() + daysUntilTarget);
  return slotDate.toISOString().split('T')[0];
};

export const listItems = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: process.env.ITEM_TABLE
    }));

    const items = await Promise.all((result.Items || []).map(async (item) => {
      const slotAvailability = await getSlotAvailability(item.itemId);
      return { ...item, slotAvailability };
    }));

    return createSuccessResponse(200, { items });
  } catch (error) {
    console.error('Error listing items:', error);
    return createErrorResponse(500, 'Failed to list items');
  }
};