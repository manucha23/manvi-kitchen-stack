import { AttributeValue } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBRecord } from 'aws-lambda';
import {
  buildEmailContent,
  buildInvoicePdf,
  buildInvoiceS3Key,
  buildRawEmail,
  extractCompletedOrder,
  Order,
} from '../index';

const image = (value: Record<string, unknown>): Record<string, AttributeValue> =>
  marshall(value, { removeUndefinedValues: true }) as Record<string, AttributeValue>;

const record = (
  eventName: DynamoDBRecord['eventName'],
  oldImage?: Record<string, unknown>,
  newImage?: Record<string, unknown>,
): DynamoDBRecord => ({
  eventName,
  dynamodb: {
    OldImage: oldImage ? image(oldImage) : undefined,
    NewImage: newImage ? image(newImage) : undefined,
  },
} as DynamoDBRecord);

const baseOrder: Order = {
  orderId: 'ABC123',
  customerName: 'Asha',
  customerPhone: '+919999999999',
  customerEmail: 'asha@example.com',
  deliveryAddress: 'Bavdhan, Pune',
  status: 'READY',
  paymentMethod: 'COD',
  paymentStatus: 'NOT_REQUIRED',
  promisedDeliveryAt: '2026-07-27T14:00:00.000Z',
  items: [{ itemId: 'meal-1', name: 'Thali', price: 250, quantity: 2, amount: 500 }],
  totalAmount: 500,
  updatedAt: '2026-07-27T14:10:00.000Z',
  version: 3,
};

describe('extractCompletedOrder', () => {
  it('extracts orders that transition into COMPLETED', () => {
    const completed = { ...baseOrder, status: 'COMPLETED', version: 4 };

    expect(extractCompletedOrder(record('MODIFY', baseOrder as unknown as Record<string, unknown>, completed))).toMatchObject({
      orderId: 'ABC123',
      status: 'COMPLETED',
      customerEmail: 'asha@example.com',
    });
  });

  it('ignores inserts and non-completed updates', () => {
    expect(extractCompletedOrder(record('INSERT', undefined, baseOrder as unknown as Record<string, unknown>))).toBeUndefined();
    expect(extractCompletedOrder(record('MODIFY', baseOrder as unknown as Record<string, unknown>, { ...baseOrder, status: 'DISPATCHED' }))).toBeUndefined();
  });

  it('ignores already-completed orders and already-claimed invoice records', () => {
    const completed = { ...baseOrder, status: 'COMPLETED' };

    expect(extractCompletedOrder(record('MODIFY', completed, completed))).toBeUndefined();
    expect(extractCompletedOrder(record('MODIFY', baseOrder as unknown as Record<string, unknown>, {
      ...completed,
      invoiceEmailProcessingAt: '2026-07-27T14:59:00.000Z',
    }))).toBeUndefined();
    expect(extractCompletedOrder(record('MODIFY', baseOrder as unknown as Record<string, unknown>, {
      ...completed,
      invoiceEmailSentAt: '2026-07-27T15:00:00.000Z',
    }))).toBeUndefined();
  });
});

describe('invoice email helpers', () => {
  const completedOrder = { ...baseOrder, status: 'COMPLETED' };

  it('builds random UUID invoice key under invoices/ prefix', () => {
    expect(buildInvoiceS3Key(completedOrder)).toMatch(/^invoices\/[a-f0-9-]+\.pdf$/);
  });

  it('creates a PDF buffer with invoice content', () => {
    const pdf = buildInvoicePdf(completedOrder, new Date('2026-07-27T15:00:00.000Z'));

    expect(pdf.subarray(0, 8).toString('utf8')).toBe('%PDF-1.4');
    expect(pdf.toString('utf8')).toContain('Order ID: ABC123');
    expect(pdf.toString('utf8')).toContain('Total Amount:');
  });

  it('uses delivered language in the customer email', () => {
    const content = buildEmailContent(completedOrder);

    expect(content.subject).toBe('Your Cravnest order ABC123 has been delivered');
    expect(content.html).toContain('Your order has been delivered');
    expect(content.text).toContain('has been delivered');
    expect(content.html).not.toContain('completed');
  });

  it('builds a raw MIME email with a PDF attachment', () => {
    const content = buildEmailContent(completedOrder);
    const raw = Buffer.from(buildRawEmail(
      'noreply@cravnest.in',
      'asha@example.com',
      content,
      Buffer.from('%PDF-1.4\n'),
      'invoice.pdf',
    )).toString('utf8');

    expect(raw).toContain('From: noreply@cravnest.in');
    expect(raw).toContain('To: asha@example.com');
    expect(raw).toContain('Content-Type: application/pdf; name="invoice.pdf"');
    expect(raw).toContain('Content-Disposition: attachment; filename="invoice.pdf"');
  });
});
