import { ddb, TABLE, json, nowIso, makeId } from './helpers';

export const handler = async (event: any) => {
  try {
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
  } catch (err: any) {
    console.error(err);
    return json(500, { message: err.message || 'Internal Error' });
  }
};
