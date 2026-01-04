import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from './utils';

export const deleteOrder = async (orderId: string): Promise<APIGatewayProxyResult> => {
  try {
    await docClient.send(new DeleteCommand({
      TableName: process.env.ORDER_TABLE,
      Key: { orderId, version: 1 }
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
    console.error('Error deleting order:', error);
    return createErrorResponse(500, 'Failed to delete order');
  }
};