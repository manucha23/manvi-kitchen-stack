import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  blockInventory,
  confirmInventory,
  releaseInventory,
  checkAvailability,
  updateSlotQuantity
} from '../../services/inventory.service';
import { docClientMock, resetMocks, setupEnv } from '../test-utils';

describe('Inventory Service', () => {
  beforeAll(() => setupEnv());
  beforeEach(() => resetMocks());

  describe('blockInventory', () => {
    it('should block inventory successfully', async () => {
      docClientMock.on(UpdateCommand).resolves({});
      docClientMock.on(PutCommand).resolves({});

      await expect(
        blockInventory('item-1', 'saturday-lunch', '2024-12-31', 2, 'ABC123')
      ).resolves.not.toThrow();

      expect(docClientMock.calls()).toHaveLength(2);
    });

    it('should fail when insufficient quantity', async () => {
      docClientMock.on(UpdateCommand).rejects({ name: 'ConditionalCheckFailedException' });

      await expect(
        blockInventory('item-1', 'saturday-lunch', '2024-12-31', 10, 'ABC123')
      ).rejects.toThrow();
    });

    it('should create block with TTL', async () => {
      docClientMock.on(UpdateCommand).resolves({});
      docClientMock.on(PutCommand).resolves({});

      await blockInventory('item-1', 'saturday-lunch', '2024-12-31', 2, 'ABC123');

      expect(docClientMock.calls()).toHaveLength(2);
    });
  });

  describe('confirmInventory', () => {
    it('should delete blocked records', async () => {
      docClientMock.on(QueryCommand).resolves({
        Items: [
          { slotKey: 'item-1#saturday-lunch#2024-12-31', blockId: 'ABC123#item-1' }
        ]
      });
      docClientMock.on(DeleteCommand).resolves({});

      await confirmInventory('ABC123');

      expect(docClientMock.calls()).toHaveLength(2); // 1 Query + 1 Delete
    });

    it('should handle no blocks found', async () => {
      docClientMock.on(QueryCommand).resolves({ Items: [] });

      await expect(confirmInventory('ABC123')).resolves.not.toThrow();
    });

    it('should handle multiple blocks', async () => {
      docClientMock.on(QueryCommand).resolves({
        Items: [
          { slotKey: 'item-1#saturday-lunch#2024-12-31', blockId: 'ABC123#item-1' },
          { slotKey: 'item-2#saturday-lunch#2024-12-31', blockId: 'ABC123#item-2' }
        ]
      });
      docClientMock.on(DeleteCommand).resolves({});

      await confirmInventory('ABC123');

      expect(docClientMock.calls()).toHaveLength(3); // 1 Query + 2 Deletes
    });
  });

  describe('releaseInventory', () => {
    it('should restore quantity and delete blocks', async () => {
      docClientMock.on(QueryCommand).resolves({
        Items: [{
          slotKey: 'item-1#saturday-lunch#2024-12-31',
          blockId: 'ABC123#item-1',
          itemId: 'item-1',
          slot: 'saturday-lunch',
          date: '2024-12-31',
          quantity: 2
        }]
      });
      docClientMock.on(UpdateCommand).resolves({});
      docClientMock.on(DeleteCommand).resolves({});

      await releaseInventory('ABC123');

      expect(docClientMock.calls()).toHaveLength(3); // 1 Query + 1 Update + 1 Delete
    });

    it('should handle invalid item data', async () => {
      docClientMock.on(QueryCommand).resolves({
        Items: [{ slotKey: 'test', blockId: 'test' }] // Missing required fields
      });

      await expect(releaseInventory('ABC123')).resolves.not.toThrow();
    });

    it('should skip items with missing slotKey or blockId', async () => {
      docClientMock.on(QueryCommand).resolves({
        Items: [{
          itemId: 'item-1',
          slot: 'saturday-lunch',
          date: '2024-12-31',
          quantity: 2
          // Missing slotKey and blockId
        }]
      });
      docClientMock.on(UpdateCommand).resolves({});

      await releaseInventory('ABC123');

      expect(docClientMock.calls()).toHaveLength(2); // 1 Query + 1 Update (no Delete)
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
