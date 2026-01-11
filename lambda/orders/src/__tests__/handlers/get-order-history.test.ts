import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getOrderHistory } from '../../handlers/get-order-history.handler';
import { docClientMock, resetMocks, setupEnv } from '../test-utils';

describe('Get Order History Handler', () => {
  beforeAll(() => setupEnv());
  beforeEach(() => resetMocks());

  const mockHistory = [
    {
      orderId: 'ABC123',
      timestamp: '2024-12-31T10:00:00Z',
      eventType: 'CREATED',
      orderSnapshot: { status: 'Created' }
    },
    {
      orderId: 'ABC123',
      timestamp: '2024-12-31T11:00:00Z',
      eventType: 'MODIFIED',
      orderSnapshot: { status: 'Accepted' }
    }
  ];

  describe('Success Cases', () => {
    it('should return order history', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: mockHistory });

      const result = await getOrderHistory('ABC123');

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.orderId).toBe('ABC123');
      expect(body.history).toHaveLength(2);
    });

    it('should return empty history', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: [] });

      const result = await getOrderHistory('ABC123');

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.history).toHaveLength(0);
    });

    it('should return history in descending order', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: mockHistory.reverse() });

      const result = await getOrderHistory('ABC123');

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.history[0].timestamp).toBe('2024-12-31T11:00:00Z');
    });
  });

  describe('Validation Cases', () => {
    it('should reject invalid orderId format', async () => {
      const result = await getOrderHistory('invalid');

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Invalid orderId format');
    });

    it('should reject orderId with special characters', async () => {
      const result = await getOrderHistory('ABC@#$');

      expect(result.statusCode).toBe(400);
    });

    it('should reject orderId with lowercase', async () => {
      const result = await getOrderHistory('abc123');

      expect(result.statusCode).toBe(400);
    });
  });

  describe('Error Cases', () => {
    it('should handle DynamoDB errors', async () => {
      docClientMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

      const result = await getOrderHistory('ABC123');

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toContain('Failed to get order history');
    });
  });
});
