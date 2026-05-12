import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, validateUpdateOrderRequest } from '../utils';
import { OrderStatus } from '../models';
import { releaseCapacityForOrderItems, reserveCapacityForOrderItems, validateSameDaySlotAndCutoff } from '../services';

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
    let reservedDuringUpdate = false;
    let releasedDuringUpdate = false;

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

    if (newStatus && newStatus !== oldStatus) {
      if (newStatus === OrderStatus.CONFIRMED && existingOrder.Item.capacityReserved !== true) {
        const slotValidation = await validateSameDaySlotAndCutoff(existingOrder.Item.slot, existingOrder.Item.slotDate);
        if (!slotValidation.valid) {
          return createErrorResponse(400, slotValidation.reason);
        }
        try {
          await reserveCapacityForOrderItems(
            (existingOrder.Item.items || []).map((item: any) => ({ itemId: item.itemId, quantity: item.quantity })),
            existingOrder.Item.slot,
            existingOrder.Item.slotDate,
          );
          reservedDuringUpdate = true;
          updateExpression.push('capacityReserved = :capacityReserved');
          updateExpression.push('capacityReservedAt = :capacityReservedAt');
          expressionAttributeValues[':capacityReserved'] = true;
          expressionAttributeValues[':capacityReservedAt'] = new Date().toISOString();
        } catch (capacityError) {
          return createErrorResponse(400, capacityError instanceof Error ? capacityError.message : 'Unable to reserve item capacity');
        }
      }

      if (newStatus === OrderStatus.CANCELLED && existingOrder.Item.capacityReserved === true) {
        try {
          await releaseCapacityForOrderItems(
            (existingOrder.Item.items || []).map((item: any) => ({ itemId: item.itemId, quantity: item.quantity })),
            existingOrder.Item.slot,
            existingOrder.Item.slotDate,
          );
          releasedDuringUpdate = true;
          updateExpression.push('capacityReserved = :capacityReserved');
          expressionAttributeValues[':capacityReserved'] = false;
        } catch (capacityError) {
          return createErrorResponse(500, capacityError instanceof Error ? capacityError.message : 'Failed to release order capacity');
        }
      }
    }

    updateExpression.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    let result;
    try {
      result = await docClient.send(new UpdateCommand({
        TableName: process.env.ORDER_TABLE,
        Key: { orderId },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ReturnValues: 'ALL_NEW'
      }));
    } catch (updateError) {
      if (reservedDuringUpdate) {
        await releaseCapacityForOrderItems(
          (existingOrder.Item.items || []).map((item: any) => ({ itemId: item.itemId, quantity: item.quantity })),
          existingOrder.Item.slot,
          existingOrder.Item.slotDate,
        ).catch((releaseError) => console.error('Failed to release capacity after order update failure:', releaseError));
      }
      if (releasedDuringUpdate) {
        await reserveCapacityForOrderItems(
          (existingOrder.Item.items || []).map((item: any) => ({ itemId: item.itemId, quantity: item.quantity })),
          existingOrder.Item.slot,
          existingOrder.Item.slotDate,
        ).catch((reserveError) => console.error('Failed to restore capacity after order update failure:', reserveError));
      }
      throw updateError;
    }

    return createSuccessResponse(200, result.Attributes);
  } catch (error) {
    console.error('Error updating order:', error);
    return createErrorResponse(500, 'Failed to update order');
  }
};
