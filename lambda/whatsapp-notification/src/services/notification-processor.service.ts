import { OrderEventMessage } from '../types';
import { extractParamValue, normalizePhoneNumber } from '../utils/formatters';
import { WhatsAppApiClient } from './whatsapp-api.client';
import { WhatsAppTemplateService } from './whatsapp-template.service';

export class NotificationProcessorService {
  private templateService: WhatsAppTemplateService;
  private apiClient: WhatsAppApiClient;

  constructor(
    templateService?: WhatsAppTemplateService,
    apiClient?: WhatsAppApiClient
  ) {
    this.templateService = templateService || new WhatsAppTemplateService();
    this.apiClient = apiClient || new WhatsAppApiClient();
  }

  public async processOrderNotification(orderEvent: OrderEventMessage): Promise<boolean> {
    const { eventName, status, oldStatus, customerPhone, orderId } = orderEvent;

    // Guard: For MODIFY events, only send if status actually changed
    if (eventName === 'MODIFY' && oldStatus && oldStatus === status) {
      console.log(`Skipping notification for order ${orderId}: status unchanged (${status})`);
      return false;
    }

    const eventKey = `STATUS_${status.toUpperCase()}`;
    const templateConfig = await this.templateService.getTemplateConfig(eventKey);

    if (!templateConfig || !templateConfig.enabled) {
      console.log(`No active WhatsApp template configured for event ${eventKey}`);
      return false;
    }

    const rawPhone = customerPhone || orderEvent.dynamodb?.NewImage?.customerPhone?.S;
    const toPhone = normalizePhoneNumber(rawPhone);

    if (!toPhone) {
      console.warn(`Cannot send WhatsApp notification for order ${orderId}: missing or invalid phone number (${rawPhone})`);
      return false;
    }

    const paramValues = templateConfig.params.map((paramKey) => extractParamValue(paramKey, orderEvent));
    const payload = this.apiClient.buildTemplatePayload(
      toPhone,
      templateConfig.templateName,
      templateConfig.language || this.templateService.getDefaultLanguage(),
      paramValues
    );

    console.log(`Sending WhatsApp template message '${templateConfig.templateName}' for order ${orderId} (status: ${status}) to ${toPhone}`);
    await this.apiClient.sendPayload(toPhone, payload);
    return true;
  }
}
