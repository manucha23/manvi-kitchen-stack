import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyResult, APIGatewayProxyWebsocketEventV2, SNSEvent } from 'aws-lambda';

interface OrderEvent {
  type: 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'ORDER_UPDATED';
  orderId: string;
  createdVia?: string;
  status?: string;
  oldStatus?: string;
  newStatus?: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount?: number;
  createdAt?: string;
  updatedAt?: string;
  newImage?: Record<string, any>;
}

interface ConnectionRecord {
  connectionId: string;
}

const CREATED_STATUS = 'CREATED';
const ADMIN_CREATED_VIA = 'ADMIN';
const CONNECTION_TTL_SECONDS = 24 * 60 * 60;

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const jsonResponse = (statusCode: number, body: Record<string, unknown> = {}): APIGatewayProxyResult => ({
  statusCode,
  body: JSON.stringify(body),
});

const getConnectionTable = (): string => {
  const tableName = process.env.CONNECTION_TABLE;
  if (!tableName) {
    throw new Error('CONNECTION_TABLE is required');
  }
  return tableName;
};

const getManagementClient = (): ApiGatewayManagementApiClient => {
  const endpoint = process.env.WEBSOCKET_MANAGEMENT_ENDPOINT;
  if (!endpoint) {
    throw new Error('WEBSOCKET_MANAGEMENT_ENDPOINT is required');
  }
  return new ApiGatewayManagementApiClient({ endpoint });
};

const decodeJwtPayload = (token?: string): Record<string, any> | undefined => {
  if (!token) {
    return undefined;
  }

  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return undefined;
    }
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
};

const handleConnect = async (event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId;
  if (!connectionId) {
    return jsonResponse(400, { message: 'Missing connection id' });
  }

  const token = (event as any).queryStringParameters?.token;
  const claims = decodeJwtPayload(token);
  const now = Math.floor(Date.now() / 1000);
  if (!claims?.sub && !claims?.username) {
    return jsonResponse(401, { message: 'Unauthorized' });
  }
  if (typeof claims.exp === 'number' && claims.exp <= now) {
    return jsonResponse(401, { message: 'Token expired' });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + CONNECTION_TTL_SECONDS;

  await docClient.send(new PutCommand({
    TableName: getConnectionTable(),
    Item: {
      connectionId,
      userId: claims.sub || claims.username || 'unknown-admin',
      connectedAt: new Date().toISOString(),
      ttl: expiresAt,
    },
  }));

  return jsonResponse(200, { message: 'Connected' });
};

const handleDisconnect = async (event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId;
  if (connectionId) {
    await deleteConnection(connectionId);
  }

  return jsonResponse(200, { message: 'Disconnected' });
};

const handleClientMessage = async (): Promise<APIGatewayProxyResult> =>
  jsonResponse(200, { message: 'Received' });

const deleteConnection = async (connectionId: string): Promise<void> => {
  await docClient.send(new DeleteCommand({
    TableName: getConnectionTable(),
    Key: { connectionId },
  }));
};

const listConnections = async (): Promise<ConnectionRecord[]> => {
  const result = await docClient.send(new ScanCommand({
    TableName: getConnectionTable(),
    ProjectionExpression: 'connectionId',
  }));

  return (result.Items || []) as ConnectionRecord[];
};

const postToConnection = async (
  client: ApiGatewayManagementApiClient,
  connectionId: string,
  payload: Record<string, unknown>,
): Promise<boolean> => {
  try {
    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(payload)),
    }));
    return true;
  } catch (error: any) {
    if (error?.name === 'GoneException' || error?.$metadata?.httpStatusCode === 410) {
      await deleteConnection(connectionId);
      console.log('Deleted stale WebSocket connection', JSON.stringify({ connectionId }));
      return false;
    }

    console.error('Failed to post WebSocket message', JSON.stringify({
      connectionId,
      errorName: error?.name,
      message: error?.message,
    }));
    return false;
  }
};

const broadcast = async (payload: Record<string, unknown>): Promise<number> => {
  const connections = await listConnections();
  if (!connections.length) {
    return 0;
  }

  const client = getManagementClient();
  const results = await Promise.all(connections.map((connection) =>
    postToConnection(client, connection.connectionId, payload)
  ));

  return results.filter(Boolean).length;
};

export const notifyAdminsOnWhatsApp = async (orderEvent: OrderEvent): Promise<void> => {
  console.log('WhatsApp fallback pending implementation', JSON.stringify({
    orderId: orderEvent.orderId,
    customerName: orderEvent.customerName,
    totalAmount: orderEvent.totalAmount,
  }));
};

const handleOrderCreated = async (orderEvent: OrderEvent): Promise<void> => {
  if (orderEvent.createdVia === ADMIN_CREATED_VIA || orderEvent.status !== CREATED_STATUS) {
    return;
  }

  const deliveries = await broadcast({
    type: 'NEW_ORDER_ALERT',
    orderId: orderEvent.orderId,
    createdVia: orderEvent.createdVia,
    customerName: orderEvent.customerName,
    customerPhone: orderEvent.customerPhone,
    totalAmount: orderEvent.totalAmount,
    createdAt: orderEvent.createdAt,
  });

  if (deliveries === 0) {
    await notifyAdminsOnWhatsApp(orderEvent);
  }
};

const handleOrderStatusChanged = async (orderEvent: OrderEvent): Promise<void> => {
  if (orderEvent.oldStatus !== CREATED_STATUS || orderEvent.newStatus === CREATED_STATUS) {
    return;
  }

  await broadcast({
    type: 'ORDER_ALERT_RESOLVED',
    orderId: orderEvent.orderId,
    createdVia: orderEvent.createdVia,
    oldStatus: orderEvent.oldStatus,
    newStatus: orderEvent.newStatus,
    updatedAt: orderEvent.updatedAt,
  });
};

const handleSnsEvent = async (event: SNSEvent): Promise<void> => {
  for (const record of event.Records) {
    const orderEvent = JSON.parse(record.Sns.Message) as OrderEvent;
    if (orderEvent.type === 'ORDER_CREATED') {
      await handleOrderCreated(orderEvent);
    } else if (orderEvent.type === 'ORDER_STATUS_CHANGED') {
      await handleOrderStatusChanged(orderEvent);
    }
  }
};

const isSnsEvent = (event: unknown): event is SNSEvent =>
  Boolean((event as SNSEvent)?.Records?.[0]?.Sns);

const isWebSocketEvent = (event: unknown): event is APIGatewayProxyWebsocketEventV2 =>
  Boolean((event as APIGatewayProxyWebsocketEventV2)?.requestContext?.routeKey);

export const handler = async (
  event: SNSEvent | APIGatewayProxyWebsocketEventV2,
): Promise<void | APIGatewayProxyResult> => {
  if (isSnsEvent(event)) {
    await handleSnsEvent(event);
    return;
  }

  if (isWebSocketEvent(event)) {
    const routeKey = event.requestContext.routeKey;
    if (routeKey === '$connect') {
      return handleConnect(event);
    }
    if (routeKey === '$disconnect') {
      return handleDisconnect(event);
    }
    return handleClientMessage();
  }

  console.warn('Unsupported notification event', JSON.stringify(event));
};
