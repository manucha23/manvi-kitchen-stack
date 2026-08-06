import { OrderEventMessage } from '../types';

export const normalizeFirstName = (name?: string): string => {
  if (!name) return 'Customer';
  const trimmed = name.trim();
  if (!trimmed) return 'Customer';
  const firstName = trimmed.split(/\s+/)[0];
  return firstName || 'Customer';
};

export const normalizePhoneNumber = (phone?: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
};

export const extractParamValue = (paramKey: string, orderEvent: OrderEventMessage): string => {
  switch (paramKey) {
    case 'customerName':
    case 'Name':
    case 'name':
      return normalizeFirstName(
        orderEvent.customerName ||
        orderEvent.dynamodb?.NewImage?.customerName?.S
      );
    case 'orderId':
    case 'OrderId':
    case 'id':
      return orderEvent.orderId || orderEvent.dynamodb?.NewImage?.orderId?.S || '';
    default:
      return String(
        (orderEvent.dynamodb?.NewImage && orderEvent.dynamodb.NewImage[paramKey]?.S) || ''
      );
  }
};
