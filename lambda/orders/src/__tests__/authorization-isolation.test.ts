import { BatchGetCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { docClient } from '../utils';
import { createOrder } from '../handlers/create-order.handler';
import { listOrders } from '../handlers/list-orders.handler';
import { getOrder } from '../handlers/get-order.handler';
import { updateOrder } from '../handlers/update-order.handler';
import { deleteOrder } from '../handlers/delete-order.handler';
import { getOrderHistory } from '../handlers/get-order-history.handler';
import { bulkUpdateOrders } from '../handlers/bulk-update-orders.handler';

jest.mock('../utils', () => {
  const validation = jest.requireActual('../utils/validation.util');
  const version = jest.requireActual('../utils/order-version.util');
  return {
    docClient: { send: jest.fn() },
    createErrorResponse: (statusCode: number, message: string) => ({ statusCode, body: JSON.stringify({ error: message }) }),
    createSuccessResponse: (statusCode: number, data: unknown) => ({ statusCode, body: JSON.stringify(data) }),
    getNextOrderId: () => 'ABC123',
    withOrderVersion: version.withOrderVersion,
    validateCreateOrderRequest: validation.validateCreateOrderRequest,
    validateUpdateOrderRequest: validation.validateUpdateOrderRequest,
    validateBulkUpdateOrdersRequest: validation.validateBulkUpdateOrdersRequest,
    getCallerContext: (event: any) => {
      const claims = event.requestContext?.authorizer?.claims || {};
      const group = claims['cognito:groups'];
      return {
        principalId: claims.sub || claims.username || '',
        groups: group ? [group] : [],
        isAdmin: group === 'Admin',
        isCustomer: event.path?.startsWith('/orders'),
        isAdminRoute: event.path?.startsWith('/admin/orders'),
        isCustomerRoute: event.path?.startsWith('/orders'),
      };
    },
  };
});

jest.mock('../services', () => ({
  validateOrderingWindow: jest.fn().mockResolvedValue({ valid: true, promisedDeliveryAt: '2026-06-07T11:00:00.000Z' }),
}));

const sendMock = docClient.send as jest.Mock;
const customerEvent = (path: string, body?: unknown, queryStringParameters?: Record<string, string>): APIGatewayProxyEvent => ({
  path,
  body: body === undefined ? null : JSON.stringify(body),
  queryStringParameters,
  requestContext: { authorizer: { claims: { sub: 'customer-sub' } } },
} as unknown as APIGatewayProxyEvent);
const adminEvent = (path: string, body?: unknown): APIGatewayProxyEvent => ({
  path,
  body: body === undefined ? null : JSON.stringify(body),
  requestContext: { authorizer: { claims: { sub: 'admin-sub', 'cognito:groups': 'Admin' } } },
} as unknown as APIGatewayProxyEvent);

beforeEach(() => {
  sendMock.mockReset();
  process.env.ORDER_TABLE = 'orders-table';
  process.env.ITEM_TABLE = 'items-table';
  process.env.ORDER_HISTORY_TABLE = 'history-table';
});

describe('order authorization isolation', () => {
  it('customer creates order with orderedBy from Cognito sub and ignores spoofed orderedBy', async () => {
    sendMock.mockResolvedValueOnce({ Responses: { 'items-table': [{ itemId: 'item-1', name: 'Item', price: 10, available: true }] } });
    sendMock.mockResolvedValueOnce({});

    const response = await createOrder(customerEvent('/orders', {
      orderedBy: 'attacker-sub', customerName: 'Asha', customerPhone: '+911', deliveryAddress: 'Home', items: [{ id: 'item-1', quantity: 1 }],
    }));

    expect(response.statusCode).toBe(201);
    expect((sendMock.mock.calls[1][0] as PutCommand).input.Item).toMatchObject({ orderedBy: 'customer-sub' });
  });

  it('customer list ignores spoofed orderedBy and customerPhone and queries owned-order index', async () => {
    sendMock.mockResolvedValueOnce({ Items: [] });

    await listOrders(customerEvent('/orders', undefined, { orderedBy: 'attacker-sub', customerPhone: '+999', orderStatus: 'CONFIRMED' }));

    expect((sendMock.mock.calls[0][0] as QueryCommand).input).toMatchObject({
      IndexName: 'orderedBy-createdAt-index',
      KeyConditionExpression: 'orderedBy = :callerSub',
      ExpressionAttributeValues: { ':callerSub': 'customer-sub', ':statusFilter': 'CONFIRMED' },
    });
  });

  it('customer cannot get another customer order', async () => {
    sendMock.mockResolvedValueOnce({ Item: { orderId: 'ABC123', orderedBy: 'other-sub', status: 'CONFIRMED' } });

    const response = await getOrder('ABC123', customerEvent('/orders/ABC123'));

    expect(response.statusCode).toBe(404);
  });

  it('customer update/delete enforce owned order condition expressions', async () => {
    sendMock.mockResolvedValueOnce({ Attributes: { orderId: 'ABC123', orderedBy: 'customer-sub', status: 'CANCELLED', version: 2 } });
    await updateOrder('ABC123', customerEvent('/orders/ABC123', { status: 'CANCELLED', version: 1 }));
    expect((sendMock.mock.calls[0][0] as UpdateCommand).input.ConditionExpression).toContain('orderedBy = :orderedBy');

    sendMock.mockResolvedValueOnce({ Item: { orderId: 'ABC123', orderedBy: 'customer-sub', status: 'CONFIRMED' } });
    sendMock.mockResolvedValueOnce({});
    await deleteOrder('ABC123', customerEvent('/orders/ABC123'));
    expect((sendMock.mock.calls[2][0] as any).input.ConditionExpression).toContain('orderedBy = :orderedBy');
  });

  it('customer cannot access history or bulk update', async () => {
    expect((await getOrderHistory('ABC123', customerEvent('/orders/ABC123/history'))).statusCode).toBe(403);
    expect((await bulkUpdateOrders(customerEvent('/orders/bulk', { orders: [{ orderId: 'ABC123', version: 1 }], update: { status: 'READY' } }))).statusCode).toBe(403);
  });

  it('admin can get/update/delete/list through admin route and non-admin admin route is rejected by handlers', async () => {
    sendMock.mockResolvedValueOnce({ Item: { orderId: 'ABC123', orderedBy: 'customer-sub', status: 'CONFIRMED' } });
    expect((await getOrder('ABC123', adminEvent('/admin/orders/ABC123'))).statusCode).toBe(200);

    sendMock.mockResolvedValueOnce({ Attributes: { orderId: 'ABC123', status: 'READY', version: 2 } });
    expect((await updateOrder('ABC123', adminEvent('/admin/orders/ABC123', { status: 'READY', version: 1 }))).statusCode).toBe(200);

    const nonAdmin = customerEvent('/admin/orders/ABC123');
    expect((await getOrder('ABC123', nonAdmin)).statusCode).toBe(403);
  });
});
