import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client);

export const createSuccessResponse = (statusCode: number, data: any) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  },
  body: JSON.stringify(data),
});

export const createErrorResponse = (statusCode: number, message: string) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  },
  body: JSON.stringify({ message }),
});

export const validateSetLimitsRequest = (body: string | null): any => {
  if (!body) {
    return { statusCode: 400, message: 'Request body is required' };
  }

  try {
    const parsed = JSON.parse(body);
    
    if (!parsed.itemId || typeof parsed.itemId !== 'string') {
      return { statusCode: 400, message: 'itemId is required and must be a string' };
    }

    if (parsed.lunchLimit !== undefined && (typeof parsed.lunchLimit !== 'number' || parsed.lunchLimit < 0)) {
      return { statusCode: 400, message: 'lunchLimit must be a non-negative number' };
    }

    if (parsed.dinnerLimit !== undefined && (typeof parsed.dinnerLimit !== 'number' || parsed.dinnerLimit < 0)) {
      return { statusCode: 400, message: 'dinnerLimit must be a non-negative number' };
    }

    if (parsed.itemName !== undefined && typeof parsed.itemName !== 'string') {
      return { statusCode: 400, message: 'itemName must be a string' };
    }

    return parsed;
  } catch (e) {
    return { statusCode: 400, message: 'Invalid JSON in request body' };
  }
};

export const validateSetKillswitchRequest = (body: string | null): any => {
  if (!body) {
    return { statusCode: 400, message: 'Request body is required' };
  }

  try {
    const parsed = JSON.parse(body);
    
    if (parsed.isAcceptingOrders === undefined && parsed.globalKillswitch === undefined) {
      return { statusCode: 400, message: 'Either isAcceptingOrders or globalKillswitch must be provided' };
    }

    if (parsed.itemId !== undefined && typeof parsed.itemId !== 'string') {
      return { statusCode: 400, message: 'itemId must be a string' };
    }

    if (parsed.isAcceptingOrders !== undefined && typeof parsed.isAcceptingOrders !== 'boolean') {
      return { statusCode: 400, message: 'isAcceptingOrders must be a boolean' };
    }

    if (parsed.globalKillswitch !== undefined && typeof parsed.globalKillswitch !== 'boolean') {
      return { statusCode: 400, message: 'globalKillswitch must be a boolean' };
    }

    return parsed;
  } catch (e) {
    return { statusCode: 400, message: 'Invalid JSON in request body' };
  }
};
