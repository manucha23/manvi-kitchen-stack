import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, withOrderVersion } from '../utils';
import { Order } from '../models';

export const getOrder = async (orderId: string): Promise<APIGatewayProxyResult> => {
  try {
    // Validate orderId format (6 alphanumeric characters)
    if (!/^[A-Z0-9]{6}$/.test(orderId)) {
      return createErrorResponse(400, 'Invalid orderId format');
    }

    const result = await docClient.send(new GetCommand({
      TableName: process.env.ORDER_TABLE,
      Key: { orderId }
    }));

    if (!result.Item) {
      return createErrorResponse(404, 'Order not found');
    }

    const order = withOrderVersion(result.Item as Order);
    return createSuccessResponse(200, order);
  } catch (error) {
    console.error('Error getting order:', {
      orderId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return createErrorResponse(500, 'Failed to get order');
  }
};
