import { ddb, TABLE, json } from './helpers';

export const handler = async (event: any) => {
  try {
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

    const params: any = { TableName: TABLE };
    if (expr.length) {
      params.FilterExpression = expr.join(' AND ');
      params.ExpressionAttributeValues = values;
      params.ExpressionAttributeNames = names;
    }

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
  } catch (err: any) {
    console.error(err);
    return json(500, { message: err.message || 'Internal Error' });
  }
};
