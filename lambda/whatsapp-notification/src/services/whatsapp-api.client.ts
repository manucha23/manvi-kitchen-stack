import { SsmParameterService } from './ssm-parameter.service';

export class WhatsAppApiClient {
  private ssmParameterService: SsmParameterService;

  constructor(ssmParameterService?: SsmParameterService) {
    this.ssmParameterService = ssmParameterService || new SsmParameterService();
  }

  private getEnvironment(): string {
    return process.env.ENVIRONMENT || 'test';
  }

  private getAccessTokenParameterName(): string {
    return process.env.WHATSAPP_ACCESS_TOKEN_PARAM || `/manvi-kitchen/${this.getEnvironment()}/whatsapp/access-token`;
  }

  private getPhoneNumberIdParameterName(): string {
    return process.env.WHATSAPP_PHONE_NUMBER_ID_PARAM || `/manvi-kitchen/${this.getEnvironment()}/whatsapp/phone-number-id`;
  }

  private getGraphApiVersion(): string {
    return process.env.WHATSAPP_GRAPH_API_VERSION || 'v25.0';
  }

  public buildTemplatePayload(
    to: string,
    templateName: string,
    language: string,
    paramValues: string[]
  ): Record<string, unknown> {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: language,
        },
        components: [
          {
            type: 'body',
            parameters: paramValues.map((value) => ({
              type: 'text',
              text: value,
            })),
          },
        ],
      },
    };
  }

  public async sendPayload(to: string, payload: Record<string, unknown>): Promise<void> {
    const [accessToken, phoneNumberId] = await Promise.all([
      this.ssmParameterService.getParameter(this.getAccessTokenParameterName()),
      this.ssmParameterService.getParameter(this.getPhoneNumberIdParameterName()),
    ]);

    const url = `https://graph.facebook.com/${this.getGraphApiVersion()}/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WhatsApp API request failed (${response.status}): ${errorText}`);
    }
  }
}
