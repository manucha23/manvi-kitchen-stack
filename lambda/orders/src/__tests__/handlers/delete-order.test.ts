import { GetCommand, DeleteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { deleteOrder } from '../../handlers/delete-order.handler';
import { docClientMock, resetMocks, setupEnv } from '../test-utils';
import { OrderStatus } from '../../models';

describe('Delete Order Handler', () => {
  beforeAll(() => setupEnv());
  beforeEach(() => resetMocks());

  const mockCreatedOrder = {
    orderId: 'ABC123',
    status: OrderStatus.CREATED,
    items: [{ itemId: 'item-1', quantity: 2 }],
    slot: 'saturday-lunch',
    slotDate: '2024-12-31'
  };

  const mockAcceptedOrder = {
    ...mockCreatedOrder,
    status: OrderStatus.ACCEPTED
  };

  describe('Success Cases', () => {
    it('should delete Created order and release inventory', async () => {
      docClientMock.on(GetCommand).resolves({ Item: mockCreatedOrder });
      docClientMock.on(QueryCommand).resolves({
        Items: [{
          orderId: 'ABC123',
          items: [{ itemId: 'item-1', quantity: 2 }],
          slot: 'saturday-lunch',
          slotDate: '2024-12-31'
        }]
      });
      docClientMock.on(UpdateCommand).resolves({});
      docClientMock.on(DeleteCommand).resolves({});

      const result = await deleteOrder('ABC123');

      expect(result.statusCode).toBe(204);
      // Should have called Get, Query, Update, Delete (inventory), Delete (order)
      expect(docClientMock.calls().length).toBeGreaterThan(3);
    });

    it('should delete Accepted order without inventory release', async () => {
      docClientMock.on(GetCommand).resolves({ Item: mockAcceptedOrder });
      docClientMock.on(DeleteCommand).resolves({});

      const result = await deleteOrder('ABC123');

      expect(result.statusCode).toBe(204);
    });
  });

  describe('Status Restriction Cases', () => {
    it('should reject deletion of Cooking order', async () => {
      docClientMock.on(GetCommand).resolves({
        Item: { ...mockCreatedOrder, status: OrderStatus.COOKING }
      });

      const result = await deleteOrder('ABC123');

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Cannot delete order');
    });

    it('should reject deletion of Ready order', async () => {
      docClientMock.on(GetCommand).resolves({
        Item: { ...mockCreatedOrder, status: OrderStatus.READY }
      });

      const result = await deleteOrder('ABC123');

      expect(result.statusCode).toBe(400);
    });

    it('should reject deletion of Delivered order', async () => {
      docClientMock.on(GetCommand).resolves({
        Item: { ...mockCreatedOrder, status: OrderStatus.DELIVERED }
      });

      const result = await deleteOrder('ABC123');

      expect(result.statusCode).toBe(400);
    });
  });

  describe('Not Found Cases', () => {
    it('should return 404 when order not found', async () => {
      docClientMock.on(GetCommand).resolves({ Item: undefined });

      const result = await deleteOrder('ABC123');

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toContain('Order not found');
    });
  });

  describe('Error Cases', () => {
    it('should handle DynamoDB errors', async () => {
      docClientMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      const result = await deleteOrder('ABC123');

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toContain('Failed to delete order');
    });

    it('should handle inventory release errors gracefully', async () => {
      docClientMock.on(GetCommand).resolves({ Item: mockCreatedOrder });
      docClientMock.on(QueryCommand).rejects(new Error('Inventory error'));
      docClientMock.on(DeleteCommand).resolves({});

      const result = await deleteOrder('ABC123');

      expect(result.statusCode).toBe(500);
    });
  });
});
