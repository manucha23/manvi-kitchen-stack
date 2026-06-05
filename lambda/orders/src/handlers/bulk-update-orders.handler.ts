import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, validateBulkUpdateOrdersRequest } from '../utils';
import { OrderStatus } from '../models';

const VALID_STATUSES = Object.values(OrderStatus);

interface BulkUpdateFailure {
  orderId: string;
  message: string;
}

interface BulkUpdateSuccess {
  orderId: string;
  order: Record<string, unknown>;
}

interface BulkUpdateError {
  orderId: string;
  error: string;
}

const getUpdateFailureMessage = (error: unknown): string => {
  if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
    return 'Order not found or version mismatch. Refresh order and retry.';
  }
  return 'Failed to update order';
};

export const bulkUpdateOrders = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const validationResult = validateBulkUpdateOrdersRequest(event.body);
    if ('statusCode' in validationResult) {
      return validationResult;
    }

    const { orders, update } = validationResult;

    if (update.status && !VALID_STATUSES.includes(update.status as OrderStatus)) {
      return createErrorResponse(400, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const updateExpression: string[] = [];
    const expressionAttributeNames: Record<string, string> = {
      '#version': 'version',
    };
    const baseExpressionAttributeValues: Record<string, unknown> = {
      ':initialVersion': 1,
    };

    if (update.status) {
      updateExpression.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      baseExpressionAttributeValues[':status'] = update.status;
    }

    if (updateExpression.length === 0) {
      return createErrorResponse(400, 'No valid fields to update');
    }

    updateExpression.push('updatedAt = :updatedAt');
    updateExpression.push('#version = :nextVersion');

    const updatedAt = new Date().toISOString();

    const results: Array<BulkUpdateSuccess | BulkUpdateError> = await Promise.all(
      orders.map(async ({ orderId, version }) => {
        try {
          const result = await docClient.send(new UpdateCommand({
            TableName: process.env.ORDER_TABLE,
            Key: { orderId },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ConditionExpression: 'attribute_exists(orderId) AND ((attribute_exists(#version) AND #version = :version) OR (attribute_not_exists(#version) AND :version = :initialVersion))',
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: {
              ...baseExpressionAttributeValues,
              ':version': version,
              ':nextVersion': version + 1,
              ':updatedAt': updatedAt,
            },
            ReturnValues: 'ALL_NEW',
          }));

          return { orderId, order: result.Attributes || {} };
        } catch (error) {
          console.error('Error bulk updating order:', { orderId, error });
          return {
            orderId,
            error: getUpdateFailureMessage(error),
          };
        }
      })
    );

    const updated = results
      .filter((result): result is BulkUpdateSuccess => 'order' in result)
      .map((result) => result.order);
    const failed: BulkUpdateFailure[] = results
      .filter((result): result is BulkUpdateError => 'error' in result)
      .map((result) => ({
        orderId: result.orderId,
        message: result.error,
      }));

    return createSuccessResponse(failed.length > 0 ? 207 : 200, {
      updated,
      failed,
      updatedCount: updated.length,
      failedCount: failed.length,
    });
  } catch (error) {
    console.error('Error bulk updating orders:', error);
    return createErrorResponse(500, 'Failed to bulk update orders');
  }
};
