import { PutCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, getNextOrderId, validateCreateOrderRequest, getCallerContext } from '../utils';
import { Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus } from '../models';
import { validateOrderingWindow } from '../services';

export const createOrder = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const validationResult = validateCreateOrderRequest(event.body);
    if ('statusCode' in validationResult) {
      return validationResult;
    }

    const caller = getCallerContext(event);
    if (!caller.principalId) {
      return createErrorResponse(401, 'User not authenticated');
    }
    if (caller.isAdminRoute && !caller.isAdmin) {
      return createErrorResponse(403, 'Admin access is required');
    }

    const { customerName, customerPhone, customerEmail, deliveryAddress, paymentMethod, items, instructions } = validationResult;
    const orderedBy = caller.isCustomerRoute ? caller.principalId : caller.principalId;
    const resolvedCustomerEmail = customerEmail || caller.email;

    // Generate orderId
    const orderId = getNextOrderId();

    // Extract item IDs for batch retrieval
    const itemIds: string[] = Array.from(new Set(items.map((i: any) => i.id)));

    const orderingWindow = await validateOrderingWindow();
    if (!orderingWindow.valid) {
      return createErrorResponse(400, orderingWindow.reason || 'Orders are not being accepted right now');
    }

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
    const isCodOrder = paymentMethod === PaymentMethod.COD;
    const status = isCodOrder ? OrderStatus.CREATED : OrderStatus.PENDING_PAYMENT;
    const paymentStatus = isCodOrder ? PaymentStatus.NOT_REQUIRED : PaymentStatus.PENDING;

    // Create order object
    const order: Order = {
      orderId,
      orderedBy,
      customerName,
      customerPhone,
      ...(resolvedCustomerEmail ? { customerEmail: resolvedCustomerEmail } : {}),
      deliveryAddress,
      status,
      paymentMethod,
      paymentStatus,
      promisedDeliveryAt: orderingWindow.promisedDeliveryAt!,
      items: orderItems,
      totalAmount,
      instructions,
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    await docClient.send(new PutCommand({
      TableName: process.env.ORDER_TABLE,
      Item: order,
      ConditionExpression: 'attribute_not_exists(orderId)',
    }));

    return createSuccessResponse(201, order);
  } catch (error) {
    console.error('Error creating order:', error);
    return createErrorResponse(500, error instanceof Error ? error.message : 'Failed to create order');
  }
};
