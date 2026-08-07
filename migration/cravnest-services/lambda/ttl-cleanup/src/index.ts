import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);



export const handler = async (event: { orderId: string }) => {
  console.log('Checking order for cleanup:', event);
  const { orderId } = event;

  // Fetch order details
  const orderResult = await docClient.send(new GetCommand({
    TableName: process.env.ORDER_TABLE,
    Key: { orderId }
  }));
  const order = orderResult.Item;

  if (!order) {
    console.log(`Order ${orderId} not found, nothing to clean up.`);
    return { restored: false, orderId, reason: 'Order not found' };
  }

  if (order.status === 'Created') {
    // Restore quantity for each item
    for (const item of order.items || []) {
      const slotKey = `${item.itemId}#${order.slot}#${order.slotDate}`;
      console.log(`Restoring ${item.quantity} units for ${slotKey}`);
      await docClient.send(new UpdateCommand({
        TableName: process.env.SLOT_AVAILABILITY_TABLE,
        Key: { slotKey },
        UpdateExpression: 'SET availableQuantity = availableQuantity + :qty',
        ExpressionAttributeValues: { ':qty': item.quantity }
      }));
    }
    return { restored: true, orderId, itemsRestored: (order.items || []).length };
  }

  console.log(`Order ${orderId} confirmed with status ${order.status}, no restoration needed`);
  return { restored: false, orderId, status: order.status };
};
