import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createErrorResponse } from './utils';
import { listOrders } from './list-orders';
import { getOrder } from './get-order';
import { createOrder } from './create-order';
import { updateOrder } from './update-order';
import { deleteOrder } from './delete-order';
import { updateSlotAvailability } from './update-slot-availability';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { httpMethod, pathParameters, path } = event;
    const orderId = pathParameters?.orderId;

    if (path === '/orders/slot-availability' && httpMethod === 'PUT') {
      return updateSlotAvailability(event);
    }

    switch (httpMethod) {
      case 'GET':
        return orderId ? getOrder(orderId) : listOrders(event);
      case 'POST':
        return createOrder(event);
      case 'PUT':
        return updateOrder(orderId!, event);
      case 'DELETE':
        return deleteOrder(orderId!);
      default:
        return createErrorResponse(405, 'Method Not Allowed');
    }
  } catch (error) {
    console.error('Error:', error);
    return createErrorResponse(500, 'Internal Server Error');
  }
};