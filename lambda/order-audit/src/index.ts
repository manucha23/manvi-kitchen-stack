import { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { AttributeValue, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

type OrderImage = Record<string, unknown>;

export type AuditChangeType = 'CREATED' | 'STATUS_CHANGE' | 'UPDATED' | 'DELETED';

export interface FieldChange {
  from?: unknown;
  to?: unknown;
}

export interface OrderAuditRecord {
  orderId: string;
  timestamp: string;
  eventType: DynamoDBRecord['eventName'];
  changeType: AuditChangeType;
  oldStatus?: string;
  newStatus?: string;
  changedFields?: string[];
  changes?: Record<string, FieldChange>;
  oldImage?: OrderImage;
  newImage?: OrderImage;
}

const AUDITED_FIELDS = [
  'status',
  'paymentMethod',
  'paymentStatus',
  'promisedDeliveryAt',
  'customerName',
  'customerPhone',
  'deliveryAddress',
  'items',
  'totalAmount',
  'instructions',
  'version',
  'createdAt',
  'updatedAt',
] as const;

const unmarshallImage = (image?: Record<string, AttributeValue>): OrderImage | undefined =>
  image ? unmarshall(image) : undefined;

const getStatus = (image?: OrderImage): string | undefined =>
  typeof image?.status === 'string' ? image.status : undefined;

const valuesDiffer = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left ?? null) !== JSON.stringify(right ?? null);

const getChangedFields = (oldImage: OrderImage, newImage: OrderImage): Record<string, FieldChange> => {
  const changes: Record<string, FieldChange> = {};

  for (const field of AUDITED_FIELDS) {
    if (valuesDiffer(oldImage[field], newImage[field])) {
      changes[field] = {
        from: oldImage[field],
        to: newImage[field],
      };
    }
  }

  return changes;
};

export const buildAuditRecord = (
  rawRecord: any,
  timestamp = new Date().toISOString(),
): OrderAuditRecord | undefined => {
  let record: DynamoDBRecord = rawRecord;

  if (rawRecord.body) {
    try {
      const bodyData = typeof rawRecord.body === 'string' ? JSON.parse(rawRecord.body) : rawRecord.body;
      const messageContent = typeof bodyData.Message === 'string' ? JSON.parse(bodyData.Message) : bodyData;
      record = {
        eventName: messageContent.eventName || 'MODIFY',
        dynamodb: messageContent.dynamodb,
      } as DynamoDBRecord;
    } catch (err) {
      console.warn('Failed to parse SQS body in order-audit:', err);
      return undefined;
    }
  }

  const oldImage = unmarshallImage(record.dynamodb?.OldImage as Record<string, AttributeValue> | undefined);
  const newImage = unmarshallImage(record.dynamodb?.NewImage as Record<string, AttributeValue> | undefined);
  const orderId = String(newImage?.orderId || oldImage?.orderId || '');

  if (!orderId || !record.eventName) {
    return undefined;
  }

  if (record.eventName === 'INSERT' && newImage) {
    return {
      orderId,
      timestamp,
      eventType: record.eventName,
      changeType: 'CREATED',
      newStatus: getStatus(newImage),
      newImage,
    };
  }

  if (record.eventName === 'MODIFY' && oldImage && newImage) {
    const changes = getChangedFields(oldImage, newImage);
    const changedFields = Object.keys(changes);
    const oldStatus = getStatus(oldImage);
    const newStatus = getStatus(newImage);

    return {
      orderId,
      timestamp,
      eventType: record.eventName,
      changeType: oldStatus !== newStatus ? 'STATUS_CHANGE' : 'UPDATED',
      oldStatus,
      newStatus,
      changedFields,
      changes,
      oldImage,
      newImage,
    };
  }

  if (record.eventName === 'REMOVE' && oldImage) {
    return {
      orderId,
      timestamp,
      eventType: record.eventName,
      changeType: 'DELETED',
      oldStatus: getStatus(oldImage),
      oldImage,
    };
  }

  return undefined;
};

export const handler = async (event: any) => {
  console.log('Processing order audit events:', JSON.stringify(event, null, 2));

  if (!event || !Array.isArray(event.Records)) {
    return { statusCode: 200, body: 'No records to process' };
  }

  for (const record of event.Records) {
    const auditRecord = buildAuditRecord(record);
    if (!auditRecord) {
      continue;
    }

    try {
      await docClient.send(new PutCommand({
        TableName: process.env.ORDER_HISTORY_TABLE,
        Item: auditRecord,
      }));

      console.log(`Created audit record for order ${auditRecord.orderId}: ${auditRecord.changeType}`);
    } catch (error) {
      console.error(`Error creating audit record for ${auditRecord.orderId}:`, error);
    }
  }

  return { statusCode: 200, body: 'Processed' };
};
