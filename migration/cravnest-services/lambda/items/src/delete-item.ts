import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createErrorResponse } from './utils';
import { isAdminRequest } from './auth';

export const deleteItem = async (itemId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdminRequest(event)) {
      return createErrorResponse(403, 'Admin access is required to delete items');
    }

    await docClient.send(new DeleteCommand({
      TableName: process.env.ITEM_TABLE,
      Key: { itemId }
    }));

    return {
      statusCode: 204,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: ''
    };
  } catch (error) {
    console.error('Error deleting item:', error);
    return createErrorResponse(500, 'Failed to delete item');
  }
};