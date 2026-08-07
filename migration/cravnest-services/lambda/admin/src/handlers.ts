import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, validateSetLimitsRequest } from './utils';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

export const setOrderLimits = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const validationResult = validateSetLimitsRequest(event.body);
    if ('statusCode' in validationResult) {
      return createErrorResponse(validationResult.statusCode, validationResult.message);
    }

    const { itemId, openTime, closeTime, deliveryPromiseMinutes, isAcceptingOrders } = validationResult;

    // Get existing config
    const existingResult = await docClient.send(new GetCommand({
      TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
      Key: { itemId }
    }));

    const config = existingResult.Item || { itemId };

    if (openTime !== undefined) {
      config.openTime = openTime;
    }
    if (closeTime !== undefined) {
      config.closeTime = closeTime;
    }
    if (deliveryPromiseMinutes !== undefined) {
      config.deliveryPromiseMinutes = deliveryPromiseMinutes;
    }
    if (isAcceptingOrders !== undefined) {
      config.isAcceptingOrders = isAcceptingOrders;
    }

    config.updatedAt = new Date().toISOString();

    await docClient.send(new PutCommand({
      TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
      Item: config
    }));

    return createSuccessResponse(200, {
      message: 'Ordering configuration updated successfully',
      config
    });
  } catch (error) {
    console.error('Error setting ordering configuration:', error);
    return createErrorResponse(500, 'Failed to set ordering configuration');
  }
};
