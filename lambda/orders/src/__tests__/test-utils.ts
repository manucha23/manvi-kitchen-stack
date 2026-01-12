import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SFNClient } from '@aws-sdk/client-sfn';

export const docClientMock = mockClient(DynamoDBDocumentClient);
export const sfnClientMock = mockClient(SFNClient);

export const resetMocks = () => {
  docClientMock.reset();
  sfnClientMock.reset();
};

export const mockEnv = {
  ORDER_TABLE: 'test-order-table',
  ITEM_TABLE: 'test-item-table',
  SLOT_AVAILABILITY_TABLE: 'test-slot-table',
  ORDER_HISTORY_TABLE: 'test-history-table',
  CLEANUP_STATE_MACHINE_ARN: 'arn:aws:states:us-east-1:123456789012:stateMachine:test'
};

export const setupEnv = () => {
  Object.assign(process.env, mockEnv);
};
