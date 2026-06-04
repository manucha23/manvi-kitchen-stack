import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SNSEvent } from 'aws-lambda';

interface OrderEvent {
  type: 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'ORDER_UPDATED';
  orderId: string;
  createdVia?: string;
  status?: string;
  oldStatus?: string;
  newStatus?: string;
  oldImage?: Record<string, any>;
  newImage?: Record<string, any>;
}

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const getHistoryTable = (): string => {
  const tableName = process.env.ORDER_HISTORY_TABLE;
  if (!tableName) {
    throw new Error('ORDER_HISTORY_TABLE is required');
  }
  return tableName;
};

const calculateChanges = (
  oldImage: Record<string, any> = {},
  newImage: Record<string, any> = {},
): Record<string, { from: unknown; to: unknown }> => {
  const trackedFields = ['status', 'items', 'totalAmount', 'instructions'];
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const field of trackedFields) {
    if (JSON.stringify(oldImage[field]) !== JSON.stringify(newImage[field])) {
      changes[field] = { from: oldImage[field], to: newImage[field] };
    }
  }

  return changes;
};

const buildHistoryRecord = (event: OrderEvent): Record<string, any> => {
  const timestamp = new Date().toISOString();
  const baseRecord = {
    orderId: event.orderId,
    timestamp,
    eventType: event.type,
    createdVia: event.createdVia,
  };

  if (event.type === 'ORDER_CREATED') {
    return {
      ...baseRecord,
      action: 'CREATED',
      newStatus: event.status || event.newImage?.status,
      orderSnapshot: event.newImage,
      newImage: event.newImage,
    };
  }

  return {
    ...baseRecord,
    action: 'UPDATED',
    previousStatus: event.oldStatus || event.oldImage?.status || null,
    newStatus: event.newStatus || event.status || event.newImage?.status,
    oldImage: event.oldImage,
    newImage: event.newImage,
    changes: calculateChanges(event.oldImage, event.newImage),
  };
};

export const handler = async (event: SNSEvent): Promise<void> => {
  console.log('Processing order audit events', JSON.stringify({ count: event.Records.length }));

  for (const record of event.Records) {
    const orderEvent = JSON.parse(record.Sns.Message) as OrderEvent;
    const historyRecord = buildHistoryRecord(orderEvent);

    await docClient.send(new PutCommand({
      TableName: getHistoryTable(),
      Item: historyRecord,
    }));

    console.log('Created audit record', JSON.stringify({
      orderId: historyRecord.orderId,
      eventType: historyRecord.eventType,
    }));
  }
};
