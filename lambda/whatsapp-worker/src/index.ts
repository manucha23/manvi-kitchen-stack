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

type WhatsAppInboundMessageKind = 'text' | 'button';
type WhatsAppButtonId =
  | 'show_suggestions'
  | 'review_previous_order'
  | 'try_best_seller'
  | 'confirm_order'
  | 'change_items'
  | 'view_menu';

interface WhatsAppInboundMessage {
  kind?: WhatsAppInboundMessageKind;
  messageId: string;
  from: string;
  firstName: string;
  text: string;
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
  messages: ConversationMessage[];
  pendingOrderDraft?: PendingOrderDraft;
  createdAt: string;
  updatedAt: string;
  expiresAt: number;
}

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

interface WhatsAppButton {
  id: WhatsAppButtonId;
  title: string;
}

interface WhatsAppAiResponse {
  body: string;
  buttons: WhatsAppButton[];
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
const BUTTON_TITLES: Record<WhatsAppButtonId, string> = {
  show_suggestions: 'Suggestions',
  review_previous_order: 'Previous order',
  try_best_seller: 'Try best seller',
  confirm_order: 'Confirm order',
  change_items: 'Change items',
  view_menu: 'View menu',
};

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

const normalizeFirstName = (firstName?: string): string => {
  const trimmed = (firstName || '').trim();
  return trimmed || 'there';
};

export const calculateExpiresAt = (date = new Date()): number =>
  Math.floor(date.getTime() / 1000) + SESSION_TTL_SECONDS;

const isMenuExitIntent = (message: WhatsAppInboundMessage): boolean => {
  const value = (message.buttonId || message.text || '').trim().toLowerCase();
  return ['view_menu', 'change_items', 'menu', 'view menu', 'change items', 'stop', 'exit', 'cancel'].includes(value);
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

Return ONLY valid JSON in this shape:
{
  "body": "short WhatsApp message",
  "buttons": [
    { "id": "show_suggestions", "title": "Suggestions" },
    { "id": "try_best_seller", "title": "Try best seller" },
    { "id": "view_menu", "title": "View menu" }
  ]
}

Style:
- Be warm, helpful, and conversational, like a friendly neighbourhood kitchen.
- Match the customer's language: Hindi, English, or Hinglish.
- Use light food emojis occasionally, but keep replies short for WhatsApp.

Rules:
- Keep the body under 450 characters.
- Use at most 3 buttons.
- Allowed button ids: show_suggestions, review_previous_order, try_best_seller, confirm_order, change_items, view_menu.
- Prefer buttons over asking the user to type.
- Make it clear the buttons are quick options and the customer can type any question too.
- On the first reply to a customer, clearly but subtly say you are Manvi's Kitchen's AI assistant.
- If recent conversation already exists, do not repeat the AI disclaimer every time.
- Never promise items that are not on today's menu.
- Never make up prices. Use the menu data before listing items or prices.
- Never say an order is confirmed unless the worker has already reviewed details and confirmed it.
- Payment options are UPI link and COD.
- Delivery promise is within 1 hour after order confirmation.
- Use the customer's first name when it is available and not "there".
- If the customer sounds uncertain, explain they can type their question or use View menu.

Customer flow:
- For NEW customers, welcome them and offer today's menu, the static best seller "${getBestSellerName()}", or free-form help.
- For RETURNING customers with fewer than ${RECOMMENDATION_MIN_ORDER_COUNT} orders, do not make preference claims. Offer previous order, menu, or free-form help.
- For RETURNING customers with at least ${RECOMMENDATION_MIN_ORDER_COUNT} orders, you may suggest favorites from the preference summary.
- If the customer asks to customize or add items, use change_items so the worker can send the menu link unless it is a simple quantity change.

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
${message.buttonTitle || message.text}

Current India time:
${getIstTimestamp()}
`.trim();

const fallbackButtonsForCustomer = (customerType: 'NEW' | 'RETURNING', preferenceSummary: PreferenceSummary): WhatsAppButton[] => {
  if (customerType === 'NEW') {
    return [
      { id: 'try_best_seller', title: BUTTON_TITLES.try_best_seller },
      { id: 'view_menu', title: BUTTON_TITLES.view_menu },
    ];
  }

  if (preferenceSummary.recommendationEligible) {
    return [
      { id: 'show_suggestions', title: BUTTON_TITLES.show_suggestions },
      { id: 'review_previous_order', title: BUTTON_TITLES.review_previous_order },
      { id: 'view_menu', title: BUTTON_TITLES.view_menu },
    ];
  }

  return [
    { id: 'review_previous_order', title: BUTTON_TITLES.review_previous_order },
    { id: 'change_items', title: BUTTON_TITLES.change_items },
    { id: 'view_menu', title: BUTTON_TITLES.view_menu },
  ];
};

const getAllowedAiButtonIds = (
  customerType: 'NEW' | 'RETURNING',
  preferenceSummary: PreferenceSummary,
): WhatsAppButtonId[] => {
  if (customerType === 'NEW') {
    return ['try_best_seller', 'view_menu', 'change_items'];
  }

  return preferenceSummary.recommendationEligible
    ? ['show_suggestions', 'review_previous_order', 'change_items', 'view_menu']
    : ['review_previous_order', 'change_items', 'view_menu'];
};

const sanitizeAiButtons = (
  buttons: unknown,
  customerType: 'NEW' | 'RETURNING',
  preferenceSummary: PreferenceSummary,
): WhatsAppButton[] => {
  if (!Array.isArray(buttons)) {
    return fallbackButtonsForCustomer(customerType, preferenceSummary);
  }

  const allowedButtonIds = getAllowedAiButtonIds(customerType, preferenceSummary);
  const sanitized: WhatsAppButton[] = [];
  for (const button of buttons) {
    if (typeof button !== 'object' || button === null) {
      continue;
    }
    const id = String((button as { id?: unknown }).id);
    if (!allowedButtonIds.includes(id as WhatsAppButtonId)) {
      continue;
    }
    sanitized.push({
      id: id as WhatsAppButtonId,
      title: BUTTON_TITLES[id as WhatsAppButtonId],
    });
  }

  return sanitized.length ? sanitized.slice(0, 3) : fallbackButtonsForCustomer(customerType, preferenceSummary);
};

const parseAiResponse = (
  text: string,
  preferenceSummary: PreferenceSummary,
  customerType: 'NEW' | 'RETURNING',
): WhatsAppAiResponse => {
  try {
    const parsed = JSON.parse(text) as { body?: unknown; buttons?: unknown };
    const body = typeof parsed.body === 'string' && parsed.body.trim()
      ? parsed.body.trim()
      : buildFallbackBody(preferenceSummary, customerType);
    return {
      body,
      buttons: sanitizeAiButtons(parsed.buttons, customerType, preferenceSummary),
    };
  } catch {
    return {
      body: buildFallbackBody(preferenceSummary, customerType),
      buttons: fallbackButtonsForCustomer(customerType, preferenceSummary),
    };
  }
};

const buildFallbackBody = (preferenceSummary: PreferenceSummary, customerType: 'NEW' | 'RETURNING'): string => {
  if (customerType === 'NEW') {
    return `Hi, I am Manvi's Kitchen's AI assistant. ${getBestSellerName()} is a popular pick today. Would you like to try it, view the menu, or ask me anything?`;
  }

  const favorite = preferenceSummary.favoriteItems.find((item) => item.timesOrdered >= 2)?.name;
  const repeatText = preferenceSummary.repeatCandidate?.itemsText;
  const name = preferenceSummary.repeatCandidate ? 'Welcome back' : 'Hi';
  if (preferenceSummary.recommendationEligible && favorite && repeatText) {
    return `${name}. I see you often enjoy ${favorite}. Want to review a similar order (${repeatText}), change items, or view today's menu?`;
  }
  if (repeatText) {
    return `${name}. Last time you ordered ${repeatText}. Want to review it, change items, or view today's menu?`;
  }
  return `${name}. Would you like to review a similar order, change items, or view today's menu?`;
};

const runCustomerAssistant = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  preferenceSummary: PreferenceSummary,
  customerType: 'NEW' | 'RETURNING',
): Promise<WhatsAppAiResponse> => {
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

  return parseAiResponse(text || '', preferenceSummary, customerType);
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

const sendButtonMessage = async (to: string, body: string, buttons: WhatsAppButton[]): Promise<void> => {
  const uniqueButtons = Array.from(new Map(buttons.map((button) => [button.id, button])).values()).slice(0, 3);
  if (!uniqueButtons.length) {
    await sendTextMessage(to, body);
    return;
  }

  await sendWhatsAppPayload(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: uniqueButtons.map((button) => ({
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

const sendMenuLink = async (to: string, firstName: string): Promise<void> => {
  await sendTextMessage(
    to,
    `Sure ${normalizeFirstName(firstName)}, you can view today's menu and place an order here: ${getMenuUrl()}`,
  );
};

const calculateDraftTotal = (items: OrderItem[]): number =>
  items.reduce((total, item) => total + item.price * item.quantity, 0);

const buildDraftFromOrder = (order: OrderRecord, source: PendingOrderDraft['source']): PendingOrderDraft => ({
  customerType: 'RETURNING',
  source,
  sourceOrderId: order.orderId,
  items: order.items.map((item) => ({ ...item })),
  totalAmount: order.totalAmount,
  customerName: order.customerName,
  customerPhone: order.customerPhone,
  deliveryAddress: order.deliveryAddress,
  paymentMethod: 'COD',
  instructions: order.instructions,
  lastReviewTimestamp: new Date().toISOString(),
});

const buildDraftFromBestSeller = (message: WhatsAppInboundMessage, menu: MenuItem[]): PendingOrderDraft | undefined => {
  const bestSeller = menu.find((item) => item.name.toLowerCase() === getBestSellerName().toLowerCase());
  if (!bestSeller || typeof bestSeller.price !== 'number') {
    return undefined;
  }

  const items = [{
    itemId: bestSeller.itemId,
    name: bestSeller.name,
    price: bestSeller.price,
    quantity: 1,
    amount: bestSeller.price,
  }];

  return {
    customerType: 'NEW',
    source: 'BEST_SELLER',
    items,
    totalAmount: calculateDraftTotal(items),
    customerName: normalizeFirstName(message.firstName) === 'there' ? undefined : normalizeFirstName(message.firstName),
    customerPhone: message.from,
    paymentMethod: 'COD',
    lastReviewTimestamp: new Date().toISOString(),
  };
};

const buildDraftFromFavorite = (
  orders: OrderRecord[],
  preferenceSummary: PreferenceSummary,
): PendingOrderDraft | undefined => {
  if (!preferenceSummary.recommendationEligible) {
    return undefined;
  }

  const favorite = preferenceSummary.favoriteItems[0];
  const latestOrder = orders[0];
  if (!favorite || !latestOrder) {
    return undefined;
  }

  const matchingItem = orders
    .flatMap((order) => order.items || [])
    .find((item) => item.itemId === favorite.itemId);
  if (!matchingItem) {
    return undefined;
  }

  const quantity = Math.max(1, favorite.usualQuantity);
  const items = [{
    ...matchingItem,
    quantity,
    amount: matchingItem.price * quantity,
  }];

  return {
    customerType: 'RETURNING',
    source: 'AI_DRAFT',
    items,
    totalAmount: calculateDraftTotal(items),
    customerName: latestOrder.customerName,
    customerPhone: latestOrder.customerPhone,
    deliveryAddress: latestOrder.deliveryAddress,
    paymentMethod: 'COD',
    instructions: latestOrder.instructions,
    lastReviewTimestamp: new Date().toISOString(),
  };
};

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

const applySimpleQuantityChange = (
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
    await sendButtonMessage(message.from, body, [
      { id: 'view_menu', title: BUTTON_TITLES.view_menu },
    ]);
    return {
      body,
      session: {
        ...session,
        pendingOrderDraft: draft,
      },
    };
  }

  const body = buildOrderReviewMessage(draft);
  await sendButtonMessage(message.from, body, [
    { id: 'confirm_order', title: BUTTON_TITLES.confirm_order },
    { id: 'change_items', title: BUTTON_TITLES.change_items },
    { id: 'view_menu', title: BUTTON_TITLES.view_menu },
  ]);

  return {
    body,
    session: {
      ...session,
      pendingOrderDraft: draft,
    },
  };
};

const sendPreviousOrderReview = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  orders: OrderRecord[],
): Promise<{ body: string; session: ConversationSession }> => {
  const latestOrder = orders[0];
  if (!latestOrder) {
    await sendMenuLink(message.from, message.firstName);
    return {
      body: 'No previous order found; sent menu link.',
      session: { ...session, pendingOrderDraft: undefined },
    };
  }

  return sendOrderReview(message, session, buildDraftFromOrder(latestOrder, 'PREVIOUS_ORDER'));
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
    await sendButtonMessage(message.from, body, [
      { id: 'view_menu', title: BUTTON_TITLES.view_menu },
    ]);
    return {
      body,
      session: { ...session, pendingOrderDraft: undefined },
    };
  } catch (error) {
    console.error('Unable to create similar WhatsApp order', error);
    const body = `I couldn't place this order because some details may have changed. Please view today's menu and place a fresh order.`;
    await sendButtonMessage(message.from, body, [
      { id: 'view_menu', title: BUTTON_TITLES.view_menu },
    ]);
    return {
      body,
      session: { ...session, pendingOrderDraft: undefined },
    };
  }
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

  await sendButtonMessage(message.from, assistantResponse.body, assistantResponse.buttons);
  await saveConversation(appendConversation(
    session,
    message.buttonTitle || message.text,
    `${assistantResponse.body} [${assistantResponse.buttons.map((button) => button.title).join(', ')}]`,
  ));
};

const handleCustomer = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  orders: OrderRecord[],
): Promise<void> => {
  const customerType: 'NEW' | 'RETURNING' = orders.length ? 'RETURNING' : 'NEW';

  if (isMenuExitIntent(message)) {
    await sendMenuLink(message.from, session.firstName);
    await saveConversation(appendConversation(
      { ...session, pendingOrderDraft: undefined },
      message.buttonTitle || message.text,
      `Sent menu link: ${getMenuUrl()}`,
    ));
    return;
  }

  const detailsDraft = applyCustomerDetails(session.pendingOrderDraft, message);
  if (detailsDraft) {
    const result = await sendOrderReview(message, session, detailsDraft);
    await saveConversation(appendConversation(
      result.session,
      message.buttonTitle || message.text,
      result.body,
    ));
    return;
  }

  const quantityDraft = applySimpleQuantityChange(session.pendingOrderDraft, message.text);
  if (quantityDraft) {
    const result = await sendOrderReview(message, session, quantityDraft);
    await saveConversation(appendConversation(
      result.session,
      message.buttonTitle || message.text,
      result.body,
    ));
    return;
  }

  if (message.buttonId === 'review_previous_order' || message.buttonId === 'review_similar_order') {
    const result = await sendPreviousOrderReview(message, session, orders);
    await saveConversation(appendConversation(
      result.session,
      message.buttonTitle || message.text,
      result.body,
    ));
    return;
  }

  if (message.buttonId === 'show_suggestions') {
    const preferenceSummary = summarizePreferences(orders);
    const draft = customerType === 'NEW'
      ? buildDraftFromBestSeller(message, await getMenu())
      : buildDraftFromFavorite(orders, preferenceSummary);

    if (draft) {
      const result = await sendOrderReview(message, session, draft);
      await saveConversation(appendConversation(
        result.session,
        message.buttonTitle || message.text,
        result.body,
      ));
      return;
    }

    if (customerType === 'NEW') {
      const body = `${getBestSellerName()} is not available right now. Please view today's menu and choose what you like.`;
      await sendButtonMessage(message.from, body, [
        { id: 'view_menu', title: BUTTON_TITLES.view_menu },
      ]);
      await saveConversation(appendConversation(
        { ...session, pendingOrderDraft: undefined },
        message.buttonTitle || message.text,
        body,
      ));
      return;
    }

    const result = await sendPreviousOrderReview(message, session, orders);
    await saveConversation(appendConversation(
      result.session,
      message.buttonTitle || message.text,
      result.body,
    ));
    return;
  }

  if (message.buttonId === 'try_best_seller') {
    const draft = buildDraftFromBestSeller(message, await getMenu());
    if (!draft) {
      const body = `${getBestSellerName()} is not available right now. Please view today's menu and choose what you like.`;
      await sendButtonMessage(message.from, body, [
        { id: 'view_menu', title: BUTTON_TITLES.view_menu },
      ]);
      await saveConversation(appendConversation(
        { ...session, pendingOrderDraft: undefined },
        message.buttonTitle || message.text,
        body,
      ));
      return;
    }

    const result = await sendOrderReview(message, session, draft);
    await saveConversation(appendConversation(
      result.session,
      message.buttonTitle || message.text,
      result.body,
    ));
    return;
  }

  if (isConfirmIntent(message)) {
    const result = await confirmPendingOrder(message, session);
    await saveConversation(appendConversation(
      result.session,
      message.buttonTitle || message.text,
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
