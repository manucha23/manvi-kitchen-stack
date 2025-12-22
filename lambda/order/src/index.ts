import * as AWS from 'aws-sdk';

const ddb = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.ORDER_TABLE as string;

const json = (statusCode: number, body: any) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const nowIso = () => new Date().toISOString();
const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// helper: return latest version item for an orderId (or null)
const getLatestItem = async (orderId: string) => {
  const resp = await ddb
    .query({
      TableName: TABLE,
      KeyConditionExpression: 'orderId = :id',
      ExpressionAttributeValues: { ':id': orderId },
      Limit: 1,
      ScanIndexForward: false, // highest version first
    })
    .promise();
  return (resp.Items && resp.Items[0]) || null;
};

// helper: return all versions for an orderId
const getAllVersions = async (orderId: string) => {
  const resp = await ddb
    .query({
      TableName: TABLE,
      KeyConditionExpression: 'orderId = :id',
      ExpressionAttributeValues: { ':id': orderId },
      ScanIndexForward: false,
    })
    .promise();
  return resp.Items || [];
};

export const handler = async (event: any) => {
  try {
    const method = event.httpMethod;
    const orderId = event.pathParameters && event.pathParameters['orderId'];
    const q = event.queryStringParameters || {};

    if (method === 'POST' && event.resource === '/orders') {
      const payload = event.body ? JSON.parse(event.body) : {};
      const id = makeId();
      const item = {
        ...payload,
        orderId: id,
        version: 1,
        status: 'CREATED',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      } as any;
      await ddb.put({ TableName: TABLE, Item: item }).promise();
      return json(201, item);
    }

    if (method === 'GET' && event.resource === '/orders/{orderId}' && orderId) {
      // support ?trace=true to return full version history
      if (q.trace === 'true' || q.trace === '1') {
        const items = await getAllVersions(orderId);
        if (!items || items.length === 0) return json(404, { message: 'Order not found' });
        return json(200, { items });
      }
      const latest = await getLatestItem(orderId);
      if (!latest) return json(404, { message: 'Order not found' });
      return json(200, latest);
    }

    if (method === 'GET' && event.resource === '/orders') {
      const q = event.queryStringParameters || {};
      const expr: string[] = [];
      const values: { [k: string]: any } = {};
      const names: { [k: string]: string } = {};

      if (q.search) {
        expr.push('(contains(#customerName, :search) OR contains(#orderId, :search))');
        values[':search'] = q.search;
        names['#customerName'] = 'customerName';
        names['#orderId'] = 'orderId';
      }

      if (q.from && q.to) {
        expr.push('#createdAt BETWEEN :from AND :to');
        values[':from'] = q.from;
        values[':to'] = q.to;
        names['#createdAt'] = 'createdAt';
      } else if (q.from) {
        expr.push('#createdAt >= :from');
        values[':from'] = q.from;
        names['#createdAt'] = 'createdAt';
      } else if (q.to) {
        expr.push('#createdAt <= :to');
        values[':to'] = q.to;
        names['#createdAt'] = 'createdAt';
      }

      const params: AWS.DynamoDB.DocumentClient.ScanInput = { TableName: TABLE };
      if (expr.length) {
        params.FilterExpression = expr.join(' AND ');
        params.ExpressionAttributeValues = values;
        params.ExpressionAttributeNames = names;
      }

      // scan returns all versions; reduce to latest per orderId
      const out = await ddb.scan(params).promise();
      const items = out.Items || [];
      const latestMap: Record<string, any> = {};
      for (const it of items) {
        const id = it.orderId;
        const v = typeof it.version === 'number' ? it.version : Number(it.version || 0);
        if (!latestMap[id] || (latestMap[id].version || 0) < v) {
          latestMap[id] = it;
        }
      }
      return json(200, { items: Object.values(latestMap) });
    }

    if ((method === 'PUT' || method === 'PATCH') && event.resource === '/orders/{orderId}' && orderId) {
      const body = event.body ? JSON.parse(event.body) : {};
      const updates = Object.keys(body || {});
      if (!updates.length) return json(400, { message: 'No fields to update' });

      const latest = await getLatestItem(orderId);
      if (!latest) return json(404, { message: 'Order not found' });
      const latestVersion = typeof latest.version === 'number' ? latest.version : Number(latest.version || 0);
      const newVersion = latestVersion + 1;
      const newItem = { ...latest, ...body, version: newVersion, updatedAt: nowIso() };
      if (!newItem.createdAt && latest.createdAt) newItem.createdAt = latest.createdAt;
      await ddb.put({ TableName: TABLE, Item: newItem }).promise();
      return json(200, newItem);
    }

    if (method === 'DELETE' && event.resource === '/orders/{orderId}' && orderId) {
      const latest = await getLatestItem(orderId);
      if (!latest) return json(404, { message: 'Order not found' });
      const latestVersion = typeof latest.version === 'number' ? latest.version : Number(latest.version || 0);
      const newVersion = latestVersion + 1;
      const newItem = { ...latest, version: newVersion, status: 'CANCELLED', updatedAt: nowIso() };
      await ddb.put({ TableName: TABLE, Item: newItem }).promise();
      return json(200, newItem);
    }

    return json(400, { message: 'Unsupported route' });
  } catch (err: any) {
    console.error(err);
    return json(500, { message: err.message || 'Internal Error' });
  }
};
