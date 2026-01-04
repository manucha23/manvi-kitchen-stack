import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { docClient, createSuccessResponse, createErrorResponse } from './utils';

export const createOrder = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const orderId = uuidv4();
    
    const order = {
      orderId,
      version: 1,
      customerId: body.customerId,
      items: body.items,
      totalAmount: body.totalAmount,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ORDER_TABLE,
      Item: order
    }));

    return createSuccessResponse(201, order);
  } catch (error) {
    console.error('Error creating order:', error);
    return createErrorResponse(500, 'Failed to create order');
  }
};