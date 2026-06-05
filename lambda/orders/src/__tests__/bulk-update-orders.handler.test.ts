import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { docClient } from '../utils';
import { bulkUpdateOrders } from '../handlers/bulk-update-orders.handler';

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
    validateBulkUpdateOrdersRequest: validation.validateBulkUpdateOrdersRequest,
  };
});

const sendMock = docClient.send as jest.Mock;
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

const createEvent = (body: unknown): APIGatewayProxyEvent => ({
  body: JSON.stringify(body),
} as APIGatewayProxyEvent);

describe('bulkUpdateOrders', () => {
  beforeEach(() => {
    sendMock.mockReset();
    consoleErrorSpy.mockClear();
    process.env.ORDER_TABLE = 'orders-table';
  });

  it('updates multiple orders and returns complete updated order details', async () => {
    sendMock
      .mockResolvedValueOnce({ Attributes: { orderId: 'ABC123', status: 'INKITCHEN', version: 4, customerName: 'Asha' } })
      .mockResolvedValueOnce({ Attributes: { orderId: 'DEF456', status: 'INKITCHEN', version: 8, customerName: 'Ravi' } });

    const response = await bulkUpdateOrders(createEvent({
      orders: [
        { orderId: 'ABC123', version: 3 },
        { orderId: 'DEF456', version: 7 },
      ],
      update: {
        status: 'INKITCHEN',
      },
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      updated: [
        { orderId: 'ABC123', status: 'INKITCHEN', version: 4, customerName: 'Asha' },
        { orderId: 'DEF456', status: 'INKITCHEN', version: 8, customerName: 'Ravi' },
      ],
      updatedCount: 2,
      failedCount: 0,
      failed: [],
    });
    expect(sendMock).toHaveBeenCalledTimes(2);

    const command = sendMock.mock.calls[0][0] as UpdateCommand;
    expect(command.input).toMatchObject({
      TableName: 'orders-table',
      Key: { orderId: 'ABC123' },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, #version = :nextVersion',
      ConditionExpression: 'attribute_exists(orderId) AND ((attribute_exists(#version) AND #version = :version) OR (attribute_not_exists(#version) AND :version = :initialVersion))',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#version': 'version',
      },
      ExpressionAttributeValues: {
        ':status': 'INKITCHEN',
        ':version': 3,
        ':nextVersion': 4,
        ':initialVersion': 1,
      },
      ReturnValues: 'ALL_NEW',
    });
  });

  it('returns partial success with failed order IDs and messages', async () => {
    const conditionalError = new Error('condition failed');
    conditionalError.name = 'ConditionalCheckFailedException';

    sendMock
      .mockResolvedValueOnce({ Attributes: { orderId: 'ABC123', status: 'READY', version: 4 } })
      .mockRejectedValueOnce(conditionalError);

    const response = await bulkUpdateOrders(createEvent({
      orders: [
        { orderId: 'ABC123', version: 3 },
        { orderId: 'ZZZ999', version: 2 },
      ],
      update: {
        status: 'READY',
      },
    }));

    expect(response.statusCode).toBe(207);
    expect(JSON.parse(response.body)).toMatchObject({
      updated: [
        { orderId: 'ABC123', status: 'READY', version: 4 },
      ],
      updatedCount: 1,
      failedCount: 1,
      failed: [
        {
          orderId: 'ZZZ999',
          message: 'Order not found or version mismatch. Refresh order and retry.',
        },
      ],
    });
  });

  it('rejects invalid status before updating', async () => {
    const response = await bulkUpdateOrders(createEvent({
      orders: [
        { orderId: 'ABC123', version: 3 },
      ],
      update: {
        status: 'COOKING',
      },
    }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Invalid status. Must be one of: CREATED, PENDING_PAYMENT, CONFIRMED, INKITCHEN, READY, DISPATCHED, COMPLETED, CANCELLED',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects duplicate order IDs', async () => {
    const response = await bulkUpdateOrders(createEvent({
      orders: [
        { orderId: 'ABC123', version: 3 },
        { orderId: 'ABC123', version: 3 },
      ],
      update: {
        status: 'INKITCHEN',
      },
    }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'orders must not contain duplicate orderIds',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
