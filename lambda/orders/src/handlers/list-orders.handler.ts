import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from '../utils';
import { Order, OrderStatus } from '../models';

interface QueryParams {
  customerPhone?: string;
  orderStatus?: string;
  slotDate?: string;
  slot?: string;
  orderedBy?: string;
  fromDate?: string;
  toDate?: string;
  limit?: string;
  nextToken?: string;
  sortOrder?: string;
}

const decodeNextToken = (token: string): Record<string, any> | undefined => {
  try {
    return JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
  } catch {
    return undefined;
  }
};

const encodeNextToken = (key: Record<string, any>): string => {
  return Buffer.from(JSON.stringify(key)).toString('base64');
};

const validateDateFormat = (date: string): boolean => {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
};

export const listOrders = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const params = event.queryStringParameters as QueryParams || {};
    const {
      customerPhone,
      orderStatus,
      slotDate,
      slot,
      orderedBy,
      fromDate,
      toDate,
      limit: limitParam,
      nextToken,
      sortOrder
    } = params;

    // Validate limit
    const limit = limitParam ? parseInt(limitParam, 10) : 20;
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return createErrorResponse(400, 'limit must be between 1 and 100');
    }

    // Validate date formats
    if (slotDate && !validateDateFormat(slotDate)) {
      return createErrorResponse(400, 'Invalid slotDate format. Use YYYY-MM-DD');
    }
    if (fromDate && !validateDateFormat(fromDate)) {
      return createErrorResponse(400, 'Invalid fromDate format. Use YYYY-MM-DD');
    }
    if (toDate && !validateDateFormat(toDate)) {
      return createErrorResponse(400, 'Invalid toDate format. Use YYYY-MM-DD');
    }

    // Validate order status
    if (orderStatus && !Object.values(OrderStatus).includes(orderStatus as OrderStatus)) {
      return createErrorResponse(400, `Invalid order status. Must be one of: ${Object.values(OrderStatus).join(', ')}`);
    }

    // Decode pagination token
    let exclusiveStartKey: Record<string, any> | undefined;
    if (nextToken) {
      exclusiveStartKey = decodeNextToken(nextToken);
      if (!exclusiveStartKey) {
        return createErrorResponse(400, 'Invalid nextToken');
      }
    }

    // Determine query strategy based on parameters
    let indexName: string;
    let keyConditionExpression: string;
    const expressionAttributeValues: Record<string, any> = {};
    const expressionAttributeNames: Record<string, string> = {};

    // Priority: customerPhone > slotDate > orderStatus
    if (customerPhone) {
      // Strategy 1: Query by customer phone
      indexName = 'customerPhone-createdAt-index';
      keyConditionExpression = 'customerPhone = :phone';
      expressionAttributeValues[':phone'] = customerPhone;

      // Add date range to key condition if provided
      if (fromDate && toDate) {
        keyConditionExpression += ' AND createdAt BETWEEN :fromDate AND :toDate';
        expressionAttributeValues[':fromDate'] = fromDate;
        expressionAttributeValues[':toDate'] = toDate;
      } else if (fromDate) {
        keyConditionExpression += ' AND createdAt >= :fromDate';
        expressionAttributeValues[':fromDate'] = fromDate;
      } else if (toDate) {
        keyConditionExpression += ' AND createdAt <= :toDate';
        expressionAttributeValues[':toDate'] = toDate;
      }
    } else if (slotDate) {
      // Strategy 2: Query by date and slot
      indexName = 'slotDate-slot-index';
      keyConditionExpression = 'slotDate = :slotDate';
      expressionAttributeValues[':slotDate'] = slotDate;

      // Add slot to key condition if provided
      if (slot) {
        keyConditionExpression += ' AND slot = :slot';
        expressionAttributeValues[':slot'] = slot;
      }
    } else {
      // Strategy 3: Query by status (default)
      indexName = 'status-createdAt-index';
      const status = orderStatus || OrderStatus.CREATED;
      keyConditionExpression = '#status = :status';
      expressionAttributeValues[':status'] = status;
      expressionAttributeNames['#status'] = 'status';

      // Add date range to key condition if provided
      if (fromDate && toDate) {
        keyConditionExpression += ' AND createdAt BETWEEN :fromDate AND :toDate';
        expressionAttributeValues[':fromDate'] = fromDate;
        expressionAttributeValues[':toDate'] = toDate;
      } else if (fromDate) {
        keyConditionExpression += ' AND createdAt >= :fromDate';
        expressionAttributeValues[':fromDate'] = fromDate;
      } else if (toDate) {
        keyConditionExpression += ' AND createdAt <= :toDate';
        expressionAttributeValues[':toDate'] = toDate;
      }
    }

    // Build filter expression for secondary filters
    let filterExpression = '';
    if (orderedBy) {
      filterExpression = 'orderedBy = :orderedBy';
      expressionAttributeValues[':orderedBy'] = orderedBy;
    }

    // Add status filter when querying by customerPhone or slotDate (since status is not in key)
    if ((customerPhone || slotDate) && orderStatus) {
      filterExpression += filterExpression ? ' AND #status = :statusFilter' : '#status = :statusFilter';
      expressionAttributeValues[':statusFilter'] = orderStatus;
      expressionAttributeNames['#status'] = 'status';
    }

    // Add slot filter when querying by status or customerPhone (if slot provided but not in key)
    if (!slotDate && slot) {
      filterExpression += filterExpression ? ' AND slot = :slotFilter' : 'slot = :slotFilter';
      expressionAttributeValues[':slotFilter'] = slot;
    }

    // Add slotDate filter when querying by customerPhone or status (if slotDate provided but not in key)
    if (!slotDate && customerPhone && params.slotDate) {
      filterExpression += filterExpression ? ' AND slotDate = :slotDateFilter' : 'slotDate = :slotDateFilter';
      expressionAttributeValues[':slotDateFilter'] = params.slotDate;
    }

    // Determine sort order (default: descending for most recent first)
    const scanIndexForward = sortOrder === 'asc';

    // Execute query
    const result = await docClient.send(new QueryCommand({
      TableName: process.env.ORDER_TABLE,
      IndexName: indexName,
      KeyConditionExpression: keyConditionExpression,
      FilterExpression: filterExpression || undefined,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
      ScanIndexForward: scanIndexForward
    }));

    const orders = (result.Items || []) as Order[];

    // Build response
    const response: any = {
      items: orders,
      count: orders.length,
      hasMore: !!result.LastEvaluatedKey
    };

    // Add nextToken if more results available
    if (result.LastEvaluatedKey) {
      response.nextToken = encodeNextToken(result.LastEvaluatedKey);
    }

    return createSuccessResponse(200, response);
  } catch (error) {
    console.error('Error listing orders:', error);
    return createErrorResponse(500, 'Failed to list orders');
  }
};