import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from '../utils';
import { Order, OrderStatus } from '../models';

export const listOrders = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { orderStatus, fromDate, toDate, orderedBy, slot } = event.queryStringParameters || {};

    // Default to Created status if no filters provided
    const status = orderStatus || OrderStatus.CREATED;

    if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
      return createErrorResponse(400, 'Invalid order status');
    }

    // Build query expression
    let keyConditionExpression = 'orderStatus = :status';
    const expressionAttributeValues: Record<string, any> = { ':status': status };

    // Add date range to key condition if provided
    if (fromDate && toDate) {
      keyConditionExpression += ' AND slotDate BETWEEN :fromDate AND :toDate';
      expressionAttributeValues[':fromDate'] = fromDate;
      expressionAttributeValues[':toDate'] = toDate;
    } else if (fromDate) {
      keyConditionExpression += ' AND slotDate >= :fromDate';
      expressionAttributeValues[':fromDate'] = fromDate;
    } else if (toDate) {
      keyConditionExpression += ' AND slotDate <= :toDate';
      expressionAttributeValues[':toDate'] = toDate;
    }

    // Build filter expression for additional filters
    let filterExpression = '';
    if (orderedBy) {
      filterExpression = 'orderedBy = :orderedBy';
      expressionAttributeValues[':orderedBy'] = orderedBy;
    }
    if (slot) {
      filterExpression += filterExpression ? ' AND slot = :slot' : 'slot = :slot';
      expressionAttributeValues[':slot'] = slot;
    }

    const result = await docClient.send(new QueryCommand({
      TableName: process.env.ORDER_TABLE,
      IndexName: 'orderStatus-slotDate-index',
      KeyConditionExpression: keyConditionExpression,
      FilterExpression: filterExpression || undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: false
    }));

    const orders = (result.Items || []) as Order[];

    return createSuccessResponse(200, {
      items: orders,
      count: orders.length
    });
  } catch (error) {
    console.error('Error listing orders:', error);
    return createErrorResponse(500, 'Failed to list orders');
  }
};