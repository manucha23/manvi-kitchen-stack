import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { SQSEvent } from 'aws-lambda';

interface WhatsAppInboundTextMessage {
  messageId: string;
  from: string;
  firstName: string;
  text: string;
  receivedAt: string;
}

const ssmClient = new SSMClient({});
const parameterCache = new Map<string, string>();

const getRequiredParameter = async (parameterName: string): Promise<string> => {
  const cached = parameterCache.get(parameterName);
  if (cached) {
    return cached;
  }

  const response = await ssmClient.send(new GetParameterCommand({
    Name: parameterName,
    WithDecryption: true,
  }));

  const value = response.Parameter?.Value;
  if (!value) {
    throw new Error(`SSM parameter not found or empty: ${parameterName}`);
  }

  parameterCache.set(parameterName, value);
  return value;
};

const getEnvironment = (): string => process.env.ENVIRONMENT || 'test';

const getAccessTokenParameterName = (): string =>
  process.env.WHATSAPP_ACCESS_TOKEN_PARAM || `/manvi-kitchen/${getEnvironment()}/whatsapp/access-token`;

const getPhoneNumberIdParameterName = (): string =>
  process.env.WHATSAPP_PHONE_NUMBER_ID_PARAM || `/manvi-kitchen/${getEnvironment()}/whatsapp/phone-number-id`;

const getGraphApiVersion = (): string => process.env.WHATSAPP_GRAPH_API_VERSION || 'v25.0';

export const buildWelcomeMessage = (firstName: string): string =>
  `Hi ${firstName || 'there'}, welcome to Manvi's Kitchen! How can we help you today?`;

const sendWhatsAppTextMessage = async (message: WhatsAppInboundTextMessage): Promise<void> => {
  const [accessToken, phoneNumberId] = await Promise.all([
    getRequiredParameter(getAccessTokenParameterName()),
    getRequiredParameter(getPhoneNumberIdParameterName()),
  ]);

  const response = await fetch(`https://graph.facebook.com/${getGraphApiVersion()}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.from,
      type: 'text',
      text: {
        preview_url: false,
        body: buildWelcomeMessage(message.firstName),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp API request failed with ${response.status}: ${await response.text()}`);
  }

  console.log('Sent WhatsApp welcome message', JSON.stringify({
    inboundMessageId: message.messageId,
    to: message.from,
    status: response.status,
  }));
};

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const message = JSON.parse(record.body) as WhatsAppInboundTextMessage;
    await sendWhatsAppTextMessage(message);
  }
};
