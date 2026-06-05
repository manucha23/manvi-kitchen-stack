import { APIGatewayProxyResult } from 'aws-lambda';
import { createErrorResponse } from './response.util';
import { OrderCreatedVia, PaymentMethod } from '../models';

export interface ValidatedOrderRequest {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  paymentMethod: PaymentMethod;
  createdVia: OrderCreatedVia;
  items: Array<{ id: string; quantity: number }>;
  instructions?: string;
}

export interface ValidatedUpdateOrderRequest {
  status?: string;
  instructions?: string;
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

  const {
    customerName,
    customerPhone,
    deliveryAddress,
    paymentMethod = PaymentMethod.COD,
    createdVia = OrderCreatedVia.CUSTOMER_WEB,
    items,
    instructions
  } = parsed;

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
  if (createdVia !== undefined && typeof createdVia !== 'string') {
    return createErrorResponse(400, 'createdVia must be a string');
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
  if (!Object.values(OrderCreatedVia).includes(createdVia as OrderCreatedVia)) {
    return createErrorResponse(400, `Invalid createdVia. Must be one of: ${Object.values(OrderCreatedVia).join(', ')}`);
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

  return {
    customerName,
    customerPhone,
    deliveryAddress,
    paymentMethod: paymentMethod as PaymentMethod,
    createdVia: createdVia as OrderCreatedVia,
    items,
    instructions
  };
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

  const { status, instructions } = parsed;

  if (status !== undefined && typeof status !== 'string') {
    return createErrorResponse(400, 'status must be a string');
  }
  if (instructions !== undefined && typeof instructions !== 'string') {
    return createErrorResponse(400, 'instructions must be a string');
  }

  return { status, instructions };
};
