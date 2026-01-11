import { GetCommand, UpdateCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { updateOrder } from '../../handlers/update-order.handler';
import { docClientMock, resetMocks, setupEnv } from '../test-utils';
import { OrderStatus } from '../../models';

describe('Update Order Handler', () => {
  beforeAll(() => setupEnv());
  beforeEach(() => resetMocks());

  const mockEvent = (body: any): APIGatewayProxyEvent => ({
    body: JSON.stringify(body)
  } as APIGatewayProxyEvent);

  const mockOrder = {
    orderId: 'ABC123',
    orderedBy: 'user-123',
    customerName: 'John Doe',
    status: OrderStatus.CREATED,
    items: [{ itemId: 'item-1', quantity: 2 }],
    slot: 'saturday-lunch',
    slotDate: '2024-12-31'
  };

  describe('Success Cases', () => {
    it('should update order status', async () => {
      docClientMock.on(GetCommand).resolves({ Item: mockOrder });
      docClientMock.on(UpdateCommand).resolves({ Attributes: { ...mockOrder, status: OrderStatus.ACCEPTED } });
      docClientMock.on(QueryCommand).resolves({ Items: [] });

      const result = await updateOrder('ABC123', mockEvent({ orderStatus: 'Accepted' }));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe(OrderStatus.ACCEPTED);
    });

    it('should update feedback provided', async () => {
      docClientMock.on(GetCommand).resolves({ Item: mockOrder });
      docClientMock.on(UpdateCommand).resolves({ Attributes: { ...mockOrder, feedbackProvided: true } });

      const result = await updateOrder('ABC123', mockEvent({ feedbackProvided: true }));

      expect(result.statusCode).toBe(200);
    });

    it('should increment feedback request count', async () => {
      docClientMock.on(GetCommand).resolves({ Item: mockOrder });
      docClientMock.on(UpdateCommand).resolves({ Attributes: { ...mockOrder, feedbackRequestCount: 1 } });

      const result = await updateOrder('ABC123', mockEvent({ incrementFeedbackRequest: true }));

      expect(result.statusCode).toBe(200);
    });

    it('should update instructions', async () => {
      docClientMock.on(GetCommand).resolves({ Item: mockOrder });
      docClientMock.on(UpdateCommand).resolves({ Attributes: { ...mockOrder, instructions: 'New instructions' } });

      const result = await updateOrder('ABC123', mockEvent({ instructions: 'New instructions' }));

      expect(result.statusCode).toBe(200);
    });
  });

  describe('Status Transition Cases', () => {
    it('should confirm inventory when status changes to Accepted', async () => {
      docClientMock.on(GetCommand).resolves({ Item: mockOrder });
      docClientMock.on(UpdateCommand).resolves({ Attributes: { ...mockOrder, status: OrderStatus.ACCEPTED } });
      docClientMock.on(QueryCommand).resolves({
        Items: [{ slotKey: 'item-1#saturday-lunch#2024-12-31', blockId: 'ABC123#item-1' }]
      });
      docClientMock.on(DeleteCommand).resolves({});

      const result = await updateOrder('ABC123', mockEvent({ orderStatus: 'Accepted' }));

      expect(result.statusCode).toBe(200);
      // Should have called Query and Delete
      expect(docClientMock.calls().length).toBeGreaterThan(2);
    });

    it('should handle inventory errors gracefully', async () => {
      docClientMock.on(GetCommand).resolves({ Item: mockOrder });
      docClientMock.on(UpdateCommand).resolves({ Attributes: { ...mockOrder, status: OrderStatus.ACCEPTED } });
      docClientMock.on(QueryCommand).rejects(new Error('Inventory error'));

      const result = await updateOrder('ABC123', mockEvent({ orderStatus: 'Accepted' }));

      expect(result.statusCode).toBe(200); // Order update succeeds despite inventory error
    });
  });

  describe('Validation Cases', () => {
    it('should reject invalid status', async () => {
      docClientMock.on(GetCommand).resolves({ Item: mockOrder });

      const result = await updateOrder('ABC123', mockEvent({ orderStatus: 'InvalidStatus' }));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Invalid status');
    });

    it('should reject empty update', async () => {
      docClientMock.on(GetCommand).resolves({ Item: mockOrder });

      const result = await updateOrder('ABC123', mockEvent({}));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('No valid fields to update');
    });

    it('should reject invalid body', async () => {
      const result = await updateOrder('ABC123', { body: null } as any);

      expect(result.statusCode).toBe(400);
    });

    it('should reject invalid field types', async () => {
      const result = await updateOrder('ABC123', mockEvent({ feedbackProvided: 'yes' }));

      expect(result.statusCode).toBe(400);
    });
  });

  describe('Not Found Cases', () => {
    it('should return 404 when order not found', async () => {
      docClientMock.on(GetCommand).resolves({ Item: undefined });

      const result = await updateOrder('ABC123', mockEvent({ orderStatus: 'Accepted' }));

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toContain('Order not found');
    });
  });

  describe('Error Cases', () => {
    it('should handle DynamoDB errors', async () => {
      docClientMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      const result = await updateOrder('ABC123', mockEvent({ orderStatus: 'Accepted' }));

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toContain('Failed to update order');
    });
  });
});
