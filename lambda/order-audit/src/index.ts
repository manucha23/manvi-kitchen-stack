import { DynamoDBStreamEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event: DynamoDBStreamEvent) => {
  console.log('Processing order audit events:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
      const newImage = record.dynamodb?.NewImage ? unmarshall(record.dynamodb.NewImage as any) : null;
      const oldImage = record.dynamodb?.OldImage ? unmarshall(record.dynamodb.OldImage as any) : null;

      if (!newImage) continue;

      const orderId = newImage.orderId;
      const timestamp = new Date().toISOString();

      const historyRecord: any = {
        orderId,
        timestamp,
        eventType: record.eventName,
        newStatus: newImage.status,
        previousStatus: oldImage?.status || null,
        changes: {},
      };

      // Track what changed
      if (record.eventName === 'MODIFY' && oldImage) {
        if (oldImage.status !== newImage.status) {
          historyRecord.changes.status = { from: oldImage.status, to: newImage.status };
        }
        if (JSON.stringify(oldImage.items) !== JSON.stringify(newImage.items)) {
          historyRecord.changes.items = { from: oldImage.items, to: newImage.items };
        }
        if (oldImage.totalAmount !== newImage.totalAmount) {
          historyRecord.changes.totalAmount = { from: oldImage.totalAmount, to: newImage.totalAmount };
        }
      }

      try {
        await docClient.send(new PutCommand({
          TableName: process.env.ORDER_HISTORY_TABLE,
          Item: historyRecord
        }));

        console.log(`Created audit record for order ${orderId}`);
      } catch (error) {
        console.error(`Error creating audit record for ${orderId}:`, error);
      }
    }
  }

  return { statusCode: 200, body: 'Processed' };
};
