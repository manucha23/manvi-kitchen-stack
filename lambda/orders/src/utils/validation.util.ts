import { APIGatewayProxyResult } from 'aws-lambda';
import { createErrorResponse } from './response.util';
import { PaymentMethod } from '../models';

export interface ValidatedOrderRequest {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  paymentMethod: PaymentMethod;
  items: Array<{ id: string; quantity: number }>;
  instructions?: string;
}

export interface ValidatedUpdateOrderRequest {
  version: number;
  status?: string;
  instructions?: string;
}

export interface BulkOrderVersion {
  orderId: string;
  version: number;
}

export interface BulkOrderUpdate {
  status?: string;
}

export interface ValidatedBulkUpdateOrdersRequest {
  orders: BulkOrderVersion[];
  update: BulkOrderUpdate;
}

export const validateCreateOrderRequest = (body: string | null): ValidatedOrderRequest | APIGatewayProxyResult => {
  if (!body) {
    return createErrorResponse(400, 'Request body is required');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    return createErrorResponse(400, 'Invalid JSON format');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return createErrorResponse(400, 'Request body must be an object');
  }

  const { customerName, customerPhone, deliveryAddress, paymentMethod = PaymentMethod.COD, items, instructions } = parsed;

  if (customerName !== undefined && typeof customerName !== 'string') {
    return createErrorResponse(400, 'customerName must be a string');
  }
  if (customerPhone !== undefined && typeof customerPhone !== 'string') {
    return createErrorResponse(400, 'customerPhone must be a string');
  }
  if (deliveryAddress !== undefined && typeof deliveryAddress !== 'string') {
    return createErrorResponse(400, 'deliveryAddress must be a string');
  }
  if (items !== undefined && !Array.isArray(items)) {
    return createErrorResponse(400, 'items must be an array');
  }
  if (paymentMethod !== undefined && typeof paymentMethod !== 'string') {
    return createErrorResponse(400, 'paymentMethod must be a string');
  }
  if (instructions !== undefined && typeof instructions !== 'string') {
    return createErrorResponse(400, 'instructions must be a string');
  }

  if (!customerName || !customerPhone || !deliveryAddress || !items?.length) {
    return createErrorResponse(400, 'Missing required fields: customerName, customerPhone, deliveryAddress, items');
  }

  if (!Object.values(PaymentMethod).includes(paymentMethod as PaymentMethod)) {
    return createErrorResponse(400, `Invalid paymentMethod. Must be one of: ${Object.values(PaymentMethod).join(', ')}`);
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item !== 'object' || item === null) {
      return createErrorResponse(400, `items[${i}] must be an object`);
    }
    if (typeof item.id !== 'string') {
      return createErrorResponse(400, `items[${i}].id must be a string`);
    }
    if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      return createErrorResponse(400, `items[${i}].quantity must be a positive integer`);
    }
  }

  return { customerName, customerPhone, deliveryAddress, paymentMethod: paymentMethod as PaymentMethod, items, instructions };
};

export const validateUpdateOrderRequest = (body: string | null): ValidatedUpdateOrderRequest | APIGatewayProxyResult => {
  if (!body) {
    return createErrorResponse(400, 'Request body is required');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    return createErrorResponse(400, 'Invalid JSON format');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return createErrorResponse(400, 'Request body must be an object');
  }

  const { status, instructions, version } = parsed;

  if (version === undefined) {
    return createErrorResponse(400, 'version is required');
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return createErrorResponse(400, 'version must be a positive integer');
  }
  if (status !== undefined && typeof status !== 'string') {
    return createErrorResponse(400, 'status must be a string');
  }
  if (instructions !== undefined && typeof instructions !== 'string') {
    return createErrorResponse(400, 'instructions must be a string');
  }

  return { status, instructions, version };
};

export const validateBulkUpdateOrdersRequest = (body: string | null): ValidatedBulkUpdateOrdersRequest | APIGatewayProxyResult => {
  if (!body) {
    return createErrorResponse(400, 'Request body is required');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    return createErrorResponse(400, 'Invalid JSON format');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return createErrorResponse(400, 'Request body must be an object');
  }

  const { orders, update } = parsed;

  if (!Array.isArray(orders)) {
    return createErrorResponse(400, 'orders must be an array');
  }
  if (orders.length === 0) {
    return createErrorResponse(400, 'orders must contain at least one order');
  }
  if (orders.length > 100) {
    return createErrorResponse(400, 'orders cannot contain more than 100 orders');
  }
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    if (typeof order !== 'object' || order === null || Array.isArray(order)) {
      return createErrorResponse(400, `orders[${i}] must be an object`);
    }
    if (typeof order.orderId !== 'string') {
      return createErrorResponse(400, `orders[${i}].orderId must be a string`);
    }
    if (!/^[A-Z0-9]{6}$/.test(order.orderId)) {
      return createErrorResponse(400, `orders[${i}].orderId has invalid orderId format`);
    }
    if (typeof order.version !== 'number' || !Number.isInteger(order.version) || order.version < 1) {
      return createErrorResponse(400, `orders[${i}].version must be a positive integer`);
    }
  }

  const uniqueOrderIds = new Set(orders.map((order) => order.orderId));
  if (uniqueOrderIds.size !== orders.length) {
    return createErrorResponse(400, 'orders must not contain duplicate orderIds');
  }

  if (typeof update !== 'object' || update === null || Array.isArray(update)) {
    return createErrorResponse(400, 'update must be an object');
  }

  if (update.status !== undefined && typeof update.status !== 'string') {
    return createErrorResponse(400, 'update.status must be a string');
  }

  return { orders, update: { status: update.status } };
};
