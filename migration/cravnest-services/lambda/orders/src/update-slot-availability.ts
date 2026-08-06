import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { updateSlotQuantity } from './inventory-manager';
import { createSuccessResponse, createErrorResponse } from './utils';

export const updateSlotAvailability = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { itemId, slot, date, quantity } = body;

    if (!itemId || !slot || !date || quantity === undefined) {
      return createErrorResponse(400, 'Missing required fields: itemId, slot, date, quantity');
    }

    if (quantity < 0) {
      return createErrorResponse(400, 'Quantity must be non-negative');
    }

    await updateSlotQuantity(itemId, slot, date, quantity);

    return createSuccessResponse(200, {
      message: 'Slot availability updated',
      itemId,
      slot,
      date,
      quantity
    });
  } catch (error) {
    console.error('Error updating slot availability:', error);
    return createErrorResponse(500, 'Failed to update slot availability');
  }
};
