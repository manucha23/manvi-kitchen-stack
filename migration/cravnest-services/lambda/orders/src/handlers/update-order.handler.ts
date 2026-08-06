import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, validateUpdateOrderRequest, getCallerContext } from '../utils';
import { OrderStatus } from '../models';

const VALID_STATUSES = Object.values(OrderStatus);

export const updateOrder = async (orderId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!/^[A-Z0-9]{6}$/.test(orderId)) {
      return createErrorResponse(400, 'Invalid orderId format');
    }

    const validationResult = validateUpdateOrderRequest(event.body);
    if ('statusCode' in validationResult) {
      return validationResult;
    }

    const body = validationResult;
    const caller = getCallerContext(event);
    if (caller.isAdminRoute && !caller.isAdmin) {
      return createErrorResponse(403, 'Admin access is required');
    }
    if (caller.isCustomerRoute && body.status && body.status !== OrderStatus.CANCELLED) {
      return createErrorResponse(403, 'Customers can only cancel their own orders');
    }

    const updateExpression: string[] = [];
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};
    
    // Update order status
    if (body.status) {
      if (!VALID_STATUSES.includes(body.status as OrderStatus)) {
        return createErrorResponse(400, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
      }
      updateExpression.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = body.status;
    }

    // Update instructions
    if (body.instructions !== undefined) {
      updateExpression.push('instructions = :instructions');
      expressionAttributeValues[':instructions'] = body.instructions;
    }

    if (updateExpression.length === 0) {
      return createErrorResponse(400, 'No valid fields to update');
    }

    updateExpression.push('updatedAt = :updatedAt');
    updateExpression.push('#version = :nextVersion');
    expressionAttributeNames['#version'] = 'version';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    expressionAttributeValues[':version'] = body.version;
    expressionAttributeValues[':nextVersion'] = body.version + 1;
    expressionAttributeValues[':initialVersion'] = 1;
    if (caller.isCustomerRoute) {
      expressionAttributeNames['#status'] = 'status';
    }

    const result = await docClient.send(new UpdateCommand({
      TableName: process.env.ORDER_TABLE,
      Key: { orderId },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ConditionExpression: caller.isCustomerRoute
        ? 'attribute_exists(orderId) AND orderedBy = :orderedBy AND (#status IN (:pendingPaymentStatus, :confirmedStatus, :createdStatus)) AND ((attribute_exists(#version) AND #version = :version) OR (attribute_not_exists(#version) AND :version = :initialVersion))'
        : 'attribute_exists(orderId) AND ((attribute_exists(#version) AND #version = :version) OR (attribute_not_exists(#version) AND :version = :initialVersion))',
      ExpressionAttributeValues: caller.isCustomerRoute ? {
        ...expressionAttributeValues,
        ':orderedBy': caller.principalId,
        ':pendingPaymentStatus': OrderStatus.PENDING_PAYMENT,
        ':confirmedStatus': OrderStatus.CONFIRMED,
        ':createdStatus': OrderStatus.CREATED,
      } : expressionAttributeValues,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ReturnValues: 'ALL_NEW'
    }));

    return createSuccessResponse(200, result.Attributes);
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'Order not found or version mismatch. Refresh order and retry.');
    }
    console.error('Error updating order:', error);
    return createErrorResponse(500, 'Failed to update order');
  }
};
