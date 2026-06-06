import { createHash } from 'crypto';

export const CART_RETENTION_DAYS = 90;
export const ACTIVE_ABANDON_MINUTES = 90;
export const CHECKOUT_ABANDON_MINUTES = 30;

export const normalizePhoneNumber = (phoneNumber: string): string =>
  phoneNumber.replace(/[^\d]/g, '');

export const buildCustomerId = (phoneNumber: string): string =>
  `PHONE#${normalizePhoneNumber(phoneNumber)}`;

export const toEpochSeconds = (date: Date): number =>
  Math.floor(date.getTime() / 1000);

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

export const getRetentionExpiresAt = (date = new Date()): number =>
  toEpochSeconds(addDays(date, CART_RETENTION_DAYS));

export const stableEventId = (cartId: string, eventType: string, createdAt: string): string =>
  createHash('sha256').update(`${cartId}:${eventType}:${createdAt}`).digest('hex');

export const isTownshipAddress = (address: string): boolean => {
  const normalized = address.toLowerCase();
  return [
    'vanaha',
    'township',
    'manvi',
    'kumar picasso',
    'picasso',
  ].some((token) => normalized.includes(token));
};
