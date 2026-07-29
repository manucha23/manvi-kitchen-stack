import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { Order } from '../types';

export class WhatsAppInvoiceService {
  private ssmClient: SSMClient;
  private ssmCache: Map<string, string>;

  constructor(ssmClient?: SSMClient) {
    this.ssmClient = ssmClient || new SSMClient({});
    this.ssmCache = new Map<string, string>();
  }

  private async getSsmParameter(parameterName: string): Promise<string> {
    const cached = this.ssmCache.get(parameterName);
    if (cached) {
      return cached;
    }

    const response = await this.ssmClient.send(
      new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true,
      })
    );

    const value = response.Parameter?.Value;
    if (!value) {
      throw new Error(`SSM parameter not found or empty: ${parameterName}`);
    }

    this.ssmCache.set(parameterName, value);
    return value;
  }

  private normalizePhoneNumber(phone?: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `91${digits}`;
    }
    return digits;
  }

  public async sendInvoiceWhatsAppDocument(order: Order, pdfBuffer: Buffer): Promise<boolean> {
    const toPhone = this.normalizePhoneNumber(order.customerPhone);
    if (!toPhone) {
      console.warn(`Skipping WhatsApp invoice delivery for order ${order.orderId}: missing customer phone number`);
      return false;
    }

    const env = process.env.ENVIRONMENT || 'test';
    const [accessToken, phoneNumberId] = await Promise.all([
      this.getSsmParameter(`/manvi-kitchen/${env}/whatsapp/access-token`),
      this.getSsmParameter(`/manvi-kitchen/${env}/whatsapp/phone-number-id`),
    ]);

    const graphApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || 'v25.0';
    const filename = `cravnest-invoice-${order.orderId}.pdf`;

    // 1. Upload PDF to Meta Media API
    const formData = new FormData();
    const pdfBlob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
    formData.append('file', pdfBlob, filename);
    formData.append('type', 'application/pdf');
    formData.append('messaging_product', 'whatsapp');

    const uploadResponse = await fetch(`https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`Failed to upload invoice PDF to WhatsApp Media API (${uploadResponse.status}): ${errText}`);
    }

    const uploadResult = (await uploadResponse.json()) as { id?: string };
    const mediaId = uploadResult.id;
    if (!mediaId) {
      throw new Error(`WhatsApp Media API response missing media ID for order ${order.orderId}`);
    }

    // 2. Send Document Message with media ID
    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhone,
      type: 'document',
      document: {
        id: mediaId,
        filename,
        caption: `Hi ${order.customerName.trim().split(/\s+/)[0] || 'Customer'}, thank you for ordering from Cravnest! Here is your tax invoice for order ${order.orderId}.`,
      },
    };

    const messageResponse = await fetch(`https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    });

    if (!messageResponse.ok) {
      const errText = await messageResponse.text();
      throw new Error(`Failed to send WhatsApp invoice document message (${messageResponse.status}): ${errText}`);
    }

    console.log(`Successfully sent WhatsApp PDF invoice document to ${toPhone} for order ${order.orderId}`);
    return true;
  }
}
