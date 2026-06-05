import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { docClient } from '../utils';
import { listOrders } from '../handlers/list-orders.handler';

jest.mock('../utils', () => ({
  docClient: {
    send: jest.fn(),
  },
  withOrderVersion: (order: any) => ({
    ...order,
    version: order.version || 1,
  }),
  createErrorResponse: (statusCode: number, message: string) => ({
    statusCode,
    body: JSON.stringify({ error: message }),
  }),
  createSuccessResponse: (statusCode: number, data: unknown) => ({
    statusCode,
    body: JSON.stringify(data),
  }),
}));

const sendMock = docClient.send as jest.Mock;

const createEvent = (queryStringParameters: Record<string, string>): APIGatewayProxyEvent => ({
  queryStringParameters,
} as APIGatewayProxyEvent);

describe('listOrders', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.ORDER_TABLE = 'orders-table';
  });

  it('uses explicit timestamp bounds for a same-day date range', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [],
    });

    await listOrders(createEvent({
      orderStatus: 'CONFIRMED',
      fromDate: '2026-05-28T00:00:00.000Z',
      toDate: '2026-05-28T23:59:59.999Z',
    }));

    const command = sendMock.mock.calls[0][0] as QueryCommand;
    expect(command.input).toMatchObject({
      KeyConditionExpression: '#status = :status AND createdAt BETWEEN :fromDate AND :toDate',
      ExpressionAttributeValues: {
        ':fromDate': '2026-05-28T00:00:00.000Z',
        ':toDate': '2026-05-28T23:59:59.999Z',
      },
    });
  });

  it('accepts ISO timestamps for date range filters', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [],
    });

    await listOrders(createEvent({
      customerPhone: '+919454935942',
      fromDate: '2026-05-28T04:30:00.000Z',
      toDate: '2026-05-28T16:30:00.000Z',
    }));

    const command = sendMock.mock.calls[0][0] as QueryCommand;
    expect(command.input).toMatchObject({
      KeyConditionExpression: 'customerPhone = :phone AND createdAt BETWEEN :fromDate AND :toDate',
      ExpressionAttributeValues: {
        ':fromDate': '2026-05-28T04:30:00.000Z',
        ':toDate': '2026-05-28T16:30:00.000Z',
      },
    });
  });

  it('rejects date-only range values', async () => {
    const response = await listOrders(createEvent({
      orderStatus: 'CONFIRMED',
      fromDate: '2026-05-28',
      toDate: '2026-05-28',
    }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Invalid fromDate format. Use ISO timestamp',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
