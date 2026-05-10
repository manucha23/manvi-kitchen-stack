import { PutCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, getNextOrderId, validateCreateOrderRequest } from '../utils';
import { Order, OrderItem, OrderStatus } from '../models';
import { incrementOrderCount, checkOrderAvailability } from '../services';

export const createOrder = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const validationResult = validateCreateOrderRequest(event.body);
    if ('statusCode' in validationResult) {
      return validationResult;
    }

    const { customerName, customerPhone, deliveryAddress, slot, slotDate, items, instructions } = validationResult;

    const orderedBy = event.requestContext.authorizer?.claims?.sub || 
                      event.requestContext.authorizer?.claims?.username;
    
    if (!orderedBy) {
      return createErrorResponse(401, 'User not authenticated');
    }

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
    let totalAmount = 0;

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
      totalAmount += amount;
    }

    const now = new Date().toISOString();

    // Create order object
    const order: Order = {
      orderId,
      orderedBy,
      customerName,
      customerPhone,
      deliveryAddress,
      status: OrderStatus.CREATED,
      slot,
      slotDate,
      items: orderItems,
      totalAmount,
      instructions,
      createdAt: now,
      updatedAt: now
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ORDER_TABLE,
      Item: order
    }));

    // Increment count for each item
    try {
      for (const orderItem of orderItems) {
        await incrementOrderCount(orderItem.itemId, slot, slotDate, orderItem.quantity);
      }
    } catch (incrementError) {
      console.error('Error incrementing count:', incrementError);
      // Note: Order is already created, consider implementing compensation logic
    }

    return createSuccessResponse(201, order);
  } catch (error) {
    console.error('Error creating order:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Failed to create order');
  }
};