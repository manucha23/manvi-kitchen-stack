import { BatchGetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { docClient } from '../utils';
import { createOrder } from '../handlers/create-order.handler';

jest.mock('../utils', () => {
  const validation = jest.requireActual('../utils/validation.util');
  return {
    docClient: {
      send: jest.fn(),
    },
    createErrorResponse: (statusCode: number, message: string) => ({
      statusCode,
      body: JSON.stringify({ error: message }),
    }),
    createSuccessResponse: (statusCode: number, data: unknown) => ({
      statusCode,
      body: JSON.stringify(data),
    }),
    getCallerContext: (event: any) => ({
      principalId: event?.requestContext?.authorizer?.claims?.sub || 'admin-sub',
      groups: event?.requestContext?.authorizer?.claims?.['cognito:groups'] ? [event.requestContext.authorizer.claims['cognito:groups']] : ['Admin'],
      isAdmin: (event?.requestContext?.authorizer?.claims?.['cognito:groups'] || 'Admin') === 'Admin',
      isCustomer: !event?.path?.startsWith('/admin/orders'),
      isAdminRoute: event?.path?.startsWith('/admin/orders') || !event?.path,
      isCustomerRoute: event?.path?.startsWith('/orders'),
    }),
    getNextOrderId: () => 'ABC123',
    validateCreateOrderRequest: validation.validateCreateOrderRequest,
  };
});

jest.mock('../services', () => ({
  validateOrderingWindow: jest.fn().mockResolvedValue({
    valid: true,
    promisedDeliveryAt: '2026-06-07T11:00:00.000Z',
  }),
}));

const sendMock = docClient.send as jest.Mock;

const createEvent = (body: unknown): APIGatewayProxyEvent => ({
  body: JSON.stringify(body),
  requestContext: {
    authorizer: {
      claims: {
        sub: 'whatsapp:919999999999',
      },
    },
  },
} as unknown as APIGatewayProxyEvent);

describe('createOrder', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.ORDER_TABLE = 'orders-table';
    process.env.ITEM_TABLE = 'items-table';
  });

  it('creates COD orders in CREATED status for manual confirmation', async () => {
    sendMock.mockResolvedValueOnce({
      Responses: {
        'items-table': [{
          itemId: 'biryani-full',
          name: 'Chicken Biryani Full',
          price: 300,
          available: true,
        }],
      },
    });
    sendMock.mockResolvedValueOnce({});

    const response = await createOrder(createEvent({
      customerName: 'Rahul',
      customerPhone: '919999999999',
      deliveryAddress: 'A-1204, Vanaha Township',
      paymentMethod: 'COD',
      items: [{ id: 'biryani-full', quantity: 1 }],
    }));

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toMatchObject({
      orderId: 'ABC123',
      status: 'CREATED',
      paymentMethod: 'COD',
      paymentStatus: 'NOT_REQUIRED',
    });

    expect((sendMock.mock.calls[0][0] as BatchGetCommand).input).toMatchObject({
      RequestItems: {
        'items-table': {
          Keys: [{ itemId: 'biryani-full' }],
        },
      },
    });
    expect((sendMock.mock.calls[1][0] as PutCommand).input.Item).toMatchObject({
      orderId: 'ABC123',
      status: 'CREATED',
    });
  });
});
