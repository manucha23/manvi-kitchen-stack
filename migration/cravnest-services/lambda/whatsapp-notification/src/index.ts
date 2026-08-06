import { SQSEvent } from 'aws-lambda';
import { NotificationProcessorService } from './services/notification-processor.service';
import { WhatsAppApiClient } from './services/whatsapp-api.client';
import { WhatsAppTemplateService } from './services/whatsapp-template.service';

export * from './types';
export { normalizeFirstName, normalizePhoneNumber, extractParamValue } from './utils/formatters';

const templateService = new WhatsAppTemplateService();
const apiClient = new WhatsAppApiClient();
const processorService = new NotificationProcessorService(templateService, apiClient);

export const getFallbackTemplateConfig = (eventKey: string) =>
  templateService.getFallbackTemplateConfig(eventKey);

export const getTemplateConfig = (eventKey: string) =>
  templateService.getTemplateConfig(eventKey);

export const buildTemplatePayload = (
  to: string,
  templateName: string,
  language: string,
  paramValues: string[]
) => apiClient.buildTemplatePayload(to, templateName, language, paramValues);

export const processOrderNotification = (orderEvent: any) =>
  processorService.processOrderNotification(orderEvent);

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    try {
      const bodyData = JSON.parse(record.body);
      const messageContent = typeof bodyData.Message === 'string'
        ? JSON.parse(bodyData.Message)
        : bodyData;

      const orderEvent = {
        eventName: messageContent.eventName || 'MODIFY',
        status: messageContent.status || messageContent.dynamodb?.NewImage?.status?.S,
        oldStatus: messageContent.oldStatus || messageContent.dynamodb?.OldImage?.status?.S,
        orderId: messageContent.orderId || messageContent.dynamodb?.NewImage?.orderId?.S,
        customerName: messageContent.customerName || messageContent.dynamodb?.NewImage?.customerName?.S,
        customerPhone: messageContent.customerPhone || messageContent.dynamodb?.NewImage?.customerPhone?.S,
        dynamodb: messageContent.dynamodb,
      };

      if (!orderEvent.status || !orderEvent.orderId) {
        console.warn('Skipping invalid SQS record payload:', record.body);
        continue;
      }

      await processorService.processOrderNotification(orderEvent as any);
    } catch (error) {
      console.error('Error processing WhatsApp notification record:', error, record.body);
      throw error;
    }
  }
};
