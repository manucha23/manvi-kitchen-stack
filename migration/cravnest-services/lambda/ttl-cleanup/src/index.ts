import { DynamoDBStreamEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event: DynamoDBStreamEvent) => {
  console.log('Processing TTL cleanup events:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    if (record.eventName === 'REMOVE' && record.dynamodb?.OldImage) {
      const oldImage = unmarshall(record.dynamodb.OldImage as any);
      
      // Only process TTL deletions (status = BLOCKED)
      if (oldImage.status === 'BLOCKED') {
        const { itemId, slot, date, quantity } = oldImage;
        const slotKey = `${itemId}#${slot}#${date}`;

        console.log(`Restoring ${quantity} units for ${slotKey}`);

        try {
          await docClient.send(new UpdateCommand({
            TableName: process.env.SLOT_AVAILABILITY_TABLE,
            Key: { slotKey },
            UpdateExpression: 'SET availableQuantity = availableQuantity + :qty',
            ExpressionAttributeValues: { ':qty': quantity }
          }));

          console.log(`Successfully restored ${quantity} units for ${slotKey}`);
        } catch (error) {
          console.error(`Error restoring quantity for ${slotKey}:`, error);
        }
      }
    }
  }

  return { statusCode: 200, body: 'Processed' };
};
