import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from './utils';

export const getItem = async (itemId: string): Promise<APIGatewayProxyResult> => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: process.env.ITEM_TABLE,
      Key: { itemId }
    }));

    if (!result.Item) {
      return createErrorResponse(404, 'Item not found');
    }

    return createSuccessResponse(200, result.Item);
  } catch (error) {
    console.error('Error getting item:', error);
    return createErrorResponse(500, 'Failed to get item');
  }
};
