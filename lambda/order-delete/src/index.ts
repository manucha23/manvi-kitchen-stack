import { ddb, TABLE, json, nowIso, getLatestItem } from './helpers';

export const handler = async (event: any) => {
  try {
    const orderId = event.pathParameters && event.pathParameters['orderId'];
    if (!orderId) return json(400, { message: 'Missing orderId' });
    const latest = await getLatestItem(orderId);
    if (!latest) return json(404, { message: 'Order not found' });
    const latestVersion = typeof latest.version === 'number' ? latest.version : Number(latest.version || 0);
    const newVersion = latestVersion + 1;
    const newItem = { ...latest, version: newVersion, status: 'CANCELLED', updatedAt: nowIso() } as any;
    await ddb.put({ TableName: TABLE, Item: newItem }).promise();
    return json(200, newItem);
  } catch (err: any) {
    console.error(err);
    return json(500, { message: err.message || 'Internal Error' });
  }
};
