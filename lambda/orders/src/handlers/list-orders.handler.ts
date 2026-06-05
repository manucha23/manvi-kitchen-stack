import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, withOrderVersion } from '../utils';
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

const parseTimestampParam = (value: string): string | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return undefined;
  }

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
};

export const listOrders = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const params = event.queryStringParameters as QueryParams || {};
    const {
      customerPhone,
      orderStatus,
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
    if (params.slotDate || params.slot) {
      return createErrorResponse(400, 'slot and slotDate filters are no longer supported');
    }
    const fromTimestamp = fromDate ? parseTimestampParam(fromDate) : undefined;
    const toTimestamp = toDate ? parseTimestampParam(toDate) : undefined;
    if (fromDate && !fromTimestamp) {
      return createErrorResponse(400, 'Invalid fromDate format. Use ISO timestamp');
    }
    if (toDate && !toTimestamp) {
      return createErrorResponse(400, 'Invalid toDate format. Use ISO timestamp');
    }
    if (fromTimestamp && toTimestamp && fromTimestamp > toTimestamp) {
      return createErrorResponse(400, 'fromDate must be before or equal to toDate');
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

    // Priority: customerPhone > orderStatus
    if (customerPhone) {
      // Strategy 1: Query by customer phone
      indexName = 'customerPhone-createdAt-index';
      keyConditionExpression = 'customerPhone = :phone';
      expressionAttributeValues[':phone'] = customerPhone;

      // Add date range to key condition if provided
      if (fromTimestamp && toTimestamp) {
        keyConditionExpression += ' AND createdAt BETWEEN :fromDate AND :toDate';
        expressionAttributeValues[':fromDate'] = fromTimestamp;
        expressionAttributeValues[':toDate'] = toTimestamp;
      } else if (fromTimestamp) {
        keyConditionExpression += ' AND createdAt >= :fromDate';
        expressionAttributeValues[':fromDate'] = fromTimestamp;
      } else if (toTimestamp) {
        keyConditionExpression += ' AND createdAt <= :toDate';
        expressionAttributeValues[':toDate'] = toTimestamp;
      }
    } else {
      // Strategy 2: Query by status (default)
      indexName = 'status-createdAt-index';
      const status = orderStatus || OrderStatus.CONFIRMED;
      keyConditionExpression = '#status = :status';
      expressionAttributeValues[':status'] = status;
      expressionAttributeNames['#status'] = 'status';

      // Add date range to key condition if provided
      if (fromTimestamp && toTimestamp) {
        keyConditionExpression += ' AND createdAt BETWEEN :fromDate AND :toDate';
        expressionAttributeValues[':fromDate'] = fromTimestamp;
        expressionAttributeValues[':toDate'] = toTimestamp;
      } else if (fromTimestamp) {
        keyConditionExpression += ' AND createdAt >= :fromDate';
        expressionAttributeValues[':fromDate'] = fromTimestamp;
      } else if (toTimestamp) {
        keyConditionExpression += ' AND createdAt <= :toDate';
        expressionAttributeValues[':toDate'] = toTimestamp;
      }
    }

    // Build filter expression for secondary filters
    let filterExpression = '';
    if (orderedBy) {
      filterExpression = 'orderedBy = :orderedBy';
      expressionAttributeValues[':orderedBy'] = orderedBy;
    }

    // Add status filter when querying by customerPhone since status is not in key
    if (customerPhone && orderStatus) {
      filterExpression += filterExpression ? ' AND #status = :statusFilter' : '#status = :statusFilter';
      expressionAttributeValues[':statusFilter'] = orderStatus;
      expressionAttributeNames['#status'] = 'status';
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

    const orders = ((result.Items || []) as Order[]).map(withOrderVersion);

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
