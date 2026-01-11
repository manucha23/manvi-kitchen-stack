import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createErrorResponse } from './utils';
import { 
  listOrders, 
  getOrder, 
  createOrder, 
  updateOrder, 
  deleteOrder, 
  updateSlotAvailability, 
  getOrderHistory 
} from './handlers';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { httpMethod, pathParameters, path } = event;
    const orderId = pathParameters?.orderId;

    if (path === '/orders/slot-availability' && httpMethod === 'PUT') {
      return updateSlotAvailability(event);
    }

    if (path.includes('/history') && httpMethod === 'GET') {
      if (!orderId) {
        return createErrorResponse(400, 'Order ID is required');
      }
      return getOrderHistory(orderId);
    }

    switch (httpMethod) {
      case 'GET':
        return orderId ? getOrder(orderId) : listOrders(event);
      case 'POST':
        return createOrder(event);
      case 'PUT':
        if (!orderId) {
          return createErrorResponse(400, 'Order ID is required');
        }
        return updateOrder(orderId, event);
      case 'DELETE':
        if (!orderId) {
          return createErrorResponse(400, 'Order ID is required');
        }
        return deleteOrder(orderId);
      default:
        return createErrorResponse(405, 'Method Not Allowed');
    }
  } catch (error) {
    console.error('Error:', error);
    return createErrorResponse(500, 'Internal Server Error');
  }
};