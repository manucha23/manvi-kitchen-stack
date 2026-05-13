import { createHmac, timingSafeEqual } from 'crypto';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const ssmClient = new SSMClient({});
const parameterCache = new Map<string, string>();

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

const getEnvironment = (): string => process.env.ENVIRONMENT || 'test';

const getVerifyTokenParameterName = (): string =>
  process.env.WHATSAPP_VERIFY_TOKEN_PARAM || `/manvi-kitchen/${getEnvironment()}/whatsapp/verify-token`;

const getAppSecretParameterName = (): string =>
  process.env.WHATSAPP_APP_SECRET_PARAM || `/manvi-kitchen/${getEnvironment()}/whatsapp/app-secret`;

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

  console.log('Received WhatsApp webhook request', {
    path: event.path,
    httpMethod: event.httpMethod,
    requestId: event.requestContext.requestId,
    headers: sanitizeHeaders(event.headers),
    queryStringParameters: event.queryStringParameters,
    body: parseBodyForLogging(event),
  });

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
