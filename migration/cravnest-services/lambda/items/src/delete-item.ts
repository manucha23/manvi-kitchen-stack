import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createErrorResponse } from './utils';

export const deleteItem = async (itemId: string): Promise<APIGatewayProxyResult> => {
  try {
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