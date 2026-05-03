import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const docClientMock = mockClient(DynamoDBDocumentClient);

export const resetMocks = () => {
  docClientMock.reset();
};

export const mockEnv = {
  ORDER_TABLE: 'test-order-table',
  ITEM_TABLE: 'test-item-table',
  ORDER_HISTORY_TABLE: 'test-history-table',
  ORDER_LIMITS_CONFIG_TABLE: 'test-limits-table',
  ITEM_ORDER_COUNT_TABLE: 'test-count-table'
};

export const setupEnv = () => {
  Object.assign(process.env, mockEnv);
};
