import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from '../utils';
import { releaseInventory } from '../services';

export const deleteOrder = async (orderId: string): Promise<APIGatewayProxyResult> => {
  try {
    // Check if order exists
    const result = await docClient.send(new GetCommand({
      TableName: process.env.ORDER_TABLE,
      Key: { orderId }
    }));

    if (!result.Item) {
      return createErrorResponse(404, 'Order not found');
    }

    // Check order status - only allow deletion for Created or Accepted
    const status = result.Item.status;
    if (status !== 'Created' && status !== 'Accepted') {
      return createErrorResponse(400, `Cannot delete order with status: ${status}. Only Created or Accepted orders can be deleted.`);
    }

    // Release inventory if order is Created (Accepted orders already confirmed inventory)
    if (status === 'Created') {
      try {
        await releaseInventory(orderId);
      } catch (releaseError) {
        console.error('Error releasing inventory:', releaseError);
        return createErrorResponse(500, 'Failed to release inventory');
      }
    }

    // Delete the order
    await docClient.send(new DeleteCommand({
      TableName: process.env.ORDER_TABLE,
      Key: { orderId }
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