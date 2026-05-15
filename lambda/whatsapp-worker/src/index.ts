import {
  BedrockRuntimeClient,
  ContentBlock,
  ConverseCommand,
  ConverseCommandInput,
  Message,
  ToolUseBlock,
} from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SQSEvent } from 'aws-lambda';

interface WhatsAppInboundTextMessage {
  messageId: string;
  from: string;
  firstName: string;
  text: string;
  receivedAt: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

interface ConversationSession {
  phoneNumber: string;
  firstName: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
  expiresAt: number;
}

interface MenuItem {
  itemId: string;
  name: string;
  description?: string;
  category?: string;
  price?: number;
  available: boolean;
  lunchLimit?: number | null;
  dinnerLimit?: number | null;
}

interface MenuToolResult {
  kitchenOpen: boolean;
  items: MenuItem[];
}

const SESSION_TTL_SECONDS = 60 * 60;
const MAX_RECENT_MESSAGES = 10;
const DEFAULT_MODEL_ID = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';

const ssmClient = new SSMClient({});
const bedrockClient = new BedrockRuntimeClient({});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const parameterCache = new Map<string, string>();

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

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

const getModelId = (): string => process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL_ID;

const getIstTimestamp = (date = new Date()): string =>
  date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export const buildSystemPrompt = (date = new Date()): string => `
You are a friendly WhatsApp ordering assistant for Manvi's Kitchen, a home cloud kitchen in Pune run by Manvi.

Style:
- Be warm, helpful, and conversational, like a friendly neighbourhood kitchen.
- Match the customer's language: Hindi, English, or Hinglish.
- Use light food emojis occasionally, but keep replies short for WhatsApp.

You can:
- Greet customers and help them start an order.
- Show today's menu using the get_menu tool.
- Answer basic ordering questions from the menu.

Rules:
- On the first reply to a customer, clearly say you are Manvi's Kitchen's AI assistant.
- This version cannot create orders yet. When the customer is ready, say order confirmation is coming soon and ask them to contact support if urgent.
- Never promise items that are not on today's menu.
- Never make up prices. Always use get_menu before listing items or prices.
- Keep replies short.
- Payment options are UPI link and COD.
- Kitchen hours: lunch 11 AM to 3 PM, dinner 6 PM to 10 PM. Deliveries happen every hour on the hour.

Current time in India: ${getIstTimestamp(date)}
`.trim();

export const calculateExpiresAt = (date = new Date()): number =>
  Math.floor(date.getTime() / 1000) + SESSION_TTL_SECONDS;

const normalizeFirstName = (firstName?: string): string => {
  const trimmed = (firstName || '').trim();
  return trimmed || 'there';
};

const loadConversation = async (message: WhatsAppInboundTextMessage): Promise<ConversationSession> => {
  const now = new Date();
  const result = await docClient.send(new GetCommand({
    TableName: getRequiredEnv('WHATSAPP_CONVERSATION_TABLE'),
    Key: { phoneNumber: message.from },
  }));

  if (result.Item) {
    return {
      phoneNumber: message.from,
      firstName: normalizeFirstName(result.Item.firstName || message.firstName),
      messages: Array.isArray(result.Item.messages) ? result.Item.messages : [],
      createdAt: result.Item.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: calculateExpiresAt(now),
    };
  }

  return {
    phoneNumber: message.from,
    firstName: normalizeFirstName(message.firstName),
    messages: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: calculateExpiresAt(now),
  };
};

const saveConversation = async (session: ConversationSession): Promise<void> => {
  await docClient.send(new PutCommand({
    TableName: getRequiredEnv('WHATSAPP_CONVERSATION_TABLE'),
    Item: session,
  }));
};

const appendConversation = (
  session: ConversationSession,
  inboundText: string,
  assistantText: string,
): ConversationSession => {
  const now = new Date();
  const messages = [
    ...session.messages,
    { role: 'user' as const, text: inboundText, timestamp: now.toISOString() },
    { role: 'assistant' as const, text: assistantText, timestamp: now.toISOString() },
  ].slice(-MAX_RECENT_MESSAGES);

  return {
    ...session,
    messages,
    updatedAt: now.toISOString(),
    expiresAt: calculateExpiresAt(now),
  };
};

export const formatMenuToolResult = (
  items: Record<string, unknown>[],
  configs: Record<string, unknown>[],
): MenuToolResult => {
  const configByItemId = new Map(configs.map((config) => [String(config.itemId), config]));
  const globalConfig = configByItemId.get('GLOBAL');
  const kitchenOpen = globalConfig?.globalKillswitch !== true;

  return {
    kitchenOpen,
    items: items
      .map((item) => {
        const itemConfig = configByItemId.get(String(item.itemId)) || {};
        const available = kitchenOpen &&
          item.available !== false &&
          itemConfig.isAcceptingOrders !== false;

        return {
          itemId: String(item.itemId),
          name: String(item.name || 'Unnamed item'),
          description: typeof item.description === 'string' ? item.description : undefined,
          category: typeof item.category === 'string' ? item.category : undefined,
          price: typeof item.price === 'number' ? item.price : undefined,
          available,
          lunchLimit: typeof itemConfig.lunchLimit === 'number' ? itemConfig.lunchLimit : null,
          dinnerLimit: typeof itemConfig.dinnerLimit === 'number' ? itemConfig.dinnerLimit : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
};

const getMenu = async (): Promise<MenuToolResult> => {
  const [itemsResult, configsResult] = await Promise.all([
    docClient.send(new ScanCommand({
      TableName: getRequiredEnv('ITEM_TABLE'),
    })),
    docClient.send(new ScanCommand({
      TableName: getRequiredEnv('ORDER_LIMITS_CONFIG_TABLE'),
    })),
  ]);

  return formatMenuToolResult(
    (itemsResult.Items || []) as Record<string, unknown>[],
    (configsResult.Items || []) as Record<string, unknown>[],
  );
};

const toBedrockMessages = (
  session: ConversationSession,
  inboundMessage: WhatsAppInboundTextMessage,
): Message[] => {
  const contextText = JSON.stringify({
    customer: {
      firstName: session.firstName,
      whatsappId: session.phoneNumber,
    },
    note: 'Use this customer context silently. Do not repeat IDs to the customer.',
  });

  const recentMessages = session.messages.map((message) => ({
    role: message.role,
    content: [{ text: message.text }],
  }));

  return [
    {
      role: 'user',
      content: [{ text: `Customer context: ${contextText}` }],
    },
    ...recentMessages,
    {
      role: 'user',
      content: [{ text: inboundMessage.text }],
    },
  ];
};

const getTextFromMessage = (message?: Message): string => {
  const parts = message?.content
    ?.map((block) => ('text' in block ? block.text : undefined))
    .filter((text): text is string => Boolean(text?.trim())) || [];

  return parts.join('\n').trim();
};

const getToolUses = (message?: Message): ToolUseBlock[] =>
  message?.content
    ?.map((block) => ('toolUse' in block ? block.toolUse : undefined))
    .filter((toolUse): toolUse is ToolUseBlock => Boolean(toolUse?.toolUseId)) || [];

const buildToolResult = async (toolUse: ToolUseBlock): Promise<ContentBlock> => {
  if (toolUse.name !== 'get_menu') {
    return {
      toolResult: {
        toolUseId: toolUse.toolUseId,
        status: 'error',
        content: [{ text: `Unsupported tool: ${toolUse.name}` }],
      },
    };
  }

  const menu = await getMenu();
  return {
    toolResult: {
      toolUseId: toolUse.toolUseId,
      status: 'success',
      content: [{ text: JSON.stringify(menu) }],
    },
  };
};

const buildConverseInput = (messages: Message[]): ConverseCommandInput => ({
  modelId: getModelId(),
  system: [{ text: buildSystemPrompt() }],
  messages,
  inferenceConfig: {
    maxTokens: 500,
    temperature: 0.4,
  },
  toolConfig: {
    tools: [{
      toolSpec: {
        name: 'get_menu',
        description: "Fetch today's Manvi's Kitchen menu with item names, prices, and availability.",
        inputSchema: {
          json: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      },
    }],
  },
});

const runAssistant = async (
  session: ConversationSession,
  inboundMessage: WhatsAppInboundTextMessage,
): Promise<string> => {
  let messages = toBedrockMessages(session, inboundMessage);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await bedrockClient.send(new ConverseCommand(buildConverseInput(messages)));
    const outputMessage = response.output?.message;
    const toolUses = getToolUses(outputMessage);

    if (toolUses.length === 0) {
      const text = getTextFromMessage(outputMessage);
      return text || "Sorry, I couldn't process that. Would you like to see today's menu?";
    }

    messages = [
      ...messages,
      outputMessage as Message,
      {
        role: 'user',
        content: await Promise.all(toolUses.map((toolUse) => buildToolResult(toolUse))),
      },
    ];
  }

  return "Sorry, I'm taking longer than expected. Please ask me for the menu again.";
};

const sendWhatsAppTextMessage = async (
  message: WhatsAppInboundTextMessage,
  responseText: string,
): Promise<void> => {
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
        body: responseText,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp API request failed with ${response.status}: ${await response.text()}`);
  }

  console.log('Sent WhatsApp assistant message', JSON.stringify({
    inboundMessageId: message.messageId,
    to: message.from,
    status: response.status,
  }));
};

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const message = JSON.parse(record.body) as WhatsAppInboundTextMessage;
    const session = await loadConversation(message);
    const assistantResponse = await runAssistant(session, message);

    await sendWhatsAppTextMessage(message, assistantResponse);
    await saveConversation(appendConversation(session, message.text, assistantResponse));
  }
};
