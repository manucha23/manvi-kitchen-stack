import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SQSEvent } from 'aws-lambda';

export interface WhatsAppTemplateConfig {
  eventKey: string;
  templateName: string;
  language?: string;
  params: string[];
  enabled: boolean;
}

export interface OrderEventMessage {
  eventName: 'INSERT' | 'MODIFY';
  status: string;
  oldStatus?: string;
  orderId: string;
  customerName?: string;
  customerPhone?: string;
  dynamodb?: {
    NewImage?: Record<string, any>;
    OldImage?: Record<string, any>;
  };
}

const ssmClient = new SSMClient({});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const parameterCache = new Map<string, string>();

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

const templateCache = new Map<string, CacheEntry<WhatsAppTemplateConfig | null>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const getEnvironment = (): string => process.env.ENVIRONMENT || 'test';

const getAccessTokenParameterName = (): string =>
  process.env.WHATSAPP_ACCESS_TOKEN_PARAM || `/manvi-kitchen/${getEnvironment()}/whatsapp/access-token`;

const getPhoneNumberIdParameterName = (): string =>
  process.env.WHATSAPP_PHONE_NUMBER_ID_PARAM || `/manvi-kitchen/${getEnvironment()}/whatsapp/phone-number-id`;

const getGraphApiVersion = (): string => process.env.WHATSAPP_GRAPH_API_VERSION || 'v25.0';

const getDefaultLanguage = (): string => process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US';

const getRequiredParameter = async (parameterName: string): Promise<string> => {
  const cached = parameterCache.get(parameterName);
  if (cached) {
    return cached;
  }

  const response = await ssmClient.send(
    new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true,
    })
  );

  const value = response.Parameter?.Value;
  if (!value) {
    throw new Error(`SSM parameter not found or empty: ${parameterName}`);
  }

  parameterCache.set(parameterName, value);
  return value;
};

export const normalizeFirstName = (name?: string): string => {
  if (!name) return 'Customer';
  const trimmed = name.trim();
  if (!trimmed) return 'Customer';
  const firstName = trimmed.split(/\s+/)[0];
  return firstName || 'Customer';
};

export const normalizePhoneNumber = (phone?: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
};

export const getFallbackTemplateConfig = (eventKey: string): WhatsAppTemplateConfig | null => {
  switch (eventKey) {
    case 'STATUS_CREATED':
    case 'STATUS_CONFIRMED':
      return {
        eventKey,
        templateName: 'order_confirmed_v1',
        language: getDefaultLanguage(),
        params: ['customerName', 'orderId'],
        enabled: true,
      };
    case 'STATUS_DISPATCHED':
      return {
        eventKey,
        templateName: 'out_for_delivery_v1',
        language: getDefaultLanguage(),
        params: ['customerName', 'orderId'],
        enabled: true,
      };
    case 'STATUS_COMPLETED':
      return {
        eventKey,
        templateName: 'order_delivered_v1',
        language: getDefaultLanguage(),
        params: ['customerName', 'orderId'],
        enabled: true,
      };
    default:
      return null;
  }
};

export const getTemplateConfig = async (eventKey: string): Promise<WhatsAppTemplateConfig | null> => {
  const now = Date.now();
  const cached = templateCache.get(eventKey);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const tableName = process.env.WHATSAPP_TEMPLATE_TABLE;
  if (!tableName) {
    const fallback = getFallbackTemplateConfig(eventKey);
    templateCache.set(eventKey, { data: fallback, cachedAt: now });
    return fallback;
  }

  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { eventKey },
      })
    );

    if (result.Item) {
      const config: WhatsAppTemplateConfig = {
        eventKey: String(result.Item.eventKey),
        templateName: String(result.Item.templateName),
        language: result.Item.language ? String(result.Item.language) : getDefaultLanguage(),
        params: Array.isArray(result.Item.params) ? result.Item.params.map(String) : ['customerName', 'orderId'],
        enabled: result.Item.enabled !== false,
      };
      templateCache.set(eventKey, { data: config, cachedAt: now });
      return config;
    }
  } catch (error) {
    console.warn(`Failed to query WhatsApp template table for key ${eventKey}, falling back to defaults:`, error);
  }

  const fallback = getFallbackTemplateConfig(eventKey);
  templateCache.set(eventKey, { data: fallback, cachedAt: now });
  return fallback;
};

export const buildTemplatePayload = (
  to: string,
  templateName: string,
  language: string,
  paramValues: string[]
): Record<string, unknown> => ({
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
});

const sendWhatsAppPayload = async (to: string, payload: Record<string, unknown>): Promise<void> => {
  const [accessToken, phoneNumberId] = await Promise.all([
    getRequiredParameter(getAccessTokenParameterName()),
    getRequiredParameter(getPhoneNumberIdParameterName()),
  ]);

  const url = `https://graph.facebook.com/${getGraphApiVersion()}/${phoneNumberId}/messages`;
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
};

export const extractParamValue = (paramKey: string, orderEvent: OrderEventMessage): string => {
  switch (paramKey) {
    case 'customerName':
    case 'Name':
    case 'name':
      return normalizeFirstName(
        orderEvent.customerName ||
        orderEvent.dynamodb?.NewImage?.customerName?.S
      );
    case 'orderId':
    case 'OrderId':
    case 'id':
      return orderEvent.orderId || orderEvent.dynamodb?.NewImage?.orderId?.S || '';
    default:
      return String(
        (orderEvent.dynamodb?.NewImage && orderEvent.dynamodb.NewImage[paramKey]?.S) || ''
      );
  }
};

export const processOrderNotification = async (orderEvent: OrderEventMessage): Promise<boolean> => {
  const { eventName, status, oldStatus, customerPhone, orderId } = orderEvent;

  // Guard: For MODIFY events, only send if status actually changed
  if (eventName === 'MODIFY' && oldStatus && oldStatus === status) {
    console.log(`Skipping notification for order ${orderId}: status unchanged (${status})`);
    return false;
  }

  const eventKey = `STATUS_${status.toUpperCase()}`;
  const templateConfig = await getTemplateConfig(eventKey);

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
  const payload = buildTemplatePayload(
    toPhone,
    templateConfig.templateName,
    templateConfig.language || getDefaultLanguage(),
    paramValues
  );

  console.log(`Sending WhatsApp template message '${templateConfig.templateName}' for order ${orderId} (status: ${status}) to ${toPhone}`);
  await sendWhatsAppPayload(toPhone, payload);
  return true;
};

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    try {
      const bodyData = JSON.parse(record.body);
      // Handle potential SNS envelope wrapping
      const messageContent = typeof bodyData.Message === 'string'
        ? JSON.parse(bodyData.Message)
        : bodyData;

      const orderEvent: OrderEventMessage = {
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

      await processOrderNotification(orderEvent);
    } catch (error) {
      console.error('Error processing WhatsApp notification record:', error, record.body);
      throw error; // Throw so SQS will retry according to queue policy
    }
  }
};
