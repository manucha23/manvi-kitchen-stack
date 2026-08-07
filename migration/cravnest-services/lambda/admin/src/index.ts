import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { setOrderLimits } from './handlers';
import { setKillswitch } from './killswitch-handler';
import { getOrderLimits } from './get-limits-handler';
import { isAdminRequest } from './auth';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Admin request:', { method: event.httpMethod, path: event.path });

  try {
    if (!isAdminRequest(event)) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Admin access is required' })
      };
    }

    // GET /admin/order-limits
    if (event.httpMethod === 'GET' && event.path === '/admin/order-limits') {
      return await getOrderLimits(event);
    }

    // PUT /admin/order-limits
    if (event.httpMethod === 'PUT' && event.path === '/admin/order-limits') {
      return await setOrderLimits(event);
    }

    // PUT /admin/killswitch
    if (event.httpMethod === 'PUT' && event.path === '/admin/killswitch') {
      return await setKillswitch(event);
    }

    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Route not found' })
    };
  } catch (error) {
    console.error('Unhandled error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};
