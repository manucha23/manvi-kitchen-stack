import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, validateUpdateOrderRequest } from '../utils';
import { OrderStatus } from '../models';
import { decrementOrderCount } from '../services';

const VALID_STATUSES = Object.values(OrderStatus);

export const updateOrder = async (orderId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const validationResult = validateUpdateOrderRequest(event.body);
    if ('statusCode' in validationResult) {
      return validationResult;
    }

    const body = validationResult;
    
    // Get existing order
    const existingOrder = await docClient.send(new GetCommand({
      TableName: process.env.ORDER_TABLE,
      Key: { orderId }
    }));

    if (!existingOrder.Item) {
      return createErrorResponse(404, 'Order not found');
    }

    const updateExpression: string[] = [];
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};
    
    // Track if status is being updated for inventory management
    let newStatus: string | undefined;
    const oldStatus = existingOrder.Item.status;

    // Update order status
    if (body.status) {
      if (!VALID_STATUSES.includes(body.status as OrderStatus)) {
        return createErrorResponse(400, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
      }
      updateExpression.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = body.status;
      newStatus = body.status;
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
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const result = await docClient.send(new UpdateCommand({
      TableName: process.env.ORDER_TABLE,
      Key: { orderId },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ReturnValues: 'ALL_NEW'
    }));

    // Handle inventory based on status change
    if (newStatus && newStatus !== oldStatus) {
      try {
        if (newStatus === OrderStatus.CANCELLED) {
          // Decrement counts for each item
          for (const item of existingOrder.Item.items || []) {
            await decrementOrderCount(item.itemId, existingOrder.Item.slot, existingOrder.Item.slotDate, item.quantity);
          }
        }
      } catch (inventoryError) {
        console.error('Error managing inventory:', inventoryError);
        // Order status already updated, log error but don't fail the request
      }
    }

    return createSuccessResponse(200, result.Attributes);
  } catch (error) {
    console.error('Error updating order:', error);
    return createErrorResponse(500, 'Failed to update order');
  }
};