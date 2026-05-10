import { APIGatewayProxyResult } from 'aws-lambda';
import { createErrorResponse } from './response.util';
import { Slot } from '../models';

const VALID_SLOTS = [Slot.LUNCH, Slot.DINNER];

export interface ValidatedOrderRequest {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  slot: Slot;
  slotDate: string;
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

  const { customerName, customerPhone, deliveryAddress, slot, slotDate, items, instructions } = parsed;

  if (customerName !== undefined && typeof customerName !== 'string') {
    return createErrorResponse(400, 'customerName must be a string');
  }
  if (customerPhone !== undefined && typeof customerPhone !== 'string') {
    return createErrorResponse(400, 'customerPhone must be a string');
  }
  if (deliveryAddress !== undefined && typeof deliveryAddress !== 'string') {
    return createErrorResponse(400, 'deliveryAddress must be a string');
  }
  if (slot !== undefined && typeof slot !== 'string') {
    return createErrorResponse(400, 'slot must be a string');
  }
  if (slotDate !== undefined && typeof slotDate !== 'string') {
    return createErrorResponse(400, 'slotDate must be a string');
  }
  if (items !== undefined && !Array.isArray(items)) {
    return createErrorResponse(400, 'items must be an array');
  }
  if (instructions !== undefined && typeof instructions !== 'string') {
    return createErrorResponse(400, 'instructions must be a string');
  }

  if (!customerName || !customerPhone || !deliveryAddress || !slot || !slotDate || !items?.length) {
    return createErrorResponse(400, 'Missing required fields: customerName, customerPhone, deliveryAddress, slot, slotDate, items');
  }

  if (!VALID_SLOTS.includes(slot as Slot)) {
    return createErrorResponse(400, `Invalid slot. Must be one of: ${VALID_SLOTS.join(', ')}`);
  }

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
    return createErrorResponse(400, 'slotDate must be in YYYY-MM-DD format');
  }

  // Validate slotDate is in the future
  const slotDateTime = new Date(slotDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (slotDateTime < today) {
    return createErrorResponse(400, 'slotDate must be today or in the future');
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

  return { customerName, customerPhone, deliveryAddress, slot: slot as Slot, slotDate, items, instructions };
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
