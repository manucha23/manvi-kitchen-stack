import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from './utils';

export const updateOrder = async (orderId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    
    const updateExpression = [];
    const expressionAttributeValues: any = {};
    
    if (body.status) {
      updateExpression.push('status = :status');
      expressionAttributeValues[':status'] = body.status;
    }
    if (body.items) {
      updateExpression.push('items = :items');
      expressionAttributeValues[':items'] = body.items;
    }
    if (body.totalAmount) {
      updateExpression.push('totalAmount = :totalAmount');
      expressionAttributeValues[':totalAmount'] = body.totalAmount;
    }

    updateExpression.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const result = await docClient.send(new UpdateCommand({
      TableName: process.env.ORDER_TABLE,
      Key: { orderId, version: 1 },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }));

    return createSuccessResponse(200, result.Attributes);
  } catch (error) {
    console.error('Error updating order:', error);
    return createErrorResponse(500, 'Failed to update order');
  }
};