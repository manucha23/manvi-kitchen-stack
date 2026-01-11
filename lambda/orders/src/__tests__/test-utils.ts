import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const docClientMock = mockClient(DynamoDBDocumentClient);

export const resetMocks = () => {
  docClientMock.reset();
};

export const mockEnv = {
  ORDER_TABLE: 'test-order-table',
  ITEM_TABLE: 'test-item-table',
  SLOT_AVAILABILITY_TABLE: 'test-slot-table',
  INVENTORY_TABLE: 'test-inventory-table',
  ORDER_HISTORY_TABLE: 'test-history-table'
};

export const setupEnv = () => {
  Object.assign(process.env, mockEnv);
};
