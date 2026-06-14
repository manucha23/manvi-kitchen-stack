import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, withOrderVersion, getCallerContext } from '../utils';
import { Order } from '../models';

export const getOrder = async (orderId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!/^[A-Z0-9]{6}$/.test(orderId)) {
      return createErrorResponse(400, 'Invalid orderId format');
    }

    const caller = getCallerContext(event);
    if (caller.isAdminRoute && !caller.isAdmin) {
      return createErrorResponse(403, 'Admin access is required');
    }

    const result = await docClient.send(new GetCommand({
      TableName: process.env.ORDER_TABLE,
      Key: { orderId }
    }));

    if (!result.Item) {
      return createErrorResponse(404, 'Order not found');
    }

    const order = withOrderVersion(result.Item as Order);
    if (caller.isCustomerRoute && order.orderedBy !== caller.principalId) {
      return createErrorResponse(404, 'Order not found');
    }

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
