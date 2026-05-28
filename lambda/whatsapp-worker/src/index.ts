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
type WhatsAppButtonId = 'review_similar_order' | 'confirm_similar_order' | 'change_items' | 'view_menu';

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
const BUTTON_TITLES: Record<WhatsAppButtonId, string> = {
  review_similar_order: 'Review order',
  confirm_similar_order: 'Confirm order',
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
    favoriteItems: Array.from(itemStats.values())
      .sort((a, b) => b.timesOrdered - a.timesOrdered || b.totalQuantity - a.totalQuantity)
      .slice(0, 3),
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

const buildReturningCustomerPrompt = (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  preferenceSummary: PreferenceSummary,
  menu: MenuItem[],
): string => `
You are Manvi's Kitchen's friendly WhatsApp kitchen assistant.

Return ONLY valid JSON in this shape:
{
  "body": "short WhatsApp message",
  "buttons": [
    { "id": "review_similar_order", "title": "Review order" },
    { "id": "change_items", "title": "Change items" },
    { "id": "view_menu", "title": "View menu" }
  ]
}

Rules:
- Keep the body under 450 characters.
- Use at most 3 buttons.
- Allowed button ids: review_similar_order, change_items, view_menu.
- Prefer buttons over asking the user to type.
- Always explicitly ask whether they want to review a similar order, change items, or view the menu.
- Make it clear the buttons are quick options and the customer can type any question too.
- Personalize from the last 5 orders, not only the latest order.
- Mention favorite items only if they appear in at least 2 analyzed orders.
- If only 1 order is analyzed, say "Last time you ordered..." instead of "you often enjoy...".
- Use the customer's first name when it is available and not "there".
- Do not say you are AI. If useful, use only a subtle note like "I can help quickly here."
- Delivery promise is within 1 hour after order confirmation.
- If the customer sounds uncertain, explain they can type their question or use View menu.

Customer:
${JSON.stringify({ firstName: session.firstName, whatsappId: session.phoneNumber })}

Preference summary from last ${preferenceSummary.orderCountAnalyzed} orders:
${JSON.stringify(preferenceSummary)}

Available menu preview:
${JSON.stringify(menu.slice(0, 12).map((item) => ({ name: item.name, price: item.price })))}

Recent conversation:
${JSON.stringify(session.messages.slice(-6))}

Customer message:
${message.buttonTitle || message.text}

Current India time:
${getIstTimestamp()}
`.trim();

const sanitizeAiButtons = (buttons: unknown): WhatsAppButton[] => {
  if (!Array.isArray(buttons)) {
    return [
      { id: 'review_similar_order', title: BUTTON_TITLES.review_similar_order },
      { id: 'change_items', title: BUTTON_TITLES.change_items },
      { id: 'view_menu', title: BUTTON_TITLES.view_menu },
    ];
  }

  const sanitized: WhatsAppButton[] = [];
  for (const button of buttons) {
    if (typeof button !== 'object' || button === null) {
      continue;
    }
    const id = (button as { id?: unknown }).id;
    if (!['review_similar_order', 'change_items', 'view_menu'].includes(String(id))) {
      continue;
    }
    sanitized.push({
      id: id as WhatsAppButtonId,
      title: BUTTON_TITLES[id as WhatsAppButtonId],
    });
  }

  return sanitized.slice(0, 3);
};

const parseAiResponse = (text: string, preferenceSummary: PreferenceSummary): WhatsAppAiResponse => {
  try {
    const parsed = JSON.parse(text) as { body?: unknown; buttons?: unknown };
    const body = typeof parsed.body === 'string' && parsed.body.trim()
      ? parsed.body.trim()
      : buildReturningFallbackBody(preferenceSummary);
    return {
      body,
      buttons: sanitizeAiButtons(parsed.buttons),
    };
  } catch {
    return {
      body: buildReturningFallbackBody(preferenceSummary),
      buttons: [
        { id: 'review_similar_order', title: BUTTON_TITLES.review_similar_order },
        { id: 'change_items', title: BUTTON_TITLES.change_items },
        { id: 'view_menu', title: BUTTON_TITLES.view_menu },
      ],
    };
  }
};

const buildReturningFallbackBody = (preferenceSummary: PreferenceSummary): string => {
  const favorite = preferenceSummary.favoriteItems.find((item) => item.timesOrdered >= 2)?.name;
  const repeatText = preferenceSummary.repeatCandidate?.itemsText;
  const name = preferenceSummary.repeatCandidate ? 'Welcome back' : 'Hi';
  if (favorite && repeatText) {
    return `${name}. I see you often enjoy ${favorite}. Want to review a similar order (${repeatText}), change items, or view today's menu?`;
  }
  if (repeatText) {
    return `${name}. Last time you ordered ${repeatText}. Want to review it, change items, or view today's menu?`;
  }
  return `${name}. Would you like to review a similar order, change items, or view today's menu?`;
};

const runReturningCustomerAssistant = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  preferenceSummary: PreferenceSummary,
): Promise<WhatsAppAiResponse> => {
  const menu = await getMenu();
  const messages: Message[] = [{
    role: 'user',
    content: [{ text: buildReturningCustomerPrompt(message, session, preferenceSummary, menu) }],
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

  return parseAiResponse(text || '', preferenceSummary);
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

const sendNewCustomerWelcome = async (message: WhatsAppInboundMessage): Promise<void> => {
  await sendTextMessage(
    message.from,
    `Hi ${normalizeFirstName(message.firstName)}, welcome to Manvi's Kitchen. You can explore today's menu and place your order here: ${getMenuUrl()}\n\nConfirmed orders are delivered within 1 hour.`,
  );
};

const sendMenuLink = async (to: string, firstName: string): Promise<void> => {
  await sendTextMessage(
    to,
    `Sure ${normalizeFirstName(firstName)}, you can view today's menu and place an order here: ${getMenuUrl()}`,
  );
};

export const buildOrderReviewMessage = (order: OrderRecord): string => {
  const instructions = order.instructions ? `\nInstructions: ${order.instructions}` : '';
  return `Please review your order:\n${formatOrderItems(order.items)}\nDelivery address: ${order.deliveryAddress}\nPhone: ${order.customerPhone}${instructions}\n\nPayment: COD\nDelivery: within 1 hour after confirmation.\n\nShould I confirm this order?`;
};

const sendOrderReview = async (message: WhatsAppInboundMessage, orders: OrderRecord[]): Promise<string> => {
  const latestOrder = orders[0];
  if (!latestOrder) {
    await sendMenuLink(message.from, message.firstName);
    return 'No previous order found; sent menu link.';
  }

  const body = buildOrderReviewMessage(latestOrder);
  await sendButtonMessage(message.from, body, [
    { id: 'confirm_similar_order', title: BUTTON_TITLES.confirm_similar_order },
    { id: 'change_items', title: BUTTON_TITLES.change_items },
    { id: 'view_menu', title: BUTTON_TITLES.view_menu },
  ]);
  return body;
};

const invokeCreateOrder = async (sourceMessage: WhatsAppInboundMessage, order: OrderRecord): Promise<OrderRecord> => {
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
      paymentMethod: 'COD',
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

const confirmSimilarOrder = async (message: WhatsAppInboundMessage, orders: OrderRecord[]): Promise<string> => {
  const latestOrder = orders[0];
  if (!latestOrder) {
    await sendMenuLink(message.from, message.firstName);
    return 'No previous order found; sent menu link.';
  }

  try {
    const newOrder = await invokeCreateOrder(message, latestOrder);
    const body = `Thanks, your COD order is confirmed. We'll deliver within 1 hour, by ${formatPromisedDelivery(newOrder.promisedDeliveryAt)}.`;
    await sendButtonMessage(message.from, body, [
      { id: 'view_menu', title: BUTTON_TITLES.view_menu },
    ]);
    return body;
  } catch (error) {
    console.error('Unable to create similar WhatsApp order', error);
    const body = `I couldn't place the same order because some details may have changed. Please view today's menu and place a fresh order.`;
    await sendButtonMessage(message.from, body, [
      { id: 'view_menu', title: BUTTON_TITLES.view_menu },
    ]);
    return body;
  }
};

const handleReturningCustomer = async (
  message: WhatsAppInboundMessage,
  session: ConversationSession,
  orders: OrderRecord[],
): Promise<void> => {
  if (isMenuExitIntent(message)) {
    await sendMenuLink(message.from, session.firstName);
    await saveConversation(appendConversation(
      session,
      message.buttonTitle || message.text,
      `Sent menu link: ${getMenuUrl()}`,
    ));
    return;
  }

  if (message.buttonId === 'review_similar_order') {
    const reviewBody = await sendOrderReview(message, orders);
    await saveConversation(appendConversation(
      session,
      message.buttonTitle || message.text,
      reviewBody,
    ));
    return;
  }

  if (message.buttonId === 'confirm_similar_order') {
    const confirmationBody = await confirmSimilarOrder(message, orders);
    await saveConversation(appendConversation(
      session,
      message.buttonTitle || message.text,
      confirmationBody,
    ));
    return;
  }

  const preferenceSummary = summarizePreferences(orders);
  const assistantResponse = await runReturningCustomerAssistant(
    message,
    session,
    preferenceSummary,
  );

  await sendButtonMessage(message.from, assistantResponse.body, assistantResponse.buttons);
  await saveConversation(appendConversation(
    session,
    message.buttonTitle || message.text,
    `${assistantResponse.body} [${assistantResponse.buttons.map((button) => button.title).join(', ')}]`,
  ));
};

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const message = JSON.parse(record.body) as WhatsAppInboundMessage;
    const orders = await queryRecentOrders(message.from);
    const session = await loadConversation(message);

    if (!orders.length) {
      await sendNewCustomerWelcome(message);
      await saveConversation(appendConversation(
        session,
        message.buttonTitle || message.text,
        `Sent new customer menu link: ${getMenuUrl()}`,
      ));
      continue;
    }

    await handleReturningCustomer(message, session, orders);
  }
};
