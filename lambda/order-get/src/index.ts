import { ddb, TABLE, json, getLatestItem, getAllVersions } from './helpers';

export const handler = async (event: any) => {
  try {
    const orderId = event.pathParameters && event.pathParameters['orderId'];
    if (!orderId) return json(400, { message: 'Missing orderId' });
    const q = event.queryStringParameters || {};

    if (q.trace === 'true' || q.trace === '1') {
      const items = await getAllVersions(orderId);
      if (!items || items.length === 0) return json(404, { message: 'Order not found' });
      return json(200, { items });
    }
    const latest = await getLatestItem(orderId);
    if (!latest) return json(404, { message: 'Order not found' });
    return json(200, latest);
  } catch (err: any) {
    console.error(err);
    return json(500, { message: err.message || 'Internal Error' });
  }
};
