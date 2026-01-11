import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { getOrder } from '../../handlers/get-order.handler';
import { docClientMock, resetMocks, setupEnv } from '../test-utils';
import { OrderStatus } from '../../models';

describe('Get Order Handler', () => {
  beforeAll(() => {
    setupEnv();
  });

  beforeEach(() => {
    resetMocks();
  });

  const mockOrder = {
    orderId: 'ABC123',
    orderedBy: 'user-123',
    customerName: 'John Doe',
    deliveryAddress: '123 Main St',
    contactNumber: '+1234567890',
    status: OrderStatus.CREATED,
    orderScheduled: '2024-12-31T18:00:00Z',
    slot: 'saturday-lunch',
    slotDate: '2024-12-31',
    items: [{ itemId: 'item-1', name: 'Biryani', price: 250, quantity: 2, amount: 500 }],
    total: 500,
    feedbackProvided: false,
    feedbackRequestCount: 0,
    timestamp: '2024-12-25T10:00:00Z'
  };

  describe('Success Cases', () => {
    it('should return order when found', async () => {
      docClientMock.on(GetCommand).resolves({ Item: mockOrder });

      const result = await getOrder('ABC123');

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.orderId).toBe('ABC123');
      expect(body.customerName).toBe('John Doe');
    });
  });

  describe('Validation Cases', () => {
    it('should reject invalid orderId format', async () => {
      const result = await getOrder('invalid');

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Invalid orderId format');
    });

    it('should reject orderId with special characters', async () => {
      const result = await getOrder('ABC@#$');

      expect(result.statusCode).toBe(400);
    });

    it('should reject orderId with lowercase', async () => {
      const result = await getOrder('abc123');

      expect(result.statusCode).toBe(400);
    });

    it('should reject orderId too short', async () => {
      const result = await getOrder('ABC12');

      expect(result.statusCode).toBe(400);
    });

    it('should reject orderId too long', async () => {
      const result = await getOrder('ABC1234');

      expect(result.statusCode).toBe(400);
    });
  });

  describe('Not Found Cases', () => {
    it('should return 404 when order not found', async () => {
      docClientMock.on(GetCommand).resolves({ Item: undefined });

      const result = await getOrder('ABC123');

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toContain('Order not found');
    });
  });

  describe('Error Cases', () => {
    it('should handle DynamoDB errors', async () => {
      docClientMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      const result = await getOrder('ABC123');

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toContain('Failed to get order');
    });
  });
});
