import { APIGatewayProxyResult } from 'aws-lambda';
import { docClient } from '../utils';
import { getOrder } from '../handlers/get-order.handler';

jest.mock('../utils', () => {
  const orderVersion = jest.requireActual('../utils/order-version.util');

  return {
    docClient: {
      send: jest.fn(),
    },
    createErrorResponse: (statusCode: number, message: string): APIGatewayProxyResult => ({
      statusCode,
      body: JSON.stringify({ error: message }),
      headers: {},
    }),
    createSuccessResponse: (statusCode: number, data: unknown): APIGatewayProxyResult => ({
      statusCode,
      body: JSON.stringify(data),
      headers: {},
    }),
    withOrderVersion: orderVersion.withOrderVersion,
  };
});

const sendMock = docClient.send as jest.Mock;

describe('getOrder', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.ORDER_TABLE = 'orders-table';
  });

  it('returns version 1 for legacy orders without a stored version', async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        orderId: 'ABC123',
        status: 'CONFIRMED',
      },
    });

    const response = await getOrder('ABC123');

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      orderId: 'ABC123',
      status: 'CONFIRMED',
      version: 1,
    });
  });
});
