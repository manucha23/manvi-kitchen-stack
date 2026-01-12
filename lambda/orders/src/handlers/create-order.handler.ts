import { PutCommand, BatchGetCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, getNextOrderId, validateCreateOrderRequest } from '../utils';
import { Order, OrderItem, OrderStatus } from '../models';
import { blockInventory, triggerStateMachine, checkAvailability } from '../services';

const validateScheduledTime = async (scheduledTime: string, slot: string, itemIds: string[]): Promise<boolean> => {
  const scheduled = new Date(scheduledTime);
  const now = new Date();
  
  if (scheduled <= now) {
    return false;
  }

  // Extract date from ISO string
  const scheduleDate = scheduledTime.split('T')[0];

  // Check if slot exists for at least one item (more efficient than Scan)
  // Use first item to verify slot is open
  if (itemIds.length > 0) {
    const slotKey = `${itemIds[0]}#${slot}#${scheduleDate}`;
    const result = await docClient.send(new GetCommand({
      TableName: process.env.SLOT_AVAILABILITY_TABLE!,
      Key: { slotKey }
    }));
    
    return !!result.Item;
  }
  
  return false;
};

export const createOrder = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const validationResult = validateCreateOrderRequest(event.body);
    if ('statusCode' in validationResult) {
      return validationResult;
    }

    const { customerName, deliveryAddress, contactNumber, orderScheduled, slot, items, instructions } = validationResult;

    const orderedBy = event.requestContext.authorizer?.claims?.sub || 
                      event.requestContext.authorizer?.claims?.username;
    
    if (!orderedBy) {
      return createErrorResponse(401, 'User not authenticated');
    }

    // Validate scheduled time (pass slot and itemIds for efficient lookup)
    const itemIds: string[] = items.map((i: any) => i.id);
    if (!(await validateScheduledTime(orderScheduled, slot, itemIds))) {
      return createErrorResponse(400, 'Invalid schedule: must be in the future and exist in available schedules');
    }

    // Extract date from orderScheduled
    const slotDate = orderScheduled.split('T')[0];

    // Generate orderId
    const orderId = getNextOrderId();

    // Fetch and validate items from items table
    const itemsResult = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [process.env.ITEM_TABLE!]: {
          Keys: itemIds.map(id => ({ itemId: id }))
        }
      }
    }));

    const itemsMap = new Map(
      (itemsResult.Responses?.[process.env.ITEM_TABLE!] || []).map((item: any) => [item.itemId, item])
    );

    // Build order items with validation and calculation
    const orderItems: OrderItem[] = [];
    let total = 0;

    for (const requestItem of items) {
      const item = itemsMap.get(requestItem.id);
      if (!item) {
        return createErrorResponse(400, `Item ${requestItem.id} not found`);
      }
      if (!item.available) {
        return createErrorResponse(400, `Item ${item.name} is not available`);
      }

      // Check availability
      const available = await checkAvailability(requestItem.id, slot, slotDate, requestItem.quantity);
      if (!available) {
        return createErrorResponse(400, `Item ${item.name} is sold out for this slot`);
      }

      const amount = item.price * requestItem.quantity;
      orderItems.push({
        itemId: requestItem.id,
        name: item.name,
        price: item.price,
        quantity: requestItem.quantity,
        amount
      });
      total += amount;
    }

    // Create order object
    const order: Order = {
      orderId,
      orderedBy,
      customerName,
      deliveryAddress,
      contactNumber,
      status: OrderStatus.CREATED,
      orderScheduled,
      slot,
      slotDate,
      timestamp: new Date().toISOString(),
      items: orderItems,
      total,
      instructions,
      feedbackProvided: false,
      feedbackRequestCount: 0
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ORDER_TABLE,
      Item: order
    }));

    // Block inventory for each item (with rollback on failure)
    const blockedItems: Array<{id: string, slot: string, date: string, quantity: number}> = [];
    
    try {
      for (const orderItem of orderItems) {
        await blockInventory(orderItem.itemId, slot, slotDate, orderItem.quantity, orderId);
        blockedItems.push({id: orderItem.itemId, slot, date: slotDate, quantity: orderItem.quantity});
      }
      await triggerStateMachine(orderId);
    } catch (blockError) {
      console.error('Error blocking inventory, rolling back:', blockError);
      
      // Rollback: restore quantities for successfully blocked items
      for (const blocked of blockedItems) {
        try {
          await docClient.send(new UpdateCommand({
            TableName: process.env.SLOT_AVAILABILITY_TABLE,
            Key: { slotKey: `${blocked.id}#${blocked.slot}#${blocked.date}` },
            UpdateExpression: 'SET availableQuantity = availableQuantity + :qty',
            ExpressionAttributeValues: { ':qty': blocked.quantity }
          }));
        } catch (rollbackError) {
          console.error('Error during rollback:', rollbackError);
        }
      }
      
      // Delete the created order
      try {
        await docClient.send(new DeleteCommand({
          TableName: process.env.ORDER_TABLE,
          Key: { orderId }
        }));
      } catch (deleteError) {
        console.error('Error deleting order during rollback:', deleteError);
      }
      
      throw new Error(blockError instanceof Error ? blockError.message : 'Failed to block inventory');
    }

    return createSuccessResponse(201, order);
  } catch (error) {
    console.error('Error creating order:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Failed to create order');
  }
};