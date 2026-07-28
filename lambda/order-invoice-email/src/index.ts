import { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { AttributeValue, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const COMPLETED_STATUS = 'COMPLETED';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const sesClient = new SESv2Client({});
const ssmClient = new SSMClient({});

export interface OrderItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  amount: number;
}

export interface Order {
  orderId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  status: string;
  paymentMethod?: string;
  paymentStatus?: string;
  promisedDeliveryAt?: string;
  items: OrderItem[];
  totalAmount: number;
  instructions?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  invoiceEmailProcessingAt?: string;
  invoiceEmailSentAt?: string;
  invoiceWhatsAppSentAt?: string;
  invoiceS3Key?: string;
}

interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const unmarshallImage = (image?: Record<string, AttributeValue>): Record<string, unknown> | undefined =>
  image ? unmarshall(image) : undefined;

const asOrder = (image?: Record<string, unknown>): Order | undefined => {
  if (!image || typeof image.orderId !== 'string' || typeof image.status !== 'string') {
    return undefined;
  }

  return image as unknown as Order;
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const escapePdfText = (value: unknown): string =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ');

const formatCurrency = (value: unknown): string => {
  const numericValue = typeof value === 'number' ? value : Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(numericValue);
};

const formatDateTime = (value?: string): string => {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date);
};

const sanitizeHeader = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();

const wrapBase64 = (value: string): string => value.match(/.{1,76}/g)?.join('\r\n') || value;

const wrapText = (value: string, maxLength: number): string[] => {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines.length ? lines : [''];
};

export const extractCompletedOrder = (record: DynamoDBRecord): Order | undefined => {
  if (record.eventName !== 'MODIFY') {
    return undefined;
  }

  const oldImage = asOrder(unmarshallImage(record.dynamodb?.OldImage as Record<string, AttributeValue> | undefined));
  const newImage = asOrder(unmarshallImage(record.dynamodb?.NewImage as Record<string, AttributeValue> | undefined));

  if (!newImage || newImage.status !== COMPLETED_STATUS || oldImage?.status === COMPLETED_STATUS) {
    return undefined;
  }

  if (newImage.invoiceEmailProcessingAt || newImage.invoiceEmailSentAt || newImage.invoiceWhatsAppSentAt || newImage.invoiceS3Key) {
    return undefined;
  }

  return newImage;
};

export const buildInvoiceS3Key = (order: Order): string =>
  `orders/${order.orderId}/invoice-v${order.version || 1}.pdf`;

export const buildInvoicePdf = (order: Order, generatedAt = new Date()): Buffer => {
  const lines: string[] = [
    'Cravnest by Manvi Kitchen',
    'Tax Invoice',
    `Invoice Date: ${formatDateTime(generatedAt.toISOString())}`,
    `Order ID: ${order.orderId}`,
    `Customer: ${order.customerName}`,
    `Phone: ${order.customerPhone}`,
    `Delivered At: ${formatDateTime(order.updatedAt)}`,
    `Promised Delivery: ${formatDateTime(order.promisedDeliveryAt)}`,
    `Payment Method: ${order.paymentMethod || 'Not available'}`,
    `Payment Status: ${order.paymentStatus || 'Not available'}`,
    '',
    'Delivery Address:',
    ...wrapText(order.deliveryAddress, 76),
    '',
    'Items:',
    ...order.items.flatMap((item) => wrapText(
      `${item.quantity} x ${item.name} @ ${formatCurrency(item.price)} = ${formatCurrency(item.amount)}`,
      88,
    )),
    '',
    `Total Amount: ${formatCurrency(order.totalAmount)}`,
    '',
    'Thank you for ordering from Cravnest. We hope your meal was delivered warm, fresh, and right on time.',
    'For support, reply to support@cravnest.in.',
  ];

  const content = [
    'BT',
    '/F1 20 Tf',
    '50 790 Td',
    `(${escapePdfText(lines[0])}) Tj`,
    '/F1 12 Tf',
    '0 -28 Td',
    ...lines.slice(1).flatMap((line) => [
      `(${escapePdfText(line)}) Tj`,
      '0 -18 Td',
    ]),
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
  ];

  let body = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  body += offsets.slice(1).map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body, 'utf8');
};

export const buildEmailContent = (order: Order): EmailContent => {
  const subject = `Your Cravnest order ${order.orderId} has been delivered`;
  const itemRows = order.items.map((item) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e7e2dc;">${escapeHtml(item.name)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e7e2dc;text-align:center;">${item.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e7e2dc;text-align:right;">${escapeHtml(formatCurrency(item.amount))}</td>
    </tr>
  `).join('');

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f7f3ee;font-family:Arial,Helvetica,sans-serif;color:#2f2924;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f3ee;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #eadfd4;">
            <tr>
              <td style="padding:28px 32px;background:#2f2924;color:#ffffff;">
                <div style="font-size:22px;font-weight:700;">Cravnest</div>
                <div style="font-size:13px;color:#e8d8c7;margin-top:4px;">by Manvi Kitchen</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#2f2924;">Your order has been delivered</h1>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Hi ${escapeHtml(order.customerName)}, thank you for ordering from Cravnest. Your invoice is attached as a PDF for your records.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border-collapse:collapse;">
                  <tr>
                    <td style="padding:8px 0;color:#76685d;">Order ID</td>
                    <td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(order.orderId)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#76685d;">Delivered</td>
                    <td style="padding:8px 0;text-align:right;">${escapeHtml(formatDateTime(order.updatedAt))}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#76685d;">Total</td>
                    <td style="padding:8px 0;text-align:right;font-weight:700;">${escapeHtml(formatCurrency(order.totalAmount))}</td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:18px;">
                  <thead>
                    <tr>
                      <th align="left" style="padding:10px 0;border-bottom:2px solid #d8c3b0;color:#5f5147;">Item</th>
                      <th align="center" style="padding:10px 0;border-bottom:2px solid #d8c3b0;color:#5f5147;">Qty</th>
                      <th align="right" style="padding:10px 0;border-bottom:2px solid #d8c3b0;color:#5f5147;">Amount</th>
                    </tr>
                  </thead>
                  <tbody>${itemRows}</tbody>
                </table>
                <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#5f5147;">If anything needs attention, contact us at <a href="mailto:support@cravnest.in" style="color:#8a4d2f;">support@cravnest.in</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hi ${order.customerName},`,
    '',
    `Your Cravnest order ${order.orderId} has been delivered.`,
    `Total: ${formatCurrency(order.totalAmount)}`,
    `Delivered: ${formatDateTime(order.updatedAt)}`,
    '',
    'Your invoice is attached as a PDF.',
    '',
    'For support, contact support@cravnest.in.',
  ].join('\n');

  return { subject, html, text };
};

export const buildRawEmail = (
  fromEmail: string,
  toEmail: string,
  content: EmailContent,
  attachment: Buffer,
  attachmentName: string,
): Uint8Array => {
  const mixedBoundary = `mixed-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const altBoundary = `alt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const encodedSubject = `=?UTF-8?B?${Buffer.from(sanitizeHeader(content.subject), 'utf8').toString('base64')}?=`;

  const message = [
    `From: ${sanitizeHeader(fromEmail)}`,
    `To: ${sanitizeHeader(toEmail)}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(content.text, 'utf8').toString('base64')),
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(content.html, 'utf8').toString('base64')),
    `--${altBoundary}--`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: application/pdf; name="${sanitizeHeader(attachmentName)}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${sanitizeHeader(attachmentName)}"`,
    '',
    wrapBase64(attachment.toString('base64')),
    `--${mixedBoundary}--`,
    '',
  ].join('\r\n');

  return Buffer.from(message, 'utf8');
};

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const getSsmParameter = async (paramName: string): Promise<string> => {
  const response = await ssmClient.send(new GetParameterCommand({
    Name: paramName,
    WithDecryption: true,
  }));
  if (!response.Parameter?.Value) {
    throw new Error(`SSM Parameter empty: ${paramName}`);
  }
  return response.Parameter.Value;
};

const sendWhatsAppInvoiceFallback = async (
  order: Order,
  customDomainInvoiceUrl: string,
): Promise<string> => {
  const env = process.env.ENVIRONMENT || 'test';
  const [accessToken, phoneNumberId] = await Promise.all([
    getSsmParameter(`/manvi-kitchen/${env}/whatsapp/access-token`),
    getSsmParameter(`/manvi-kitchen/${env}/whatsapp/phone-number-id`),
  ]);

  const bodyText = `Hi ${order.customerName},\n\nThank you for ordering from Cravnest! Your order ${order.orderId} has been successfully delivered.\n\nTotal: ${formatCurrency(order.totalAmount)}\n\n📄 Download Tax Invoice (PDF):\n${customDomainInvoiceUrl}\n\nFor support, reply to this chat or email support@cravnest.in.`;

  const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: order.customerPhone,
      type: 'text',
      text: {
        preview_url: true,
        body: bodyText,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp invoice fallback failed (${response.status}): ${await response.text()}`);
  }

  const resData = (await response.json()) as any;
  return resData.messages?.[0]?.id || 'wa-sent';
};

const claimInvoiceProcessing = async (order: Order): Promise<void> => {
  await docClient.send(new UpdateCommand({
    TableName: getRequiredEnv('ORDER_TABLE'),
    Key: { orderId: order.orderId },
    UpdateExpression: 'SET invoiceEmailProcessingAt = :processingAt',
    ConditionExpression: 'attribute_exists(orderId) AND attribute_not_exists(invoiceEmailProcessingAt) AND attribute_not_exists(invoiceEmailSentAt) AND attribute_not_exists(invoiceWhatsAppSentAt)',
    ExpressionAttributeValues: {
      ':processingAt': new Date().toISOString(),
    },
  }));
};

const markInvoiceSent = async (
  order: Order,
  invoiceS3Key: string,
  channel: 'EMAIL' | 'WHATSAPP',
  messageId?: string,
): Promise<void> => {
  const updateExpr = channel === 'EMAIL'
    ? 'SET invoiceEmailSentAt = :sentAt, invoiceS3Key = :invoiceS3Key, invoiceEmailMessageId = :messageId REMOVE invoiceEmailProcessingAt'
    : 'SET invoiceWhatsAppSentAt = :sentAt, invoiceS3Key = :invoiceS3Key, invoiceWhatsAppMessageId = :messageId REMOVE invoiceEmailProcessingAt';

  await docClient.send(new UpdateCommand({
    TableName: getRequiredEnv('ORDER_TABLE'),
    Key: { orderId: order.orderId },
    UpdateExpression: updateExpr,
    ConditionExpression: 'attribute_exists(orderId) AND attribute_exists(invoiceEmailProcessingAt)',
    ExpressionAttributeValues: {
      ':sentAt': new Date().toISOString(),
      ':invoiceS3Key': invoiceS3Key,
      ':messageId': messageId || 'unknown',
    },
  }));
};

const clearInvoiceClaim = async (order: Order): Promise<void> => {
  await docClient.send(new UpdateCommand({
    TableName: getRequiredEnv('ORDER_TABLE'),
    Key: { orderId: order.orderId },
    UpdateExpression: 'REMOVE invoiceEmailProcessingAt',
    ConditionExpression: 'attribute_exists(orderId) AND attribute_exists(invoiceEmailProcessingAt)',
  }));
};

export const processCompletedOrder = async (order: Order): Promise<void> => {
  const invoiceBucket = getRequiredEnv('INVOICE_BUCKET');
  const invoiceDomain = process.env.INVOICE_DOMAIN || 'invoices.test.cravnest.in';
  const fromEmail = getRequiredEnv('FROM_EMAIL');
  const invoiceS3Key = buildInvoiceS3Key(order);
  const invoicePdf = buildInvoicePdf(order);
  const attachmentName = `cravnest-invoice-${order.orderId}.pdf`;
  const customDomainInvoiceUrl = `https://${invoiceDomain}/${invoiceS3Key}`;

  await claimInvoiceProcessing(order);

  let success = false;

  try {
    // 1. Save PDF Invoice to private S3 bucket
    await s3Client.send(new PutObjectCommand({
      Bucket: invoiceBucket,
      Key: invoiceS3Key,
      Body: invoicePdf,
      ContentType: 'application/pdf',
      Metadata: {
        orderId: order.orderId,
      },
    }));

    // 2. Deliver via Email (SES) if email is present, else deliver via WhatsApp Fallback
    if (order.customerEmail) {
      const emailContent = buildEmailContent(order);
      const sendResult = await sesClient.send(new SendEmailCommand({
        FromEmailAddress: fromEmail,
        Destination: {
          ToAddresses: [order.customerEmail],
        },
        Content: {
          Raw: {
            Data: buildRawEmail(fromEmail, order.customerEmail, emailContent, invoicePdf, attachmentName),
          },
        },
      }));

      success = true;
      await markInvoiceSent(order, invoiceS3Key, 'EMAIL', sendResult.MessageId);
    } else {
      console.log(`Order ${order.orderId} completed without email; delivering invoice via WhatsApp fallback to ${order.customerPhone}`);
      const messageId = await sendWhatsAppInvoiceFallback(order, customDomainInvoiceUrl);
      success = true;
      await markInvoiceSent(order, invoiceS3Key, 'WHATSAPP', messageId);
    }
  } catch (error) {
    if (!success) {
      await clearInvoiceClaim(order).catch((clearError) => {
        console.warn(`Failed to clear invoice claim for order ${order.orderId}:`, clearError);
      });
    }
    throw error;
  }
};

export const handler = async (event: DynamoDBStreamEvent): Promise<{ statusCode: number; body: string }> => {
  for (const record of event.Records) {
    const order = extractCompletedOrder(record);
    if (!order) {
      continue;
    }

    try {
      await processCompletedOrder(order);
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        console.log(`Invoice already marked for order ${order.orderId}`);
        continue;
      }

      console.error(`Failed to process invoice delivery for order ${order.orderId}:`, error);
      throw error;
    }
  }

  return { statusCode: 200, body: 'Processed' };
};
