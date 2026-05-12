import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from '../utils';
import { releaseCapacityForOrderItems, reserveCapacityForOrderItems } from '../services';
import { OrderStatus } from '../models';

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

    // Check order status - only allow deletion before kitchen processing starts
    const status = result.Item.status;
    if (![OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED, OrderStatus.CREATED].includes(status)) {
      return createErrorResponse(400, `Cannot delete order with status: ${status}. Only pending or confirmed orders can be deleted.`);
    }

    let releasedCapacity = false;
    if (result.Item.capacityReserved === true) {
      try {
        await releaseCapacityForOrderItems(
          (result.Item.items || []).map((item: any) => ({ itemId: item.itemId, quantity: item.quantity })),
          result.Item.slot,
          result.Item.slotDate,
        );
        releasedCapacity = true;
      } catch (decrementError) {
        console.error('Error decrementing counts:', decrementError);
        return createErrorResponse(500, 'Failed to release order counts');
      }
    }

    // Delete the order
    try {
      await docClient.send(new DeleteCommand({
        TableName: process.env.ORDER_TABLE,
        Key: { orderId }
      }));
    } catch (deleteError) {
      if (releasedCapacity) {
        await reserveCapacityForOrderItems(
          (result.Item.items || []).map((item: any) => ({ itemId: item.itemId, quantity: item.quantity })),
          result.Item.slot,
          result.Item.slotDate,
        ).catch((reserveError) => console.error('Failed to restore capacity after order delete failure:', reserveError));
      }
      throw deleteError;
    }

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
