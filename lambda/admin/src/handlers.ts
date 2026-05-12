import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, validateSetLimitsRequest } from './utils';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

export const setOrderLimits = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const validationResult = validateSetLimitsRequest(event.body);
    if ('statusCode' in validationResult) {
      return createErrorResponse(validationResult.statusCode, validationResult.message);
    }

    const { itemId, lunchLimit, dinnerLimit, itemName, lunchCutoffTime, dinnerCutoffTime } = validationResult;

    // Get existing config
    const existingResult = await docClient.send(new GetCommand({
      TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
      Key: { itemId }
    }));

    const config = existingResult.Item || { itemId };

    // Update limits
    if (lunchLimit !== undefined) {
      config.lunchLimit = lunchLimit;
    }
    if (dinnerLimit !== undefined) {
      config.dinnerLimit = dinnerLimit;
    }
    if (itemName !== undefined) {
      config.itemName = itemName;
    }
    if (lunchCutoffTime !== undefined) {
      config.lunchCutoffTime = lunchCutoffTime;
    }
    if (dinnerCutoffTime !== undefined) {
      config.dinnerCutoffTime = dinnerCutoffTime;
    }

    config.updatedAt = new Date().toISOString();
    if (itemId !== 'GLOBAL') {
      config.isAcceptingOrders = config.isAcceptingOrders !== false; // Default to true if not set
    }

    await docClient.send(new PutCommand({
      TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
      Item: config
    }));

    return createSuccessResponse(200, {
      message: 'Order limits updated successfully',
      config
    });
  } catch (error) {
    console.error('Error setting order limits:', error);
    return createErrorResponse(500, 'Failed to set order limits');
  }
};
