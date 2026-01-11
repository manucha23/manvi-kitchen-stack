import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from '../utils';

export const getOrderHistory = async (orderId: string): Promise<APIGatewayProxyResult> => {
  try {
    // Validate orderId format (6 alphanumeric characters)
    if (!/^[A-Z0-9]{6}$/.test(orderId)) {
      return createErrorResponse(400, 'Invalid orderId format');
    }

    const result = await docClient.send(new QueryCommand({
      TableName: process.env.ORDER_HISTORY_TABLE,
      KeyConditionExpression: 'orderId = :orderId',
      ExpressionAttributeValues: { ':orderId': orderId },
      ScanIndexForward: false // Latest first
    }));

    return createSuccessResponse(200, {
      orderId,
      history: result.Items || []
    });
  } catch (error) {
    console.error('Error getting order history:', {
      orderId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return createErrorResponse(500, 'Failed to get order history');
  }
};
