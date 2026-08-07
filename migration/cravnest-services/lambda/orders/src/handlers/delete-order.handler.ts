import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createErrorResponse, getCallerContext } from '../utils';
import { OrderStatus } from '../models';

export const deleteOrder = async (orderId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
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

    if (caller.isCustomerRoute && result.Item.orderedBy !== caller.principalId) {
      return createErrorResponse(404, 'Order not found');
    }

    const status = result.Item.status;
    if (![OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED, OrderStatus.CREATED].includes(status)) {
      return createErrorResponse(400, `Cannot delete order with status: ${status}. Only pending or confirmed orders can be deleted.`);
    }

    const conditionExpression = caller.isCustomerRoute
      ? 'attribute_exists(orderId) AND orderedBy = :orderedBy'
      : 'attribute_exists(orderId)';

    await docClient.send(new DeleteCommand({
      TableName: process.env.ORDER_TABLE,
      Key: { orderId },
      ConditionExpression: conditionExpression,
      ExpressionAttributeValues: caller.isCustomerRoute ? { ':orderedBy': caller.principalId } : undefined,
    }));

    return {
      statusCode: 204,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: ''
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return createErrorResponse(404, 'Order not found');
    }
    console.error('Error deleting order:', error);
    return createErrorResponse(500, 'Failed to delete order');
  }
};
