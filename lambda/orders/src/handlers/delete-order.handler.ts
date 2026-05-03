import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from '../utils';
import { decrementOrderCount } from '../services';

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

    // Decrement counts for each item
    if (status === 'Created') {
      try {
        for (const item of result.Item.items || []) {
          await decrementOrderCount(item.itemId, result.Item.slot, result.Item.slotDate, item.quantity);
        }
      } catch (decrementError) {
        console.error('Error decrementing counts:', decrementError);
        return createErrorResponse(500, 'Failed to release order counts');
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