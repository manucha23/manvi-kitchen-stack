import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { listOrders } from '../../handlers/list-orders.handler';
import { docClientMock, resetMocks, setupEnv } from '../test-utils';
import { OrderStatus } from '../../models';

describe('List Orders Handler', () => {
  beforeAll(() => setupEnv());
  beforeEach(() => resetMocks());

  const mockEvent = (queryParams?: any): APIGatewayProxyEvent => ({
    queryStringParameters: queryParams || null
  } as APIGatewayProxyEvent);

  const mockOrders = [
    {
      orderId: 'ABC123',
      status: OrderStatus.CREATED,
      slotDate: '2024-12-31',
      slot: 'saturday-lunch',
      orderedBy: 'user-123'
    },
    {
      orderId: 'DEF456',
      status: OrderStatus.CREATED,
      slotDate: '2024-12-30',
      slot: 'saturday-dinner',
      orderedBy: 'user-456'
    }
  ];

  describe('Success Cases', () => {
    it('should list orders with default Created status', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: mockOrders });

      const result = await listOrders(mockEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(2);
      expect(body.count).toBe(2);
    });

    it('should filter by status', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: [mockOrders[0]] });

      const result = await listOrders(mockEvent({ orderStatus: 'Cooking' }));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(1);
    });

    it('should filter by date range', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: mockOrders });

      const result = await listOrders(mockEvent({
        orderStatus: 'Created',
        fromDate: '2024-12-30',
        toDate: '2024-12-31'
      }));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(2);
    });

    it('should filter by fromDate only', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: [mockOrders[0]] });

      const result = await listOrders(mockEvent({
        orderStatus: 'Created',
        fromDate: '2024-12-31'
      }));

      expect(result.statusCode).toBe(200);
    });

    it('should filter by toDate only', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: [mockOrders[1]] });

      const result = await listOrders(mockEvent({
        orderStatus: 'Created',
        toDate: '2024-12-30'
      }));

      expect(result.statusCode).toBe(200);
    });

    it('should filter by orderedBy', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: [mockOrders[0]] });

      const result = await listOrders(mockEvent({
        orderStatus: 'Created',
        orderedBy: 'user-123'
      }));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(1);
    });

    it('should filter by slot', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: [mockOrders[0]] });

      const result = await listOrders(mockEvent({
        orderStatus: 'Created',
        slot: 'saturday-lunch'
      }));

      expect(result.statusCode).toBe(200);
    });

    it('should apply combined filters', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: [mockOrders[0]] });

      const result = await listOrders(mockEvent({
        orderStatus: 'Created',
        fromDate: '2024-12-31',
        toDate: '2024-12-31',
        slot: 'saturday-lunch',
        orderedBy: 'user-123'
      }));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(1);
    });

    it('should return empty array when no orders found', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: [] });

      const result = await listOrders(mockEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(0);
      expect(body.count).toBe(0);
    });
  });

  describe('Validation Cases', () => {
    it('should reject invalid status', async () => {
      const result = await listOrders(mockEvent({ orderStatus: 'InvalidStatus' }));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Invalid order status');
    });
  });

  describe('Error Cases', () => {
    it('should handle DynamoDB errors', async () => {
      docClientMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

      const result = await listOrders(mockEvent());

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toContain('Failed to list orders');
    });
  });
});
