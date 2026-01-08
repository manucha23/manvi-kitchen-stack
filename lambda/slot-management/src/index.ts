import { ScanCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const SLOTS = ['saturday-lunch', 'saturday-dinner', 'sunday-lunch', 'sunday-dinner'];
const DEFAULT_QUANTITY = 10;

export const handler = async () => {
  try {
    console.log('Opening new slots for the week...');

    // Get upcoming Saturday date
    const saturday = getNextSaturday();
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);

    const saturdayStr = saturday.toISOString().split('T')[0];
    const sundayStr = sunday.toISOString().split('T')[0];

    // Get all items
    const itemsResult = await docClient.send(new ScanCommand({
      TableName: process.env.ITEM_TABLE
    }));

    const items = itemsResult.Items || [];
    console.log(`Found ${items.length} items`);

    // Create slot availability for each item
    for (const item of items) {
      for (const slot of SLOTS) {
        const date = slot.startsWith('saturday') ? saturdayStr : sundayStr;
        const slotKey = `${item.itemId}#${slot}#${date}`;

        // Check if slot already exists
        const existing = await docClient.send(new GetCommand({
          TableName: process.env.SLOT_AVAILABILITY_TABLE,
          Key: { slotKey }
        }));

        if (!existing.Item) {
          await docClient.send(new PutCommand({
            TableName: process.env.SLOT_AVAILABILITY_TABLE,
            Item: {
              slotKey,
              itemId: item.itemId,
              itemName: item.name,
              slot,
              date,
              availableQuantity: DEFAULT_QUANTITY,
              totalQuantity: DEFAULT_QUANTITY,
              createdAt: new Date().toISOString()
            }
          }));
          console.log(`Created slot: ${slotKey}`);
        }
      }
    }

    console.log('Slot opening completed successfully');
    return { statusCode: 200, body: 'Slots opened successfully' };
  } catch (error) {
    console.error('Error opening slots:', error);
    throw error;
  }
};

const getNextSaturday = (): Date => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
  const saturday = new Date(now);
  saturday.setDate(now.getDate() + daysUntilSaturday);
  saturday.setHours(0, 0, 0, 0);
  return saturday;
};
