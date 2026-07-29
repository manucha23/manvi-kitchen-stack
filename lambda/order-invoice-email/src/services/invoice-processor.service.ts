import { AttributeValue, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Order } from '../types';
import { PdfGeneratorService } from './pdf-generator.service';
import { S3StorageService } from './s3-storage.service';
import { SesEmailService } from './ses-email.service';
import { WhatsAppInvoiceService } from './whatsapp-invoice.service';

const COMPLETED_STATUS = 'COMPLETED';

export class InvoiceProcessorService {
  private docClient: DynamoDBDocumentClient;
  private pdfGeneratorService: PdfGeneratorService;
  private s3StorageService: S3StorageService;
  private sesEmailService: SesEmailService;
  private whatsAppInvoiceService: WhatsAppInvoiceService;

  constructor(
    docClient?: DynamoDBDocumentClient,
    pdfGeneratorService?: PdfGeneratorService,
    s3StorageService?: S3StorageService,
    sesEmailService?: SesEmailService,
    whatsAppInvoiceService?: WhatsAppInvoiceService
  ) {
    const dynamoClient = new DynamoDBClient({});
    this.docClient = docClient || DynamoDBDocumentClient.from(dynamoClient);
    this.pdfGeneratorService = pdfGeneratorService || new PdfGeneratorService();
    this.s3StorageService = s3StorageService || new S3StorageService();
    this.sesEmailService = sesEmailService || new SesEmailService();
    this.whatsAppInvoiceService = whatsAppInvoiceService || new WhatsAppInvoiceService();
  }

  private unmarshallImage(image?: Record<string, AttributeValue>): Record<string, unknown> | undefined {
    return image ? unmarshall(image) : undefined;
  }

  private asOrder(image?: Record<string, unknown>): Order | undefined {
    if (!image || typeof image.orderId !== 'string' || typeof image.status !== 'string') {
      return undefined;
    }
    return image as unknown as Order;
  }

  public extractCompletedOrder(record: any): Order | undefined {
    let oldImage: Order | undefined;
    let newImage: Order | undefined;

    if (record.body) {
      try {
        const bodyData = typeof record.body === 'string' ? JSON.parse(record.body) : record.body;
        const messageContent = typeof bodyData.Message === 'string' ? JSON.parse(bodyData.Message) : bodyData;
        if (messageContent.dynamodb?.NewImage) {
          newImage = this.asOrder(this.unmarshallImage(messageContent.dynamodb.NewImage));
          oldImage = this.asOrder(this.unmarshallImage(messageContent.dynamodb.OldImage));
        }
      } catch (err) {
        console.warn('Failed to parse SQS record body in OrderInvoiceEmailLambda:', err);
        return undefined;
      }
    } else if (record.eventName === 'MODIFY') {
      oldImage = this.asOrder(this.unmarshallImage(record.dynamodb?.OldImage as Record<string, AttributeValue> | undefined));
      newImage = this.asOrder(this.unmarshallImage(record.dynamodb?.NewImage as Record<string, AttributeValue> | undefined));
    }

    if (!newImage || newImage.status !== COMPLETED_STATUS || oldImage?.status === COMPLETED_STATUS) {
      return undefined;
    }

    if (newImage.invoiceEmailProcessingAt || newImage.invoiceEmailSentAt || newImage.invoiceWhatsAppSentAt || newImage.invoiceS3Key) {
      return undefined;
    }

    return newImage;
  }

  public async acquireLock(tableName: string, orderId: string, timestamp: string): Promise<boolean> {
    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { orderId },
          UpdateExpression: 'SET invoiceEmailProcessingAt = :now, updatedAt = :now',
          ConditionExpression:
            'attribute_not_exists(invoiceEmailProcessingAt) AND attribute_not_exists(invoiceEmailSentAt)',
          ExpressionAttributeValues: {
            ':now': timestamp,
          },
        }),
      );
      return true;
    } catch (error: any) {
      if (error?.name === 'ConditionalCheckFailedException') {
        console.log(`Lock acquisition skipped for order ${orderId}: already processing or completed.`);
        return false;
      }
      throw error;
    }
  }

  public async markSent(
    tableName: string,
    orderId: string,
    timestamp: string,
    s3Key: string,
    emailSent: boolean,
    whatsAppSent: boolean
  ): Promise<void> {
    const updateExpressions = [
      'invoiceEmailSentAt = :now',
      'invoiceS3Key = :s3Key',
      'updatedAt = :now',
    ];

    if (whatsAppSent) {
      updateExpressions.push('invoiceWhatsAppSentAt = :now');
    }

    await this.docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { orderId },
        UpdateExpression: `SET ${updateExpressions.join(', ')} REMOVE invoiceEmailProcessingAt`,
        ExpressionAttributeValues: {
          ':now': timestamp,
          ':s3Key': s3Key,
        },
      }),
    );
  }

  public async processCompletedOrder(order: Order, tableName: string, bucketName: string, senderEmail: string): Promise<void> {
    const processingTimestamp = new Date().toISOString();
    const acquired = await this.acquireLock(tableName, order.orderId, processingTimestamp);
    if (!acquired) {
      return;
    }

    const pdfS3Key = this.pdfGeneratorService.buildInvoiceS3Key(order);
    const pdfBuffer = this.pdfGeneratorService.buildInvoicePdf(order);
    const pdfFilename = `cravnest-invoice-${order.orderId}.pdf`;

    await this.s3StorageService.uploadInvoicePdf(bucketName, pdfS3Key, pdfBuffer);

    let emailSent = false;
    if (order.customerEmail) {
      try {
        await this.sesEmailService.sendInvoiceEmail(senderEmail, order.customerEmail, order, pdfBuffer, pdfFilename);
        emailSent = true;
        console.log(`Sent invoice email for order ${order.orderId} to ${order.customerEmail}`);
      } catch (error) {
        console.error(`Failed to send invoice email for order ${order.orderId} to ${order.customerEmail}:`, error);
      }
    } else {
      console.log(`Skipping invoice email for order ${order.orderId}: no customer email provided`);
    }

    let whatsAppSent = false;
    try {
      whatsAppSent = await this.whatsAppInvoiceService.sendInvoiceWhatsAppDocument(order, pdfBuffer);
    } catch (error) {
      console.error(`Failed to send WhatsApp inline invoice PDF document for order ${order.orderId}:`, error);
    }

    await this.markSent(tableName, order.orderId, new Date().toISOString(), pdfS3Key, emailSent, whatsAppSent);
  }
}
