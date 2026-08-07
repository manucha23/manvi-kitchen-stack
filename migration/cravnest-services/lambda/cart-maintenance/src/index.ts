import { OrderingCore } from '@manvi-kitchen/ordering-core';

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const createOrderingCore = (): OrderingCore => new OrderingCore({
  customerTableName: getRequiredEnv('CUSTOMER_PROFILE_TABLE'),
  cartTableName: getRequiredEnv('CART_TABLE'),
  cartEventTableName: getRequiredEnv('CART_EVENT_TABLE'),
  itemTableName: getRequiredEnv('ITEM_TABLE'),
  orderLimitsConfigTableName: getRequiredEnv('ORDER_LIMITS_CONFIG_TABLE'),
});

export const handler = async (): Promise<{ abandonedCount: number }> => {
  const result = await createOrderingCore().markAbandonedCarts();
  console.log('Completed cart maintenance', JSON.stringify(result));
  return result;
};
