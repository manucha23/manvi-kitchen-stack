import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, validateUpdateOrderRequest } from '../utils';
import { OrderStatus } from '../models';
import { confirmInventory, releaseInventory } from '../services';

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
    const oldStatus = existingOrder.Item.orderStatus;

    // Update order status
    if (body.orderStatus) {
      if (!VALID_STATUSES.includes(body.orderStatus as OrderStatus)) {
        return createErrorResponse(400, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
      }
      updateExpression.push('#orderStatus = :orderStatus');
      expressionAttributeNames['#orderStatus'] = 'orderStatus';
      expressionAttributeValues[':orderStatus'] = body.orderStatus;
      newStatus = body.orderStatus;
    }

    // Update feedback provided
    if (body.feedbackProvided !== undefined) {
      updateExpression.push('feedbackProvided = :feedbackProvided');
      expressionAttributeValues[':feedbackProvided'] = body.feedbackProvided;
    }

    // Increment feedback request count
    if (body.incrementFeedbackRequest) {
      updateExpression.push('feedbackRequestCount = if_not_exists(feedbackRequestCount, :zero) + :inc');
      expressionAttributeValues[':inc'] = 1;
      expressionAttributeValues[':zero'] = 0;
    }

    // Update instructions
    if (body.instructions !== undefined) {
      updateExpression.push('instructions = :instructions');
      expressionAttributeValues[':instructions'] = body.instructions;
    }

    if (updateExpression.length === 0) {
      return createErrorResponse(400, 'No valid fields to update');
    }

    updateExpression.push('#timestamp = :timestamp');
    expressionAttributeNames['#timestamp'] = 'timestamp';
    expressionAttributeValues[':timestamp'] = new Date().toISOString();

    const result = await docClient.send(new UpdateCommand({
      TableName: process.env.ORDER_TABLE,
      Key: { orderId },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: 'ALL_NEW'
    }));

    // Handle inventory based on status change
    if (newStatus && newStatus !== oldStatus) {
      try {
        if (newStatus === OrderStatus.ACCEPTED) {
          // Confirm inventory - delete BLOCKED records, keep quantity reduced
          await confirmInventory(orderId);
        } else if (newStatus === 'Cancelled') {
          // Release inventory - restore quantity and delete BLOCKED records
          await releaseInventory(orderId);
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