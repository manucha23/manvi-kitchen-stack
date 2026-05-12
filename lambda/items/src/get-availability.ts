import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createErrorResponse, createSuccessResponse } from './utils';
import { getAvailability, Slot } from './availability';

export const getItemAvailability = async (itemId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const slot = event.queryStringParameters?.slot as Slot | undefined;

  if (slot !== 'lunch' && slot !== 'dinner') {
    return createErrorResponse(400, 'slot query parameter must be lunch or dinner');
  }

  try {
    return createSuccessResponse(200, await getAvailability(itemId, slot));
  } catch (error) {
    console.error('Error getting item availability:', error);
    return createErrorResponse(500, 'Failed to get item availability');
  }
};
