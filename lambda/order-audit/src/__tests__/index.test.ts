import { AttributeValue } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBRecord } from 'aws-lambda';
import { buildAuditRecord } from '../index';

const image = (value: Record<string, unknown>): Record<string, AttributeValue> =>
  marshall(value, { removeUndefinedValues: true }) as Record<string, AttributeValue>;

const streamRecord = (
  eventName: DynamoDBRecord['eventName'],
  oldImage?: Record<string, unknown>,
  newImage?: Record<string, unknown>,
): DynamoDBRecord => ({
  eventName,
  dynamodb: {
    OldImage: oldImage ? image(oldImage) : undefined,
    NewImage: newImage ? image(newImage) : undefined,
  },
} as DynamoDBRecord);

const baseOrder = {
  orderId: 'ABC123',
  orderedBy: 'customer-sub',
  customerName: 'Asha',
  customerPhone: '+919999999999',
  deliveryAddress: 'Bavdhan, Pune',
  status: 'READY',
  paymentMethod: 'COD',
  paymentStatus: 'NOT_REQUIRED',
  promisedDeliveryAt: '2026-07-27T14:00:00.000Z',
  items: [{ itemId: 'meal-1', name: 'Thali', price: 250, quantity: 2, amount: 500 }],
  totalAmount: 500,
  instructions: 'No onion',
  createdAt: '2026-07-27T10:00:00.000Z',
  updatedAt: '2026-07-27T10:00:00.000Z',
  version: 1,
};

describe('buildAuditRecord', () => {
  it('maps inserted orders with current status fields', () => {
    const auditRecord = buildAuditRecord(streamRecord('INSERT', undefined, baseOrder), 'now');

    expect(auditRecord).toMatchObject({
      orderId: 'ABC123',
      timestamp: 'now',
      eventType: 'INSERT',
      changeType: 'CREATED',
      newStatus: 'READY',
      newImage: {
        status: 'READY',
        totalAmount: 500,
      },
    });
    expect(auditRecord).not.toHaveProperty('orderStatus');
  });

  it('maps status changes from status to status', () => {
    const newOrder = {
      ...baseOrder,
      status: 'COMPLETED',
      updatedAt: '2026-07-27T11:00:00.000Z',
      version: 2,
    };

    const auditRecord = buildAuditRecord(streamRecord('MODIFY', baseOrder, newOrder), 'now');

    expect(auditRecord).toMatchObject({
      orderId: 'ABC123',
      changeType: 'STATUS_CHANGE',
      oldStatus: 'READY',
      newStatus: 'COMPLETED',
      changedFields: ['status', 'version', 'updatedAt'],
      changes: {
        status: { from: 'READY', to: 'COMPLETED' },
        version: { from: 1, to: 2 },
        updatedAt: { from: '2026-07-27T10:00:00.000Z', to: '2026-07-27T11:00:00.000Z' },
      },
    });
  });

  it('keeps non-status updates as updated records', () => {
    const newOrder = {
      ...baseOrder,
      instructions: 'Ring bell',
      updatedAt: '2026-07-27T11:00:00.000Z',
      version: 2,
    };

    const auditRecord = buildAuditRecord(streamRecord('MODIFY', baseOrder, newOrder), 'now');

    expect(auditRecord).toMatchObject({
      changeType: 'UPDATED',
      oldStatus: 'READY',
      newStatus: 'READY',
      changes: {
        instructions: { from: 'No onion', to: 'Ring bell' },
      },
    });
    expect(auditRecord?.changedFields).toEqual(['instructions', 'version', 'updatedAt']);
  });

  it('maps removed orders with the old snapshot', () => {
    const auditRecord = buildAuditRecord(streamRecord('REMOVE', baseOrder), 'now');

    expect(auditRecord).toMatchObject({
      orderId: 'ABC123',
      eventType: 'REMOVE',
      changeType: 'DELETED',
      oldStatus: 'READY',
      oldImage: {
        orderId: 'ABC123',
        status: 'READY',
        totalAmount: 500,
      },
    });
  });
});
