import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { updateSlotQuantity } from '../services';
import { createSuccessResponse, createErrorResponse, validateUpdateSlotRequest } from '../utils';

export const updateSlotAvailability = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const validationResult = validateUpdateSlotRequest(event.body);
    if ('statusCode' in validationResult) {
      return validationResult;
    }

    const { itemId, slot, date, quantity } = validationResult;

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
