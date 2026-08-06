const markAbandonedCartsMock = jest.fn();

jest.mock('@manvi-kitchen/ordering-core', () => ({
  OrderingCore: jest.fn().mockImplementation(() => ({
    markAbandonedCarts: markAbandonedCartsMock,
  })),
}));

import { handler } from '../index';

describe('cart maintenance handler', () => {
  beforeEach(() => {
    markAbandonedCartsMock.mockReset();
    process.env.CUSTOMER_PROFILE_TABLE = 'customers';
    process.env.CART_TABLE = 'carts';
    process.env.CART_EVENT_TABLE = 'cart-events';
    process.env.ITEM_TABLE = 'items';
    process.env.ORDER_LIMITS_CONFIG_TABLE = 'limits';
  });

  it('marks stale carts abandoned through ordering core', async () => {
    markAbandonedCartsMock.mockResolvedValueOnce({ abandonedCount: 2 });

    await expect(handler()).resolves.toEqual({ abandonedCount: 2 });
    expect(markAbandonedCartsMock).toHaveBeenCalledTimes(1);
  });
});
