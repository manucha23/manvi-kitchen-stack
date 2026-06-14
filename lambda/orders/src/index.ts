import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createErrorResponse, getCallerContext, isAuthorizedForRoute } from './utils';
import {
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  bulkUpdateOrders,
  deleteOrder,
  getOrderHistory
} from './handlers';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { httpMethod, pathParameters, path } = event;
    const orderId = pathParameters?.orderId;
    const caller = getCallerContext(event);

    if (!caller.principalId) {
      return createErrorResponse(401, 'User not authenticated');
    }

    if (!isAuthorizedForRoute(caller)) {
      return createErrorResponse(403, 'Not authorized for this order route');
    }

    if (path.includes('/history') && httpMethod === 'GET') {
      if (!orderId) {
        return createErrorResponse(400, 'Order ID is required');
      }
      return getOrderHistory(orderId, event);
    }

    if (path.endsWith('/admin/orders/bulk') && httpMethod === 'PATCH') {
      return bulkUpdateOrders(event);
    }

    switch (httpMethod) {
      case 'GET':
        return orderId ? getOrder(orderId, event) : listOrders(event);
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
        return deleteOrder(orderId, event);
      default:
        return createErrorResponse(405, 'Method Not Allowed');
    }
  } catch (error) {
    console.error('Error:', error);
    return createErrorResponse(500, 'Internal Server Error');
  }
};
