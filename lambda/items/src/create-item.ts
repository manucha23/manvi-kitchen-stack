import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { docClient, createSuccessResponse, createErrorResponse } from './utils';

export const createItem = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const itemId = uuidv4();
    
    const item = {
      itemId,
      name: body.name,
      description: body.description,
      price: body.price,
      category: body.category,
      imageUrl: body.imageUrl || null,
      available: body.available ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ITEM_TABLE,
      Item: item
    }));

    return createSuccessResponse(201, item);
  } catch (error) {
    console.error('Error creating item:', error);
    return createErrorResponse(500, 'Failed to create item');
  }
};