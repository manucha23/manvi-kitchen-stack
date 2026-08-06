import { Order } from '../models';

export const INITIAL_ORDER_VERSION = 1;

export const withOrderVersion = (order: Order): Order => ({
  ...order,
  version: order.version || INITIAL_ORDER_VERSION,
});
