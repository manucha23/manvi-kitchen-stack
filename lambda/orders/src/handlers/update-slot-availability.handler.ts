import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, validateUpdateSlotRequest } from '../utils';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

export const updateSlotAvailability = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const validationResult = validateUpdateSlotRequest(event.body);
    if ('statusCode' in validationResult) {
      return validationResult;
    }

    const { itemId, slot, quantity } = validationResult;

    // Get existing config
    const configResult = await docClient.send(new GetCommand({
      TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
      Key: { itemId }
    }));

    const config = configResult.Item || { itemId };

    // Update the appropriate limit based on slot
    if (slot === 'lunch') {
      config.lunchLimit = quantity;
    } else if (slot === 'dinner') {
      config.dinnerLimit = quantity;
    } else {
      return createErrorResponse(400, 'Invalid slot. Must be lunch or dinner');
    }

    config.updatedAt = new Date().toISOString();

    // Save updated config
    await docClient.send(new PutCommand({
      TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
      Item: config
    }));

    return createSuccessResponse(200, {
      message: 'Order limit updated',
      itemId,
      slot,
      quantity
    });
  } catch (error) {
    console.error('Error updating order limit:', error);
    return createErrorResponse(500, 'Failed to update order limit');
  }
};
