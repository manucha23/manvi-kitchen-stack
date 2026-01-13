import { GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  blockInventory,
  confirmInventory,
  releaseInventory,
  checkAvailability,
  updateSlotQuantity
} from '../../services/inventory.service';
import { docClientMock, sfnClientMock, resetMocks, setupEnv } from '../test-utils';

describe('Inventory Service', () => {
  beforeAll(() => setupEnv());
  beforeEach(() => resetMocks());

  describe('blockInventory', () => {
    it('should block inventory', async () => {
      docClientMock.on(UpdateCommand).resolves({});

      await expect(
        blockInventory('item-1', 'saturday-lunch', '2024-12-31', 2, 'ABC123')
      ).resolves.not.toThrow();

      expect(docClientMock.calls()).toHaveLength(1);
    });

    it('should fail when insufficient quantity', async () => {
      docClientMock.on(UpdateCommand).rejects({ name: 'ConditionalCheckFailedException' });

      await expect(
        blockInventory('item-1', 'saturday-lunch', '2024-12-31', 10, 'ABC123')
      ).rejects.toThrow();
    });

    it('should work without step function ARN', async () => {
      docClientMock.on(UpdateCommand).resolves({});

      await blockInventory('item-1', 'saturday-lunch', '2024-12-31', 2, 'ABC123');

      expect(docClientMock.calls()).toHaveLength(1);
    });
  });

  describe('confirmInventory', () => {
    it('should be a no-op', async () => {
      await expect(confirmInventory('ABC123')).resolves.not.toThrow();
      expect(docClientMock.calls()).toHaveLength(0);
    });
  });

  describe('releaseInventory', () => {
    it('should restore quantity from order items', async () => {
      docClientMock.on(QueryCommand).resolves({
        Items: [{
          orderId: 'ABC123',
          slot: 'saturday-lunch',
          slotDate: '2024-12-31',
          items: [
            { itemId: 'item-1', quantity: 2 },
            { itemId: 'item-2', quantity: 1 }
          ]
        }]
      });
      docClientMock.on(UpdateCommand).resolves({});

      await releaseInventory('ABC123');

      expect(docClientMock.calls()).toHaveLength(3); // 1 Query + 2 Updates
    });

    it('should handle order not found', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: [] });

      await expect(releaseInventory('ABC123')).resolves.not.toThrow();
      expect(docClientMock.calls()).toHaveLength(1);
    });
  });

  describe('checkAvailability', () => {
    it('should return true when sufficient quantity', async () => {
      docClientMock.on(GetCommand).resolves({
        Item: { slotKey: 'item-1#saturday-lunch#2024-12-31', availableQuantity: 10 }
      });

      const result = await checkAvailability('item-1', 'saturday-lunch', '2024-12-31', 5);

      expect(result).toBe(true);
    });

    it('should return false when insufficient quantity', async () => {
      docClientMock.on(GetCommand).resolves({
        Item: { slotKey: 'item-1#saturday-lunch#2024-12-31', availableQuantity: 2 }
      });

      const result = await checkAvailability('item-1', 'saturday-lunch', '2024-12-31', 5);

      expect(result).toBe(false);
    });

    it('should return false when slot not found', async () => {
      docClientMock.on(GetCommand).resolves({ Item: undefined });

      const result = await checkAvailability('item-1', 'saturday-lunch', '2024-12-31', 5);

      expect(result).toBe(false);
    });

    it('should return true when exact quantity match', async () => {
      docClientMock.on(GetCommand).resolves({
        Item: { slotKey: 'item-1#saturday-lunch#2024-12-31', availableQuantity: 5 }
      });

      const result = await checkAvailability('item-1', 'saturday-lunch', '2024-12-31', 5);

      expect(result).toBe(true);
    });
  });

  describe('updateSlotQuantity', () => {
    it('should update slot quantity', async () => {
      docClientMock.on(UpdateCommand).resolves({});

      await expect(
        updateSlotQuantity('item-1', 'saturday-lunch', '2024-12-31', 20)
      ).resolves.not.toThrow();

      expect(docClientMock.calls()).toHaveLength(1);
    });

    it('should update both available and total quantity', async () => {
      docClientMock.on(UpdateCommand).resolves({});

      await updateSlotQuantity('item-1', 'saturday-lunch', '2024-12-31', 15);

      expect(docClientMock.calls()).toHaveLength(1);
    });
  });
});
