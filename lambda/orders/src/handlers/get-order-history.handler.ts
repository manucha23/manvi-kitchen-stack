import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, getCallerContext } from '../utils';

export const getOrderHistory = async (orderId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!/^[A-Z0-9]{6}$/.test(orderId)) {
      return createErrorResponse(400, 'Invalid orderId format');
    }

    const caller = getCallerContext(event);
    if (!caller.isAdminRoute || !caller.isAdmin) {
      return createErrorResponse(403, 'Admin access is required to view order history');
    }

    const result = await docClient.send(new QueryCommand({
      TableName: process.env.ORDER_HISTORY_TABLE,
      KeyConditionExpression: 'orderId = :orderId',
      ExpressionAttributeValues: { ':orderId': orderId },
      ScanIndexForward: false
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
