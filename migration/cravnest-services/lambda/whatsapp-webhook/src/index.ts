import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { SendMessageCommand, SendMessageCommandInput, SQSClient } from '@aws-sdk/client-sqs';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRequiredParameter } from './parameters';
import { extractInboundTextMessages, WhatsAppInboundTextMessage } from './whatsapp-payload';

const sqsClient = new SQSClient({});

const jsonResponse = (statusCode: number, body: Record<string, unknown>): APIGatewayProxyResult => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const textResponse = (statusCode: number, body: string): APIGatewayProxyResult => ({
  statusCode,
  headers: { 'Content-Type': 'text/plain' },
  body,
});

const getHeader = (event: APIGatewayProxyEvent, headerName: string): string | undefined => {
  const match = Object.entries(event.headers || {}).find(
    ([key]) => key.toLowerCase() === headerName.toLowerCase(),
  );
  return match?.[1] ?? undefined;
};

const getRawBodyBuffer = (event: APIGatewayProxyEvent): Buffer => {
  const body = event.body || '';
  return event.isBase64Encoded ? Buffer.from(body, 'base64') : Buffer.from(body, 'utf8');
};

const validateSignature = (event: APIGatewayProxyEvent, appSecret: string): boolean => {
  const signatureHeader = getHeader(event, 'x-hub-signature-256');
  if (!signatureHeader?.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature = createHmac('sha256', appSecret)
    .update(getRawBodyBuffer(event))
    .digest('hex');
  const providedSignature = signatureHeader.slice('sha256='.length);

  const expected = Buffer.from(expectedSignature, 'hex');
  const provided = Buffer.from(providedSignature, 'hex');

  return expected.length === provided.length && timingSafeEqual(expected, provided);
};

const hasSignatureHeader = (event: APIGatewayProxyEvent): boolean => {
  const signatureHeader = getHeader(event, 'x-hub-signature-256');
  return Boolean(signatureHeader?.startsWith('sha256='));
};

const sanitizeHeaders = (headers: APIGatewayProxyEvent['headers']): Record<string, string | undefined> => {
  const sensitiveHeaders = new Set([
    'authorization',
    'cookie',
    'x-hub-signature',
    'x-hub-signature-256',
  ]);

  const sanitizedHeaders: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    sanitizedHeaders[key] = sensitiveHeaders.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }

  return sanitizedHeaders;
};

const parseBodyForLogging = (event: APIGatewayProxyEvent): unknown => {
  const rawBody = getRawBodyBuffer(event).toString('utf8');
  if (!rawBody) {
    return undefined;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
};

const logStructuredPayload = (message: string, payload: Record<string, unknown>): void => {
  console.log(message, JSON.stringify(payload, null, 2));
};

const getEnvironment = (): string => process.env.ENVIRONMENT || 'test';

const getVerifyTokenParameterName = (): string =>
  process.env.WHATSAPP_VERIFY_TOKEN_PARAM || `/manvi-kitchen/${getEnvironment()}/whatsapp/verify-token`;

const getAppSecretParameterName = (): string =>
  process.env.WHATSAPP_APP_SECRET_PARAM || `/manvi-kitchen/${getEnvironment()}/whatsapp/app-secret`;

const getInboundQueueUrl = (): string => {
  const queueUrl = process.env.WHATSAPP_INBOUND_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('WHATSAPP_INBOUND_QUEUE_URL is required');
  }
  return queueUrl;
};

export const buildInboundMessageQueueInput = (
  message: WhatsAppInboundTextMessage,
  queueUrl: string,
): SendMessageCommandInput => ({
  QueueUrl: queueUrl,
  MessageBody: JSON.stringify(message),
  MessageGroupId: toSqsFifoId(message.from),
  MessageDeduplicationId: toSqsFifoId(message.messageId),
});

const toSqsFifoId = (value: string): string =>
  value.length <= 128 ? value : createHash('sha256').update(value).digest('hex');

const enqueueInboundMessage = async (message: WhatsAppInboundTextMessage): Promise<void> => {
  await sqsClient.send(new SendMessageCommand(buildInboundMessageQueueInput(
    message,
    getInboundQueueUrl(),
  )));
};

const handleVerification = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const mode = event.queryStringParameters?.['hub.mode'];
  const token = event.queryStringParameters?.['hub.verify_token'];
  const challenge = event.queryStringParameters?.['hub.challenge'];
  const expectedToken = await getRequiredParameter(getVerifyTokenParameterName());

  if (mode === 'subscribe' && token === expectedToken && challenge) {
    return textResponse(200, challenge);
  }

  console.warn('WhatsApp webhook verification failed', {
    mode,
    hasToken: Boolean(token),
    hasChallenge: Boolean(challenge),
  });
  return jsonResponse(403, { message: 'Forbidden' });
};

const handleWebhookPost = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!hasSignatureHeader(event)) {
    console.warn('Rejected WhatsApp webhook request with missing signature', {
      path: event.path,
      requestId: event.requestContext.requestId,
    });
    return jsonResponse(403, { message: 'Forbidden' });
  }

  const appSecret = await getRequiredParameter(getAppSecretParameterName());
  if (!validateSignature(event, appSecret)) {
    console.warn('Rejected WhatsApp webhook request with missing or invalid signature', {
      path: event.path,
      requestId: event.requestContext.requestId,
    });
    return jsonResponse(403, { message: 'Forbidden' });
  }

  logStructuredPayload('Received WhatsApp webhook request', {
    path: event.path,
    httpMethod: event.httpMethod,
    requestId: event.requestContext.requestId,
    headers: sanitizeHeaders(event.headers),
    queryStringParameters: event.queryStringParameters,
    body: parseBodyForLogging(event),
  });

  const inboundMessages = extractInboundTextMessages(parseBodyForLogging(event));
  for (const message of inboundMessages) {
    await enqueueInboundMessage(message);
  }

  console.log('Processed WhatsApp webhook text messages', JSON.stringify({
    requestId: event.requestContext.requestId,
    enqueuedMessages: inboundMessages.length,
  }));

  return jsonResponse(200, { status: 'received' });
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (event.httpMethod === 'GET' && event.path.endsWith('/webhooks/whatsapp')) {
      return handleVerification(event);
    }

    if (event.httpMethod === 'POST') {
      return handleWebhookPost(event);
    }

    return jsonResponse(405, { message: 'Method Not Allowed' });
  } catch (error) {
    console.error('Error handling WhatsApp webhook:', error);
    return jsonResponse(500, { message: 'Internal Server Error' });
  }
};
