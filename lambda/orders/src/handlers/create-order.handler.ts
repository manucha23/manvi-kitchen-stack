import { PutCommand, BatchGetCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, getNextOrderId, validateCreateOrderRequest } from '../utils';
import { Order, OrderItem, OrderStatus } from '../models';
import { incrementOrderCount, checkOrderAvailability } from '../services';

const validateScheduledTime = async (scheduledTime: string, slot: string): Promise<boolean> => {
  const scheduled = new Date(scheduledTime);
  const now = new Date();
  
  if (scheduled <= now) {
    return false;
  }

  return true;
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

    // Validate scheduled time
    if (!(await validateScheduledTime(orderScheduled, slot))) {
      return createErrorResponse(400, 'Invalid schedule: must be in the future');
    }

    // Extract date from orderScheduled
    const slotDate = orderScheduled.split('T')[0];

    // Generate orderId
    const orderId = getNextOrderId();

    // Extract item IDs for batch retrieval
    const itemIds: string[] = items.map((i: any) => i.id);

    // Fetch and validate items from items table
    const itemsResult = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [process.env.ITEM_TABLE!]: {
          Keys: itemIds.map((id: string) => ({ itemId: id }))
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

      // Check availability with limit validation
      const availabilityCheck = await checkOrderAvailability(requestItem.id, slot, slotDate, requestItem.quantity);
      if (!availabilityCheck.available) {
        return createErrorResponse(400, availabilityCheck.reason || `Item ${item.name} is not available for this slot`);
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
      feedbackRequestCount: 0,
      acceptanceStatus: 'accepted' // Accepted by default after limit check passes
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ORDER_TABLE,
      Item: order
    }));

    // Increment count for each item (now that order is created and validated)
    const incrementedItems: Array<{id: string, slot: string, date: string, quantity: number}> = [];
    
    try {
      for (const orderItem of orderItems) {
        await incrementOrderCount(orderItem.itemId, slot, slotDate, orderItem.quantity);
        incrementedItems.push({id: orderItem.itemId, slot, date: slotDate, quantity: orderItem.quantity});
      }
    } catch (incrementError) {
      console.error('Error incrementing count, rolling back:', incrementError);
      
      // Rollback: delete the created order
      try {
        await docClient.send(new DeleteCommand({
          TableName: process.env.ORDER_TABLE,
          Key: { orderId }
        }));
      } catch (deleteError) {
        console.error('Error deleting order during rollback:', deleteError);
      }
      
      throw new Error(incrementError instanceof Error ? incrementError.message : 'Failed to increment order count');
    }

    return createSuccessResponse(201, order);
  } catch (error) {
    console.error('Error creating order:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Failed to create order');
  }
};