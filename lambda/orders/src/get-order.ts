import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from './utils';

export const getOrder = async (orderId: string): Promise<APIGatewayProxyResult> => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: process.env.ORDER_TABLE,
      Key: { orderId }
    }));

    if (!result.Item) {
      return createErrorResponse(404, 'Order not found');
    }

    return createSuccessResponse(200, result.Item);
  } catch (error) {
    console.error('Error getting order:', error);
    return createErrorResponse(500, 'Failed to get order');
  }
};