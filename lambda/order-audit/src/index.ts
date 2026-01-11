import { DynamoDBStreamEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event: DynamoDBStreamEvent) => {
  console.log('Processing order audit events:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const eventName = record.eventName;
    const newImage = record.dynamodb?.NewImage ? unmarshall(record.dynamodb.NewImage as any) : null;
    const oldImage = record.dynamodb?.OldImage ? unmarshall(record.dynamodb.OldImage as any) : null;

    // Get orderId from either new or old image
    const orderId = newImage?.orderId || oldImage?.orderId;
    if (!orderId) continue;

    const timestamp = new Date().toISOString();

    const historyRecord: any = {
      orderId,
      timestamp,
      eventType: eventName,
    };

    if (eventName === 'INSERT' && newImage) {
      // Order created
      historyRecord.action = 'CREATED';
      historyRecord.orderSnapshot = newImage;
      historyRecord.newStatus = newImage.orderStatus;
    } else if (eventName === 'MODIFY' && newImage && oldImage) {
      // Order updated
      historyRecord.action = 'UPDATED';
      historyRecord.newStatus = newImage.orderStatus;
      historyRecord.previousStatus = oldImage.orderStatus || null;
      historyRecord.changes = {};

      // Track what changed
      if (oldImage.orderStatus !== newImage.orderStatus) {
        historyRecord.changes.orderStatus = { from: oldImage.orderStatus, to: newImage.orderStatus };
      }
      if (JSON.stringify(oldImage.items) !== JSON.stringify(newImage.items)) {
        historyRecord.changes.items = { from: oldImage.items, to: newImage.items };
      }
      if (oldImage.total !== newImage.total) {
        historyRecord.changes.total = { from: oldImage.total, to: newImage.total };
      }
      if (oldImage.instructions !== newImage.instructions) {
        historyRecord.changes.instructions = { from: oldImage.instructions, to: newImage.instructions };
      }
    } else if (eventName === 'REMOVE' && oldImage) {
      // Order deleted - CRITICAL: Save full snapshot
      historyRecord.action = 'DELETED';
      historyRecord.orderSnapshot = oldImage; // Save complete order data
      historyRecord.deletedStatus = oldImage.orderStatus;
      historyRecord.deletedBy = 'SYSTEM'; // Could extract from context if available
    }

    try {
      await docClient.send(new PutCommand({
        TableName: process.env.ORDER_HISTORY_TABLE,
        Item: historyRecord
      }));

      console.log(`Created audit record for order ${orderId}: ${eventName}`);
    } catch (error) {
      console.error(`Error creating audit record for ${orderId}:`, error);
    }
  }

  return { statusCode: 200, body: 'Processed' };
};
