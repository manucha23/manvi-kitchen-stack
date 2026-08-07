import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from './utils';
import { isAdminRequest } from './auth';

export const updateItem = async (itemId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdminRequest(event)) {
      return createErrorResponse(403, 'Admin access is required to update items');
    }

    const body = JSON.parse(event.body || '{}');
    
    const updateExpression = [];
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};

    if (body.name) {
      updateExpression.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = body.name;
    }
    if (body.description) {
      updateExpression.push('description = :description');
      expressionAttributeValues[':description'] = body.description;
    }
    if (body.price !== undefined) {
      updateExpression.push('price = :price');
      expressionAttributeValues[':price'] = body.price;
    }
    if (body.category) {
      updateExpression.push('category = :category');
      expressionAttributeValues[':category'] = body.category;
    }
    if (body.available !== undefined) {
      updateExpression.push('available = :available');
      expressionAttributeValues[':available'] = body.available;
    }
    if (body.imageUrl) {
      updateExpression.push('imageUrl = :imageUrl');
      expressionAttributeValues[':imageUrl'] = body.imageUrl;
    }

    updateExpression.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const result = await docClient.send(new UpdateCommand({
      TableName: process.env.ITEM_TABLE,
      Key: { itemId },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ReturnValues: 'ALL_NEW'
    }));

    return createSuccessResponse(200, result.Attributes);
  } catch (error) {
    console.error('Error updating item:', error);
    return createErrorResponse(500, 'Failed to update item');
  }
};