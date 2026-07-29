import { Order } from './types';
import { InvoiceProcessorService } from './services/invoice-processor.service';
import { PdfGeneratorService } from './services/pdf-generator.service';
import { S3StorageService } from './services/s3-storage.service';
import { SesEmailService } from './services/ses-email.service';
import { WhatsAppInvoiceService } from './services/whatsapp-invoice.service';

export * from './types';
export { escapeHtml, escapePdfText, formatCurrency, formatDateTime } from './utils/formatting';

const pdfGeneratorService = new PdfGeneratorService();
const s3StorageService = new S3StorageService();
const sesEmailService = new SesEmailService();
const whatsAppInvoiceService = new WhatsAppInvoiceService();
const processorService = new InvoiceProcessorService(
  undefined,
  pdfGeneratorService,
  s3StorageService,
  sesEmailService,
  whatsAppInvoiceService
);

export const extractCompletedOrder = (record: any): Order | undefined =>
  processorService.extractCompletedOrder(record);

export const buildInvoiceS3Key = (order?: Order): string =>
  pdfGeneratorService.buildInvoiceS3Key(order);

export const buildInvoicePdf = (order: Order, generatedAt?: Date): Buffer =>
  pdfGeneratorService.buildInvoicePdf(order, generatedAt);

export const buildEmailContent = (order: Order) =>
  sesEmailService.buildEmailContent(order);

export const buildRawEmail = (
  senderEmail: string,
  recipientEmail: string,
  emailContent: { subject: string; html: string; text: string },
  pdfBuffer: Buffer,
  pdfFilename: string
): string => {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  const headers = [
    `From: ${senderEmail}`,
    `To: ${recipientEmail}`,
    `Subject: ${emailContent.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  const bodyParts = [
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    emailContent.text,
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    emailContent.html,
    '',
    `--${altBoundary}--`,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${pdfFilename}"`,
    `Content-Disposition: attachment; filename="${pdfFilename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    pdfBuffer.toString('base64').match(/.{1,76}/g)?.join('\r\n') || pdfBuffer.toString('base64'),
    '',
    `--${boundary}--`,
  ];

  return `${headers.join('\r\n')}\r\n\r\n${bodyParts.join('\r\n')}`;
};

export const buildRawEmailMessage = (
  senderEmail: string,
  recipientEmail: string,
  order: Order,
  pdfBuffer: Buffer,
  pdfFilename: string
) => sesEmailService.buildRawEmailMessage(senderEmail, recipientEmail, order, pdfBuffer, pdfFilename);

export const sendInvoiceEmail = (
  senderEmail: string,
  recipientEmail: string,
  order: Order,
  pdfBuffer: Buffer,
  pdfFilename: string
) => sesEmailService.sendInvoiceEmail(senderEmail, recipientEmail, order, pdfBuffer, pdfFilename);

export const sendInvoiceWhatsAppDocument = (order: Order, pdfBuffer: Buffer) =>
  whatsAppInvoiceService.sendInvoiceWhatsAppDocument(order, pdfBuffer);

export const acquireLock = (tableName: string, orderId: string, timestamp: string) =>
  processorService.acquireLock(tableName, orderId, timestamp);

export const markSent = (
  tableName: string,
  orderId: string,
  timestamp: string,
  s3Key: string,
  emailSent: boolean,
  whatsAppSent: boolean
) => processorService.markSent(tableName, orderId, timestamp, s3Key, emailSent, whatsAppSent);

export const processCompletedOrder = (
  order: Order,
  tableName: string,
  bucketName: string,
  senderEmail: string
) => processorService.processCompletedOrder(order, tableName, bucketName, senderEmail);

export const handler = async (event: any): Promise<{ statusCode: number; body: string }> => {
  console.log('Processing order completed event for invoice:', JSON.stringify(event, null, 2));

  const tableName = process.env.ORDER_TABLE_NAME;
  const bucketName = process.env.INVOICE_BUCKET_NAME;
  const senderEmail = process.env.INVOICE_SENDER_EMAIL;

  if (!tableName || !bucketName || !senderEmail) {
    throw new Error('Missing required environment variables (ORDER_TABLE_NAME, INVOICE_BUCKET_NAME, INVOICE_SENDER_EMAIL)');
  }

  if (!event || !Array.isArray(event.Records)) {
    console.log('No records found in event payload.');
    return { statusCode: 200, body: 'No records to process' };
  }

  for (const record of event.Records) {
    const order = processorService.extractCompletedOrder(record);
    if (!order) {
      continue;
    }

    try {
      await processorService.processCompletedOrder(order, tableName, bucketName, senderEmail);
    } catch (error) {
      console.error(`Error processing invoice for order ${order.orderId}:`, error);
      throw error;
    }
  }

  return { statusCode: 200, body: 'Processed' };
};
