import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseCommandInput,
  Message,
} from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SQSEvent } from 'aws-lambda';
import {
  Cart,
  MenuItem as CoreMenuItem,
  OrderingCore,
  normalizePhoneNumber,
} from '@manvi-kitchen/ordering-core';

type WhatsAppInboundMessageKind = 'text' | 'button' | 'list' | 'flow';

interface WhatsAppInboundMessage {
  kind?: WhatsAppInboundMessageKind;
  messageId: string;
  from: string;
  firstName: string;
  text: string;
  actionId?: string;
  actionTitle?: string;
  buttonId?: string;
  buttonTitle?: string;
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
  mode?: 'AI' | 'STATIC';
  state?: WhatsAppConversationState;
  pendingItemId?: string;
  messages: ConversationMessage[];
  pendingOrderDraft?: PendingOrderDraft;
  createdAt: string;
  updatedAt: string;
  expiresAt: number;
}

type WhatsAppConversationState =
  | 'IDLE'
  | 'MAIN_MENU'
  | 'WAITING_FOR_QUANTITY'
  | 'CART_ACTIVE'
  | 'SPECIAL_REQUEST'
  | 'ADDRESS_CONFIRMATION'
  | 'WAITING_FOR_ADDRESS'
  | 'PAYMENT_SELECTION'
  | 'HANDOFF_REQUIRED';

interface OrderItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  amount: number;
}

interface OrderRecord {
  orderId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  status?: string;
  paymentMethod?: string;
  promisedDeliveryAt?: string;
  items: OrderItem[];
  totalAmount: number;
  instructions?: string;
  createdAt: string;
}

interface PendingOrderDraft {
  customerType: 'NEW' | 'RETURNING';
  source: 'BEST_SELLER' | 'PREVIOUS_ORDER' | 'AI_DRAFT' | 'MENU_LINK';
  sourceOrderId?: string;
  items: OrderItem[];
  totalAmount: number;
  customerName?: string;
  customerPhone: string;
  deliveryAddress?: string;
  paymentMethod: 'COD' | 'UPI';
  instructions?: string;
  lastReviewTimestamp: string;
}

interface MenuItem {
  itemId: string;
  name: string;
  description?: string;
  category?: string;
  price?: number;
  available: boolean;
}

interface PreferenceItem {
  itemId: string;
  name: string;
  timesOrdered: number;
  totalQuantity: number;
  usualQuantity: number;
}

interface PreferenceSummary {
  orderCountAnalyzed: number;
  recommendationEligible: boolean;
  favoriteItems: PreferenceItem[];
  repeatCandidate?: {
    orderId: string;
    itemsText: string;
    totalAmount: number;
    deliveryAddress: string;
    instructions?: string;
  };
}

const SESSION_TTL_SECONDS = 60 * 60;
const MAX_RECENT_MESSAGES = 10;
const DEFAULT_MODEL_ID = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';
const DEFAULT_MENU_URL = 'https://cravnest.in/#menu';
const BEST_SELLER_ITEM_NAME = 'Chicken Biryani';
const RECOMMENDATION_MIN_ORDER_COUNT = 5;

const ssmClient = new SSMClient({});
const bedrockClient = new BedrockRuntimeClient({});
const lambdaClient = new LambdaClient({});
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

const getMenuUrl = (): string => process.env.WHATSAPP_MENU_URL || DEFAULT_MENU_URL;

const getOrderingCore = (): OrderingCore => new OrderingCore({
  customerTableName: getRequiredEnv('CUSTOMER_PROFILE_TABLE'),
  cartTableName: getRequiredEnv('CART_TABLE'),
  cartEventTableName: getRequiredEnv('CART_EVENT_TABLE'),
  itemTableName: getRequiredEnv('ITEM_TABLE'),
  orderLimitsConfigTableName: getRequiredEnv('ORDER_LIMITS_CONFIG_TABLE'),
});

const normalizeFirstName = (firstName?: string): string => {
  const trimmed = (firstName || '').trim();
  return trimmed || 'there';
};

export const calculateExpiresAt = (date = new Date()): number =>
  Math.floor(date.getTime() / 1000) + SESSION_TTL_SECONDS;

const isMenuExitIntent = (message: WhatsAppInboundMessage): boolean => {
  const value = (message.buttonId || message.text || '').trim().toLowerCase();
  return ['view_menu', 'menu', 'view menu', 'stop', 'exit', 'cancel'].includes(value);
};

const isConfirmIntent = (message: WhatsAppInboundMessage): boolean => {
  const value = (message.buttonId || message.text || '').trim().toLowerCase();
  return ['confirm_order', 'confirm_similar_order', 'confirm', 'yes', 'haan', 'ha', 'ok', 'okay', 'correct'].includes(value);
};

const loadConversation = async (message: WhatsAppInboundMessage): Promise<ConversationSession> => {
  const now = new Date();
  const result = await docClient.send(new GetCommand({
    TableName: getRequiredEnv('WHATSAPP_CONVERSATION_TABLE'),
    Key: { phoneNumber: message.from },
  }));

  if (result.Item) {
    return {
      phoneNumber: message.from,
      firstName: normalizeFirstName(result.Item.firstName || message.firstName),
      mode: result.Item.mode === 'STATIC' ? 'STATIC' : 'AI',
      state: result.Item.state || 'IDLE',
      pendingItemId: result.Item.pendingItemId,
      messages: Array.isArray(result.Item.messages) ? result.Item.messages : [],
      pendingOrderDraft: result.Item.pendingOrderDraft as PendingOrderDraft | undefined,
      createdAt: result.Item.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: calculateExpiresAt(now),
    };
  }

  return {
    phoneNumber: message.from,
    firstName: normalizeFirstName(message.firstName),
    mode: 'AI',
    state: 'IDLE',
    pendingItemId: undefined,
    messages: [],
    pendingOrderDraft: undefined,
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
    mode: 'AI',
    messages,
    updatedAt: now.toISOString(),
    expiresAt: calculateExpiresAt(now),
  };
};

const appendUserConversation = (
  session: ConversationSession,
  inboundText: string,
): ConversationSession => {
  const now = new Date();
  const messages = [
    ...session.messages,
    { role: 'user' as const, text: inboundText, timestamp: now.toISOString() },
  ].slice(-MAX_RECENT_MESSAGES);

  return {
    ...session,
    mode: 'AI',
    messages,
    updatedAt: now.toISOString(),
    expiresAt: calculateExpiresAt(now),
  };
};

const queryRecentOrders = async (phoneNumber: string): Promise<OrderRecord[]> => {
  const candidates = Array.from(new Set([phoneNumber, `+${phoneNumber}`]));

  for (const candidate of candidates) {
    const result = await docClient.send(new QueryCommand({
      TableName: getRequiredEnv('ORDER_TABLE'),
      IndexName: 'customerPhone-createdAt-index',
      KeyConditionExpression: 'customerPhone = :customerPhone',
      ExpressionAttributeValues: {
        ':customerPhone': candidate,
      },
      ScanIndexForward: false,
      Limit: 10,
    }));

    if (result.Items?.length) {
      return (result.Items as OrderRecord[])
        .filter((order) => !['CANCELLED', 'PENDING_PAYMENT'].includes(order.status || ''))
        .slice(0, 5);
    }
  }

  return [];
};

export const summarizePreferences = (orders: OrderRecord[]): PreferenceSummary => {
  const itemStats = new Map<string, PreferenceItem>();
  const recommendationEligible = orders.length >= RECOMMENDATION_MIN_ORDER_COUNT;

  for (const order of orders) {
    const uniqueItemsInOrder = new Set<string>();
    for (const item of order.items || []) {
      const key = item.itemId;
      const existing = itemStats.get(key) || {
        itemId: item.itemId,
        name: item.name,
        timesOrdered: 0,
        totalQuantity: 0,
        usualQuantity: 0,
      };
      if (!uniqueItemsInOrder.has(key)) {
        existing.timesOrdered += 1;
        uniqueItemsInOrder.add(key);
      }
      existing.totalQuantity += item.quantity;
      existing.usualQuantity = Math.max(1, Math.round(existing.totalQuantity / existing.timesOrdered));
      itemStats.set(key, existing);
    }
  }

  const latestOrder = orders[0];
  return {
    orderCountAnalyzed: orders.length,
    recommendationEligible,
    favoriteItems: recommendationEligible
      ? Array.from(itemStats.values())
        .sort((a, b) => b.timesOrdered - a.timesOrdered || b.totalQuantity - a.totalQuantity)
        .slice(0, 3)
      : [],
    repeatCandidate: latestOrder
      ? {
        orderId: latestOrder.orderId,
        itemsText: formatOrderItems(latestOrder.items),
        totalAmount: latestOrder.totalAmount,
        deliveryAddress: latestOrder.deliveryAddress,
        instructions: latestOrder.instructions,
      }
      : undefined,
  };
};

export const formatOrderItems = (items: OrderItem[] = []): string =>
  items.map((item) => `${item.quantity} ${item.name}`).join(', ');

const getMenu = async (): Promise<MenuItem[]> => {
  const [itemsResult, configsResult] = await Promise.all([
    docClient.send(new ScanCommand({
      TableName: getRequiredEnv('ITEM_TABLE'),
    })),
    docClient.send(new ScanCommand({
      TableName: getRequiredEnv('ORDER_LIMITS_CONFIG_TABLE'),
    })),
  ]);

  const configByItemId = new Map((configsResult.Items || []).map((config) => [String(config.itemId), config]));
  const globalConfig = configByItemId.get('GLOBAL');
  const kitchenOpen = globalConfig?.globalKillswitch !== true && globalConfig?.isAcceptingOrders !== false;

  return ((itemsResult.Items || []) as Record<string, unknown>[])
    .map((item) => {
      const itemConfig = configByItemId.get(String(item.itemId)) || {};
      return {
        itemId: String(item.itemId),
        name: String(item.name || 'Unnamed item'),
        description: typeof item.description === 'string' ? item.description : undefined,
        category: typeof item.category === 'string' ? item.category : undefined,
        price: typeof item.price === 'number' ? item.price : undefined,
        available: kitchenOpen && item.available !== false && itemConfig.isAcceptingOrders !== false,
      };
    })
    .filter((item) => item.available)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const getIstTimestamp = (date = new Date()): string =>
  date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const formatPromisedDelivery = (isoTimestamp?: string): string => {
  if (!isoTimestamp) {
    return 'within 1 hour';
  }

  return new Date(isoTimestamp).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
};

const getBestSellerName = (): string => BEST_SELLER_ITEM_NAME;

const buildCustomerPrompt = (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  preferenceSummary: PreferenceSummary,
  menu: MenuItem[],
  customerType: 'NEW' | 'RETURNING',
): string => `
You are Manvi's Kitchen's AI assistant on WhatsApp.

Return only the WhatsApp message text to send to the customer.
If no response is useful, return an empty string.

Style:
- Be warm, helpful, and conversational, like a friendly neighbourhood kitchen.
- Match the customer's language: Hindi, English, or Hinglish.
- Use light food emojis occasionally, but keep replies short for WhatsApp.

Rules:
- Keep the body under 450 characters.
- On the first reply to a customer, clearly but subtly say you are Manvi's Kitchen's AI assistant.
- If recent conversation already exists, do not repeat the AI disclaimer every time.
- Never promise items that are not on today's menu.
- Never make up prices. Use the menu data before listing items or prices.
- Never say an order is confirmed unless the worker has already reviewed details and confirmed it.
- Payment options are UPI link and COD.
- Delivery promise is within 1 hour after order confirmation.
- Use the customer's first name when it is available and not "there".
- Do not sound like a database lookup. Lead with hospitality, then help.
- Do not push quick replies, menus of buttons, or "click one option" wording.

Customer flow:
- For NEW customers, welcome them and say "${getBestSellerName()}" is a popular pick if it is available in the menu.
- For the first RETURNING customer reply, greet them warmly first. Do not lead with "Last time you ordered..." in the opening message.
- First RETURNING reply style: "Hi {name}, welcome back. I'm Manvi's Kitchen's AI assistant. How can I help today?"
- For RETURNING customers with fewer than ${RECOMMENDATION_MIN_ORDER_COUNT} orders, do not make preference claims. You may gently mention that you can help with the previous order if the customer asks.
- For RETURNING customers with at least ${RECOMMENDATION_MIN_ORDER_COUNT} orders, you may suggest favorites from the preference summary.
- If the customer asks to add items or customize beyond the current draft, answer naturally and use the menu data you have.
- If the customer wants to place or confirm an order, remind them that you will show a review first and need explicit confirmation.

Customer:
${JSON.stringify({
    type: customerType,
    firstName: session.firstName,
    whatsappId: session.phoneNumber,
    isFirstAssistantReply: session.messages.length === 0,
  })}

Preference summary from last ${preferenceSummary.orderCountAnalyzed} orders:
${JSON.stringify(preferenceSummary)}

Pending order draft:
${JSON.stringify(session.pendingOrderDraft || null)}

Available menu preview:
${JSON.stringify(menu.slice(0, 12).map((item) => ({ name: item.name, price: item.price })))}

Recent conversation:
${JSON.stringify(session.messages.slice(-6))}

Customer message:
${message.actionTitle || message.buttonTitle || message.text}

Current India time:
${getIstTimestamp()}
`.trim();

const runCustomerAssistant = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  preferenceSummary: PreferenceSummary,
  customerType: 'NEW' | 'RETURNING',
): Promise<string | undefined> => {
  const menu = await getMenu();
  const messages: Message[] = [{
    role: 'user',
    content: [{ text: buildCustomerPrompt(message, session, preferenceSummary, menu, customerType) }],
  }];

  const input: ConverseCommandInput = {
    modelId: getModelId(),
    messages,
    inferenceConfig: {
      maxTokens: 600,
      temperature: 0.3,
    },
  };

  const response = await bedrockClient.send(new ConverseCommand(input));
  const text = response.output?.message?.content
    ?.map((block) => ('text' in block ? block.text : undefined))
    .filter((value): value is string => Boolean(value?.trim()))
    .join('\n')
    .trim();

  return text || undefined;
};

const getWhatsAppCredentials = async (): Promise<{ accessToken: string; phoneNumberId: string }> => {
  const [accessToken, phoneNumberId] = await Promise.all([
    getRequiredParameter(getAccessTokenParameterName()),
    getRequiredParameter(getPhoneNumberIdParameterName()),
  ]);

  return { accessToken, phoneNumberId };
};

const sendWhatsAppPayload = async (to: string, payload: Record<string, unknown>): Promise<void> => {
  const { accessToken, phoneNumberId } = await getWhatsAppCredentials();
  const response = await fetch(`https://graph.facebook.com/${getGraphApiVersion()}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      ...payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp API request failed with ${response.status}: ${await response.text()}`);
  }
};

const sendTextMessage = async (to: string, body: string): Promise<void> => {
  await sendWhatsAppPayload(to, {
    type: 'text',
    text: {
      preview_url: true,
      body,
    },
  });
};

export interface ReplyButton {
  id: string;
  title: string;
}

export const buildStartButtons = (returningCustomer: boolean, kitchenOpen: boolean): ReplyButton[] => {
  if (!kitchenOpen) {
    return [
      { id: 'ask_question', title: 'Ask Question' },
      { id: 'view_menu_link', title: 'View Menu' },
    ];
  }

  return returningCustomer
    ? [
      { id: 'order_now', title: 'Order Now' },
      { id: 'repeat_order', title: 'Repeat Order' },
      { id: 'ask_question', title: 'Ask Question' },
    ]
    : [
      { id: 'order_now', title: 'Order Now' },
      { id: 'ask_question', title: 'Ask Question' },
    ];
};

const sendReplyButtonsMessage = async (
  to: string,
  body: string,
  buttons: ReplyButton[],
): Promise<void> => {
  await sendWhatsAppPayload(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.slice(0, 3).map((button) => ({
          type: 'reply',
          reply: {
            id: button.id,
            title: button.title,
          },
        })),
      },
    },
  });
};

const sendListMessage = async (
  to: string,
  body: string,
  buttonText: string,
  sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
): Promise<void> => {
  await sendWhatsAppPayload(to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body },
      action: {
        button: buttonText,
        sections: sections.map((section) => ({
          title: section.title.slice(0, 24),
          rows: section.rows.slice(0, 10).map((row) => ({
            id: row.id.slice(0, 200),
            title: row.title.slice(0, 24),
            ...(row.description ? { description: row.description.slice(0, 72) } : {}),
          })),
        })),
      },
    },
  });
};

const sendMenuLink = async (to: string, firstName: string): Promise<void> => {
  await sendTextMessage(
    to,
    `Sure ${normalizeFirstName(firstName)}, you can view today's menu and place an order here: ${getMenuUrl()}`,
  );
};

const calculateDraftTotal = (items: OrderItem[]): number =>
  items.reduce((total, item) => total + item.price * item.quantity, 0);

const updateDraftAmounts = (draft: PendingOrderDraft): PendingOrderDraft => {
  const items = draft.items.map((item) => ({
    ...item,
    amount: item.price * item.quantity,
  }));
  return {
    ...draft,
    items,
    totalAmount: calculateDraftTotal(items),
    lastReviewTimestamp: new Date().toISOString(),
  };
};

export const applySimpleQuantityChange = (
  draft: PendingOrderDraft | undefined,
  text: string,
): PendingOrderDraft | undefined => {
  if (!draft) {
    return undefined;
  }

  const lowerText = text.toLowerCase();
  const updatedItems = draft.items.map((item) => {
    const escapedName = item.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`(?:make|change|update|set)?\\s*(\\d+)\\s+${escapedName}`),
      new RegExp(`${escapedName}\\s*(?:x|to)?\\s*(\\d+)`),
    ];
    const match = patterns.map((pattern) => lowerText.match(pattern)).find(Boolean);
    if (!match) {
      return item;
    }
    const quantity = Math.max(1, Math.min(10, Number(match[1])));
    return {
      ...item,
      quantity,
      amount: item.price * quantity,
    };
  });

  const changed = updatedItems.some((item, index) => item.quantity !== draft.items[index]?.quantity);
  return changed ? updateDraftAmounts({ ...draft, items: updatedItems }) : undefined;
};

const applyCustomerDetails = (
  draft: PendingOrderDraft | undefined,
  message: WhatsAppInboundMessage,
): PendingOrderDraft | undefined => {
  if (!draft || (draft.customerName && draft.deliveryAddress)) {
    return undefined;
  }

  const text = message.text.trim();
  if (!text || message.kind === 'button') {
    return undefined;
  }
  if (['confirm', 'yes', 'haan', 'ha', 'ok', 'okay', 'correct'].includes(text.toLowerCase())) {
    return undefined;
  }

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const explicitName = text.match(/(?:name|naam)\s*[:\-]\s*([^,\n]+)/i)?.[1]?.trim();
  const explicitAddress = text.match(/(?:address|addr|pata)\s*[:\-]\s*(.+)/i)?.[1]?.trim();
  const inferredName = explicitName || (lines.length > 1 ? lines[0] : undefined);
  const inferredAddress = explicitAddress || (lines.length > 1 ? lines.slice(1).join(', ') : text);

  return {
    ...draft,
    customerName: draft.customerName || inferredName || normalizeFirstName(message.firstName),
    deliveryAddress: draft.deliveryAddress || inferredAddress,
    customerPhone: draft.customerPhone || message.from,
    lastReviewTimestamp: new Date().toISOString(),
  };
};

export const applyAddressChange = (
  draft: PendingOrderDraft | undefined,
  message: WhatsAppInboundMessage,
): PendingOrderDraft | undefined => {
  if (!draft || !draft.deliveryAddress || message.kind === 'button') {
    return undefined;
  }

  const text = message.text.trim();
  const lowerText = text.toLowerCase();
  if (!text || !/(address|flat|house|building|tower|deliver|delivery|pata)/i.test(text)) {
    return undefined;
  }

  const explicitAddress = text.match(/(?:address|pata)\s*(?:to|as|:|-)\s*(.+)/i)?.[1]?.trim();
  if (explicitAddress) {
    return {
      ...draft,
      deliveryAddress: explicitAddress,
      lastReviewTimestamp: new Date().toISOString(),
    };
  }

  const replacement = text.match(/(?:change|update|make|set).{0,40}?(?:flat|house|building|tower|number|no\.?)\s*(?:number|no\.?)?\s*(?:to|as)\s*([a-z0-9-/]+)/i);
  if (replacement) {
    const newValue = replacement[1].trim();
    const address = draft.deliveryAddress;
    const updatedAddress = address.replace(/\b[A-Z]?\d+[A-Z]?[-/]\d+[A-Z]?\b/i, newValue);
    return {
      ...draft,
      deliveryAddress: updatedAddress === address ? `${newValue}, ${address}` : updatedAddress,
      lastReviewTimestamp: new Date().toISOString(),
    };
  }

  if (lowerText.includes('change') || lowerText.includes('update')) {
    const possibleAddress = text
      .replace(/^(please\s+)?(change|update|set|make)\s+(my\s+)?(delivery\s+)?address\s*(to|as|:|-)?\s*/i, '')
      .trim();
    if (possibleAddress && possibleAddress !== text) {
      return {
        ...draft,
        deliveryAddress: possibleAddress,
        lastReviewTimestamp: new Date().toISOString(),
      };
    }
  }

  return undefined;
};

export const buildOrderReviewMessage = (order: OrderRecord | PendingOrderDraft): string => {
  const instructions = order.instructions ? `\nInstructions: ${order.instructions}` : '';
  const customerName = order.customerName || 'Not provided';
  const deliveryAddress = order.deliveryAddress || 'Not provided';
  return `Please review your order:\n${formatOrderItems(order.items)}\nAmount: Rs ${order.totalAmount}\nName: ${customerName}\nPhone: ${order.customerPhone}\nDelivery address: ${deliveryAddress}${instructions}\n\nPayment: ${order.paymentMethod || 'COD'}\nDelivery: within 1 hour after confirmation.\n\nPlease confirm only if these details are correct.`;
};

const sendOrderReview = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  draft: PendingOrderDraft,
): Promise<{ body: string; session: ConversationSession }> => {
  if (!draft.customerName || !draft.deliveryAddress) {
    const body = `Great choice. Please send your name and delivery address before I review the order.\n\nExample:\nName: Rahul\nAddress: Bavdhan, Pune`;
    await sendTextMessage(message.from, body);
    return {
      body,
      session: {
        ...session,
        pendingOrderDraft: draft,
      },
    };
  }

  const body = buildOrderReviewMessage(draft);
  await sendTextMessage(message.from, body);

  return {
    body,
    session: {
      ...session,
      pendingOrderDraft: draft,
    },
  };
};

const invokeCreateOrder = async (sourceMessage: WhatsAppInboundMessage, order: OrderRecord | PendingOrderDraft): Promise<OrderRecord> => {
  const payload = {
    httpMethod: 'POST',
    path: '/orders',
    headers: {},
    queryStringParameters: null,
    pathParameters: null,
    body: JSON.stringify({
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      paymentMethod: order.paymentMethod || 'COD',
      items: order.items.map((item) => ({ id: item.itemId, quantity: item.quantity })),
      instructions: order.instructions,
    }),
    requestContext: {
      authorizer: {
        claims: {
          sub: `whatsapp:${sourceMessage.from}`,
          username: `whatsapp:${sourceMessage.from}`,
        },
      },
    },
  };

  const response = await lambdaClient.send(new InvokeCommand({
    FunctionName: getRequiredEnv('ORDER_FUNCTION_NAME'),
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify(payload)),
  }));

  const responsePayload = response.Payload ? JSON.parse(Buffer.from(response.Payload).toString('utf8')) : {};
  const statusCode = Number(responsePayload.statusCode || 500);
  const body = responsePayload.body ? JSON.parse(responsePayload.body) : {};
  if (statusCode >= 400) {
    throw new Error(body.message || body.error || 'Unable to create repeat order');
  }

  return (body.order || body) as OrderRecord;
};

const confirmPendingOrder = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
): Promise<{ body: string; session: ConversationSession }> => {
  const draft = session.pendingOrderDraft;
  if (!draft) {
    await sendMenuLink(message.from, message.firstName);
    return {
      body: 'No reviewed order found; sent menu link.',
      session: { ...session, pendingOrderDraft: undefined },
    };
  }

  if (!draft.customerName || !draft.deliveryAddress) {
    return sendOrderReview(message, session, draft);
  }

  try {
    const newOrder = await invokeCreateOrder(message, draft);
    const body = `Thanks, your COD order is confirmed. We'll deliver within 1 hour, by ${formatPromisedDelivery(newOrder.promisedDeliveryAt)}.`;
    await sendTextMessage(message.from, body);
    return {
      body,
      session: { ...session, pendingOrderDraft: undefined },
    };
  } catch (error) {
    console.error('Unable to create similar WhatsApp order', error);
    const body = `I couldn't place this order because some details may have changed. Please view today's menu and place a fresh order.`;
    await sendTextMessage(message.from, body);
    return {
      body,
      session: { ...session, pendingOrderDraft: undefined },
    };
  }
};

const getActionValue = (message: WhatsAppInboundMessage): string =>
  (message.actionId || message.buttonId || message.text || '').trim();

const getActionText = (message: WhatsAppInboundMessage): string =>
  (message.actionTitle || message.buttonTitle || message.text || '').trim();

const isAction = (message: WhatsAppInboundMessage, ...ids: string[]): boolean => {
  const value = getActionValue(message).toLowerCase();
  const text = getActionText(message).toLowerCase();
  return ids.some((id) => value === id.toLowerCase() || text === id.toLowerCase());
};

const formatCartLines = (cart: Cart): string =>
  cart.items.map((item, index) => `${index + 1}. ${item.name} x ${item.quantity} - Rs ${item.amount}`).join('\n');

const buildCartSummary = (cart: Cart): string =>
  cart.items.length
    ? `Your cart:\n${formatCartLines(cart)}\nSubtotal: Rs ${cart.totalAmount}\nRaita, salad and dessert included complimentary.`
    : 'Your cart is empty.';

const groupMenuSections = (menu: CoreMenuItem[]): Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> => {
  const byCategory = new Map<string, CoreMenuItem[]>();
  for (const item of menu) {
    const category = item.category || 'Menu';
    byCategory.set(category, [...(byCategory.get(category) || []), item]);
  }

  return Array.from(byCategory.entries()).slice(0, 10).map(([title, items]) => ({
    title,
    rows: items.slice(0, 10).map((item) => ({
      id: `menu:item:${item.itemId}`,
      title: item.name,
      description: `Rs ${item.price}`,
    })),
  }));
};

const sendStartMessage = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  returningCustomer: boolean,
  kitchenOpen: boolean,
): Promise<{ body: string; session: ConversationSession }> => {
  if (!kitchenOpen) {
    const body = `Hi ${normalizeFirstName(session.firstName)}. We're currently closed. You can still ask us anything, and we'll help when orders open again.`;
    await sendReplyButtonsMessage(message.from, body, buildStartButtons(returningCustomer, false));
    return {
      body,
      session: { ...session, state: 'IDLE', pendingItemId: undefined },
    };
  }

  const body = `Hi ${normalizeFirstName(session.firstName)}. Welcome to Manvi's Kitchen. Fresh food is available now. Delivery usually takes around 60 mins.`;
  await sendReplyButtonsMessage(message.from, body, buildStartButtons(returningCustomer, true));
  return {
    body,
    session: { ...session, state: 'MAIN_MENU', pendingItemId: undefined },
  };
};

const sendMenuList = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  core: OrderingCore,
): Promise<{ body: string; session: ConversationSession }> => {
  const menu = await core.getAvailableMenu();
  if (!menu.length) {
    const body = `We're not accepting orders right now. Please try again later.`;
    await sendTextMessage(message.from, body);
    return { body, session: { ...session, state: 'IDLE', pendingItemId: undefined } };
  }

  const body = `Choose an item to add to your cart.\nRaita, salad and dessert are complimentary.`;
  await sendListMessage(message.from, body, 'Today\'s Menu', groupMenuSections(menu));
  return { body, session: { ...session, state: 'MAIN_MENU', pendingItemId: undefined } };
};

const sendQuantityPrompt = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  menuItem: CoreMenuItem,
): Promise<{ body: string; session: ConversationSession }> => {
  const body = `${menuItem.name}\nRs ${menuItem.price}\nIncludes raita, salad and dessert.\nDelivery in around 60 mins.\n\nHow many would you like?`;
  await sendReplyButtonsMessage(message.from, body, [
    { id: 'qty:1', title: 'Add 1' },
    { id: 'qty:2', title: 'Add 2' },
    { id: 'qty:other', title: 'Other Qty' },
  ]);
  return {
    body,
    session: { ...session, state: 'WAITING_FOR_QUANTITY', pendingItemId: menuItem.itemId },
  };
};

const sendCartActions = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  cart: Cart,
): Promise<{ body: string; session: ConversationSession }> => {
  const body = `${buildCartSummary(cart)}\n\nWhat would you like to do next?`;
  await sendReplyButtonsMessage(message.from, body, [
    { id: 'add_more', title: 'Add More' },
    { id: 'checkout', title: 'Checkout' },
    { id: 'view_cart', title: 'View Cart' },
  ]);
  return { body, session: { ...session, state: 'CART_ACTIVE', pendingItemId: undefined } };
};

const parseQuantity = (message: WhatsAppInboundMessage): number | undefined => {
  if (isAction(message, 'qty:1', 'add 1')) {
    return 1;
  }
  if (isAction(message, 'qty:2', 'add 2')) {
    return 2;
  }
  const match = getActionText(message).match(/\d+/);
  if (!match) {
    return undefined;
  }
  const quantity = Number(match[0]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : undefined;
};

const handleQuantity = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  core: OrderingCore,
): Promise<{ body: string; session: ConversationSession }> => {
  if (isAction(message, 'qty:other', 'other qty')) {
    const body = 'Please type the quantity. Example: 3';
    await sendTextMessage(message.from, body);
    return { body, session: { ...session, state: 'WAITING_FOR_QUANTITY' } };
  }

  const quantity = parseQuantity(message);
  if (!quantity || !session.pendingItemId) {
    const body = 'Please choose Add 1, Add 2, or type a quantity like 3.';
    await sendTextMessage(message.from, body);
    return { body, session: { ...session, state: 'WAITING_FOR_QUANTITY' } };
  }

  const menuItem = (await core.getAvailableMenu()).find((item) => item.itemId === session.pendingItemId);
  if (!menuItem) {
    const body = 'That item is not available anymore. Please choose from today\'s menu.';
    await sendTextMessage(message.from, body);
    return { body, session: { ...session, state: 'MAIN_MENU', pendingItemId: undefined } };
  }

  const cart = await core.getOrCreateCart(message.from, 'WHATSAPP', session.firstName);
  const updatedCart = await core.addItemToCart(cart, menuItem, quantity);
  return sendCartActions(message, session, updatedCart);
};

const handleCheckout = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  core: OrderingCore,
): Promise<{ body: string; session: ConversationSession }> => {
  const cart = await core.getActiveCart(message.from, 'WHATSAPP');
  if (!cart || !cart.items.length) {
    const body = 'Your cart is empty. Please choose an item first.';
    await sendTextMessage(message.from, body);
    return { body, session: { ...session, state: 'MAIN_MENU' } };
  }

  await core.startCheckout(cart);
  const body = `Any special request?\nExample: Less spicy, no onion, call before delivery.\nYou can type your request or skip.`;
  await sendReplyButtonsMessage(message.from, body, [
    { id: 'special:skip', title: 'Skip' },
  ]);
  return { body, session: { ...session, state: 'SPECIAL_REQUEST' } };
};

const handleSpecialRequest = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  core: OrderingCore,
): Promise<{ body: string; session: ConversationSession }> => {
  const cart = await core.getActiveCart(message.from, 'WHATSAPP');
  if (!cart) {
    return sendMenuList(message, session, core);
  }

  const specialRequest = isAction(message, 'special:skip', 'skip') ? undefined : message.text;
  const updatedCart = await core.saveSpecialRequest(cart, specialRequest);
  const customer = await core.getOrCreateCustomer(message.from, session.firstName);
  if (customer.savedAddress?.text && customer.savedAddress.deliveryArea === 'TOWNSHIP') {
    const body = `Deliver to this address?\n${customer.savedAddress.text}\nDelivery: Free inside township`;
    await sendReplyButtonsMessage(message.from, body, [
      { id: 'address:use_saved', title: 'Use This' },
      { id: 'address:change', title: 'Change' },
    ]);
    return { body, session: { ...session, state: 'ADDRESS_CONFIRMATION' } };
  }

  const body = `Please share your delivery address.\nFor faster delivery, include tower/building, flat number, and society/landmark.`;
  await sendTextMessage(message.from, body);
  return { body, session: { ...session, state: 'WAITING_FOR_ADDRESS' } };
};

const sendPaymentSelection = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  cart: Cart,
): Promise<{ body: string; session: ConversationSession }> => {
  const body = `Order summary:\n${formatCartLines(cart)}\nSubtotal: Rs ${cart.totalAmount}\nDelivery: Free inside township\nPayment: Cash on Delivery\nEstimated delivery: around 60 mins\n\nPlace this order?`;
  await sendReplyButtonsMessage(message.from, body, [
    { id: 'place_order', title: 'Place Order' },
    { id: 'add_more', title: 'Add More' },
    { id: 'cancel_order', title: 'Cancel' },
  ]);
  return { body, session: { ...session, state: 'PAYMENT_SELECTION' } };
};

const handleAddress = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  core: OrderingCore,
): Promise<{ body: string; session: ConversationSession }> => {
  const cart = await core.getActiveCart(message.from, 'WHATSAPP');
  if (!cart) {
    return sendMenuList(message, session, core);
  }

  if (isAction(message, 'address:change', 'change')) {
    const body = 'Please share your delivery address.';
    await sendTextMessage(message.from, body);
    return { body, session: { ...session, state: 'WAITING_FOR_ADDRESS' } };
  }

  const customer = await core.getOrCreateCustomer(message.from, session.firstName);
  const updatedCart = isAction(message, 'address:use_saved', 'use this') && customer.savedAddress?.text
    ? await core.saveDeliveryAddress(cart, customer.savedAddress.text)
    : await core.saveDeliveryAddress(cart, message.text);

  const deliveryAddress = updatedCart.deliveryAddress || cart.deliveryAddress;
  if (!deliveryAddress?.text || deliveryAddress.deliveryArea !== 'TOWNSHIP') {
    await core.recordCartEvent(updatedCart, 'HANDOFF_REQUIRED', {
      reason: 'OUTSIDE_TOWNSHIP_DELIVERY',
      address: deliveryAddress?.text || message.text,
    });
    const body = `Sorry, we currently accept WhatsApp orders only for township delivery. I've shared this with our kitchen team in case they can help manually.`;
    await sendTextMessage(message.from, body);
    return { body, session: { ...session, state: 'HANDOFF_REQUIRED' } };
  }

  return sendPaymentSelection(message, session, updatedCart);
};

const placeCodOrder = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  core: OrderingCore,
): Promise<{ body: string; session: ConversationSession }> => {
  const cart = await core.getActiveCart(message.from, 'WHATSAPP');
  if (!cart) {
    return sendMenuList(message, session, core);
  }

  try {
    const customer = await core.getOrCreateCustomer(message.from, session.firstName);
    const payload = core.buildCodOrderPayload(cart, customer.firstName || session.firstName || 'Customer');
    const order = await invokeCreateOrder(message, {
      orderId: '',
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      deliveryAddress: payload.deliveryAddress,
      items: cart.items,
      totalAmount: cart.totalAmount,
      instructions: payload.instructions,
      paymentMethod: 'COD',
      createdAt: new Date().toISOString(),
    });
    await core.convertCart(cart, order.orderId);
    const body = `Your order has been placed.\nOrder ID: ${order.orderId}\nPayment mode: Cash on Delivery\nEstimated delivery: around 60 mins.\nOur kitchen will confirm it shortly.`;
    await sendTextMessage(message.from, body);
    return { body, session: { ...session, state: 'IDLE', pendingItemId: undefined } };
  } catch (error) {
    console.error('Unable to place WhatsApp COD order', error);
    const body = `I couldn't place this order right now. I've shared this with our kitchen team. Someone will check and respond shortly.`;
    await core.recordCartEvent(cart, 'HANDOFF_REQUIRED', {
      reason: 'ORDER_CREATION_FAILED',
    });
    await sendTextMessage(message.from, body);
    return { body, session: { ...session, state: 'HANDOFF_REQUIRED' } };
  }
};

const handleRepeatOrder = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  core: OrderingCore,
  orders: OrderRecord[],
): Promise<{ body: string; session: ConversationSession }> => {
  const latestOrder = orders[0];
  if (!latestOrder) {
    return sendMenuList(message, session, core);
  }

  const menu = await core.getAvailableMenu();
  let cart = await core.getOrCreateCart(message.from, 'WHATSAPP', session.firstName);
  for (const orderItem of latestOrder.items) {
    const menuItem = menu.find((item) => item.itemId === orderItem.itemId);
    if (menuItem) {
      cart = await core.addItemToCart(cart, menuItem, orderItem.quantity);
    }
  }

  if (latestOrder.instructions) {
    cart = await core.saveSpecialRequest(cart, latestOrder.instructions);
  }
  if (latestOrder.deliveryAddress) {
    cart = await core.saveDeliveryAddress(cart, latestOrder.deliveryAddress);
  }

  return sendPaymentSelection(message, session, cart);
};

const sendAiResponse = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  orders: OrderRecord[],
  customerType: 'NEW' | 'RETURNING',
): Promise<void> => {
  const preferenceSummary = summarizePreferences(orders);
  const assistantResponse = await runCustomerAssistant(
    message,
    session,
    preferenceSummary,
    customerType,
  );

  if (!assistantResponse) {
    const core = getOrderingCore();
    const cart = await core.getActiveCart(message.from, 'WHATSAPP');
    if (cart) {
      await core.recordCartEvent(cart, 'HANDOFF_REQUIRED', {
        reason: 'AI_EMPTY_RESPONSE',
        message: getActionText(message),
      });
    }
    const body = `I've shared this with our kitchen team. Someone will check and respond shortly.`;
    await sendTextMessage(message.from, body);
    await saveConversation(appendConversation(
      { ...session, state: 'HANDOFF_REQUIRED' },
      getActionText(message),
      body,
    ));
    return;
  }

  await sendTextMessage(message.from, assistantResponse);
  await saveConversation(appendConversation(
    session,
    getActionText(message),
    assistantResponse,
  ));
};

const handleCustomer = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  orders: OrderRecord[],
): Promise<void> => {
  const customerType: 'NEW' | 'RETURNING' = orders.length ? 'RETURNING' : 'NEW';
  const core = getOrderingCore();
  const kitchenOpen = await core.isKitchenOpen();
  const actionValue = getActionValue(message);

  if (isAction(message, 'view_menu_link', 'menu', 'view menu')) {
    const result = await sendMenuList(message, session, core);
    await saveConversation(appendConversation(
      result.session,
      getActionText(message),
      result.body,
    ));
    return;
  }

  if (!kitchenOpen && !isAction(message, 'ask_question')) {
    const result = await sendStartMessage(message, session, customerType === 'RETURNING', false);
    await saveConversation(appendConversation(
      result.session,
      getActionText(message),
      result.body,
    ));
    return;
  }

  if (isAction(message, 'order_now', 'add_more')) {
    const result = await sendMenuList(message, session, core);
    await saveConversation(appendConversation(
      result.session,
      getActionText(message),
      result.body,
    ));
    return;
  }

  if (isAction(message, 'repeat_order')) {
    const result = await handleRepeatOrder(message, session, core, orders);
    await saveConversation(appendConversation(
      result.session,
      getActionText(message),
      result.body,
    ));
    return;
  }

  if (actionValue.startsWith('menu:item:')) {
    const itemId = actionValue.slice('menu:item:'.length);
    const menuItem = (await core.getAvailableMenu()).find((item) => item.itemId === itemId);
    if (menuItem) {
      const result = await sendQuantityPrompt(message, session, menuItem);
      await saveConversation(appendConversation(
        result.session,
        getActionText(message),
        result.body,
      ));
      return;
    }
  }

  if (session.state === 'WAITING_FOR_QUANTITY' || actionValue.startsWith('qty:')) {
    const result = await handleQuantity(message, session, core);
    await saveConversation(appendConversation(
      result.session,
      getActionText(message),
      result.body,
    ));
    return;
  }

  if (isAction(message, 'view_cart')) {
    const cart = await core.getActiveCart(message.from, 'WHATSAPP');
    const result = cart
      ? await sendCartActions(message, session, cart)
      : await sendMenuList(message, session, core);
    await saveConversation(appendConversation(
      result.session,
      getActionText(message),
      result.body,
    ));
    return;
  }

  if (isAction(message, 'checkout')) {
    const result = await handleCheckout(message, session, core);
    await saveConversation(appendConversation(
      result.session,
      getActionText(message),
      result.body,
    ));
    return;
  }

  if (session.state === 'SPECIAL_REQUEST' || actionValue.startsWith('special:')) {
    const result = await handleSpecialRequest(message, session, core);
    await saveConversation(appendConversation(
      result.session,
      getActionText(message),
      result.body,
    ));
    return;
  }

  if (session.state === 'ADDRESS_CONFIRMATION' || session.state === 'WAITING_FOR_ADDRESS' || actionValue.startsWith('address:')) {
    const result = await handleAddress(message, session, core);
    await saveConversation(appendConversation(
      result.session,
      getActionText(message),
      result.body,
    ));
    return;
  }

  if (isAction(message, 'place_order')) {
    const result = await placeCodOrder(message, session, core);
    await saveConversation(appendConversation(
      result.session,
      getActionText(message),
      result.body,
    ));
    return;
  }

  if (isAction(message, 'cancel_order', 'cancel')) {
    const cart = await core.getActiveCart(message.from, 'WHATSAPP');
    if (cart) {
      await core.cancelCart(cart);
    }
    const body = 'No problem, your cart has been cancelled.';
    await sendTextMessage(message.from, body);
    await saveConversation(appendConversation(
      { ...session, state: 'IDLE', pendingItemId: undefined },
      getActionText(message),
      body,
    ));
    return;
  }

  if (session.messages.length === 0 || isAction(message, 'hi', 'hello', 'start')) {
    const result = await sendStartMessage(message, session, customerType === 'RETURNING', kitchenOpen);
    await saveConversation(appendConversation(
      result.session,
      getActionText(message),
      result.body,
    ));
    return;
  }

  await sendAiResponse(message, session, orders, customerType);
};

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const message = JSON.parse(record.body) as WhatsAppInboundMessage;
    const orders = await queryRecentOrders(message.from);
    const session = await loadConversation(message);

    await handleCustomer(message, session, orders);
  }
};
