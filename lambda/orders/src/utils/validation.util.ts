import { APIGatewayProxyResult } from 'aws-lambda';
import { createErrorResponse } from './response.util';

const VALID_SLOTS = ['saturday-lunch', 'saturday-dinner', 'sunday-lunch', 'sunday-dinner'];

export interface ValidatedOrderRequest {
  customerName: string;
  deliveryAddress: string;
  contactNumber: string;
  orderScheduled: string;
  slot: string;
  items: Array<{ id: string; quantity: number }>;
  instructions?: string;
}

export interface ValidatedUpdateOrderRequest {
  orderStatus?: string;
  feedbackProvided?: boolean;
  incrementFeedbackRequest?: boolean;
  instructions?: string;
}

export interface ValidatedUpdateSlotRequest {
  itemId: string;
  slot: string;
  date: string;
  quantity: number;
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

  const { customerName, deliveryAddress, contactNumber, orderScheduled, slot, items, instructions } = parsed;

  if (customerName !== undefined && typeof customerName !== 'string') {
    return createErrorResponse(400, 'customerName must be a string');
  }
  if (deliveryAddress !== undefined && typeof deliveryAddress !== 'string') {
    return createErrorResponse(400, 'deliveryAddress must be a string');
  }
  if (contactNumber !== undefined && typeof contactNumber !== 'string') {
    return createErrorResponse(400, 'contactNumber must be a string');
  }
  if (orderScheduled !== undefined && typeof orderScheduled !== 'string') {
    return createErrorResponse(400, 'orderScheduled must be a string');
  }
  if (slot !== undefined && typeof slot !== 'string') {
    return createErrorResponse(400, 'slot must be a string');
  }
  if (items !== undefined && !Array.isArray(items)) {
    return createErrorResponse(400, 'items must be an array');
  }
  if (instructions !== undefined && typeof instructions !== 'string') {
    return createErrorResponse(400, 'instructions must be a string');
  }

  if (!customerName || !deliveryAddress || !contactNumber || !orderScheduled || !slot || !items?.length) {
    return createErrorResponse(400, 'Missing required fields: customerName, deliveryAddress, contactNumber, orderScheduled, slot, items');
  }

  if (!VALID_SLOTS.includes(slot)) {
    return createErrorResponse(400, `Invalid slot. Must be one of: ${VALID_SLOTS.join(', ')}`);
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

  return { customerName, deliveryAddress, contactNumber, orderScheduled, slot, items, instructions };
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

  const { orderStatus, feedbackProvided, incrementFeedbackRequest, instructions } = parsed;

  if (orderStatus !== undefined && typeof orderStatus !== 'string') {
    return createErrorResponse(400, 'orderStatus must be a string');
  }
  if (feedbackProvided !== undefined && typeof feedbackProvided !== 'boolean') {
    return createErrorResponse(400, 'feedbackProvided must be a boolean');
  }
  if (incrementFeedbackRequest !== undefined && typeof incrementFeedbackRequest !== 'boolean') {
    return createErrorResponse(400, 'incrementFeedbackRequest must be a boolean');
  }
  if (instructions !== undefined && typeof instructions !== 'string') {
    return createErrorResponse(400, 'instructions must be a string');
  }

  return { orderStatus, feedbackProvided, incrementFeedbackRequest, instructions };
};

export const validateUpdateSlotRequest = (body: string | null): ValidatedUpdateSlotRequest | APIGatewayProxyResult => {
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

  const { itemId, slot, date, quantity } = parsed;

  if (itemId !== undefined && typeof itemId !== 'string') {
    return createErrorResponse(400, 'itemId must be a string');
  }
  if (slot !== undefined && typeof slot !== 'string') {
    return createErrorResponse(400, 'slot must be a string');
  }
  if (date !== undefined && typeof date !== 'string') {
    return createErrorResponse(400, 'date must be a string');
  }
  if (quantity !== undefined && typeof quantity !== 'number') {
    return createErrorResponse(400, 'quantity must be a number');
  }

  if (!itemId || !slot || !date || quantity === undefined) {
    return createErrorResponse(400, 'Missing required fields: itemId, slot, date, quantity');
  }

  if (quantity < 0 || !Number.isInteger(quantity)) {
    return createErrorResponse(400, 'Quantity must be a non-negative integer');
  }

  return { itemId, slot, date, quantity };
};
