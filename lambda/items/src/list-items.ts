import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from './utils';

export const listItems = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: process.env.ITEM_TABLE
    }));

    const items = result.Items || [];

    return createSuccessResponse(200, { items });
  } catch (error) {
    console.error('Error listing items:', error);
    return createErrorResponse(500, 'Failed to list items');
  }
};
