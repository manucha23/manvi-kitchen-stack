import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { docClient } from '../utils';
import { updateOrder } from '../handlers/update-order.handler';

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
    validateUpdateOrderRequest: validation.validateUpdateOrderRequest,
  };
});

const sendMock = docClient.send as jest.Mock;
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

const createEvent = (body: unknown): APIGatewayProxyEvent => ({
  body: JSON.stringify(body),
} as APIGatewayProxyEvent);

describe('updateOrder', () => {
  beforeEach(() => {
    sendMock.mockReset();
    consoleErrorSpy.mockClear();
    process.env.ORDER_TABLE = 'orders-table';
  });

  it('updates an order using the expected version and returns the updated order', async () => {
    sendMock.mockResolvedValueOnce({
      Attributes: {
        orderId: 'ABC123',
        status: 'READY',
        version: 4,
      },
    });

    const response = await updateOrder('ABC123', createEvent({
      status: 'READY',
      version: 3,
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      orderId: 'ABC123',
      status: 'READY',
      version: 4,
    });

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
        ':status': 'READY',
        ':version': 3,
        ':nextVersion': 4,
        ':initialVersion': 1,
      },
      ReturnValues: 'ALL_NEW',
    });
  });

  it('requires a version for updates', async () => {
    const response = await updateOrder('ABC123', createEvent({
      status: 'READY',
    }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'version is required',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns conflict when the condition check fails', async () => {
    const conditionalError = new Error('condition failed');
    conditionalError.name = 'ConditionalCheckFailedException';
    sendMock.mockRejectedValueOnce(conditionalError);

    const response = await updateOrder('ABC123', createEvent({
      status: 'READY',
      version: 3,
    }));

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Order not found or version mismatch. Refresh order and retry.',
    });
  });
});
