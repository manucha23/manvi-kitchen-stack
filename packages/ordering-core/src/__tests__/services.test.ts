import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { OrderingCore } from '../services';
import { Cart } from '../types';

const docMock = mockClient(DynamoDBDocumentClient);

const createCore = (now = new Date('2026-06-07T10:00:00.000Z')) => new OrderingCore({
  customerTableName: 'customers',
  cartTableName: 'carts',
  cartEventTableName: 'cart-events',
  itemTableName: 'items',
  orderLimitsConfigTableName: 'limits',
}, {
  now: () => now,
  idGenerator: () => 'id-1',
});

describe('OrderingCore', () => {
  beforeEach(() => {
    docMock.reset();
  });

  it('creates a phone-first customer and active cart with a cart-created event', async () => {
    docMock.on(GetCommand).resolves({});
    docMock.on(QueryCommand).resolves({});
    docMock.on(PutCommand).resolves({});

    const cart = await createCore().getOrCreateCart('+91 99999 99999', 'WHATSAPP', 'Rahul');

    expect(cart.phoneNumber).toBe('919999999999');
    expect(cart.customerId).toBe('PHONE#919999999999');
    expect(cart.status).toBe('ACTIVE');
    expect(docMock.commandCalls(PutCommand).length).toBe(3);
    expect(docMock.commandCalls(PutCommand)[2].args[0].input.Item).toMatchObject({
      eventType: 'CART_CREATED',
      phoneNumber: '919999999999',
      channel: 'WHATSAPP',
    });
  });

  it('adds an available menu item and records an item-added event', async () => {
    const core = createCore();
    const cart: Cart = {
      cartId: 'cart-1',
      customerId: 'PHONE#919999999999',
      phoneNumber: '919999999999',
      channel: 'WHATSAPP',
      status: 'ACTIVE',
      items: [],
      totalAmount: 0,
      createdAt: '2026-06-07T09:00:00.000Z',
      updatedAt: '2026-06-07T09:00:00.000Z',
      lastInteractionAt: '2026-06-07T09:00:00.000Z',
      expiresAt: 1791357600,
    };
    docMock.on(PutCommand).resolves({});

    const updated = await core.addItemToCart(cart, {
      itemId: 'biryani-full',
      name: 'Chicken Biryani Full',
      category: 'Biryani',
      price: 300,
      available: true,
    }, 2);

    expect(updated.items).toEqual([expect.objectContaining({
      itemId: 'biryani-full',
      quantity: 2,
      amount: 600,
    })]);
    expect(updated.totalAmount).toBe(600);
    expect(docMock.commandCalls(PutCommand)[1].args[0].input.Item).toMatchObject({
      eventType: 'ITEM_ADDED',
      metadata: { itemId: 'biryani-full', quantity: 2 },
    });
  });

  it('builds a COD order payload only for township delivery', () => {
    const core = createCore();
    const cart: Cart = {
      cartId: 'cart-1',
      customerId: 'PHONE#919999999999',
      phoneNumber: '919999999999',
      channel: 'WHATSAPP',
      status: 'CHECKOUT_STARTED',
      items: [{ itemId: 'biryani-full', name: 'Chicken Biryani Full', price: 300, quantity: 1, amount: 300 }],
      totalAmount: 300,
      specialRequest: 'Less spicy',
      deliveryAddress: { text: 'A-1204, Vanaha Township', deliveryArea: 'TOWNSHIP' },
      createdAt: '2026-06-07T09:00:00.000Z',
      updatedAt: '2026-06-07T09:00:00.000Z',
      lastInteractionAt: '2026-06-07T09:00:00.000Z',
      expiresAt: 1791357600,
    };

    expect(core.buildCodOrderPayload(cart, 'Rahul')).toEqual({
      customerName: 'Rahul',
      customerPhone: '919999999999',
      deliveryAddress: 'A-1204, Vanaha Township',
      paymentMethod: 'COD',
      items: [{ id: 'biryani-full', quantity: 1 }],
      instructions: 'Less spicy',
      sourceCartId: 'cart-1',
    });

    expect(() => core.buildCodOrderPayload({
      ...cart,
      deliveryAddress: { text: 'Outside Pune', deliveryArea: 'OUTSIDE' },
    }, 'Rahul')).toThrow('Only township delivery is supported in v1');
  });

  it('marks stale active and checkout carts as abandoned', async () => {
    docMock.on(QueryCommand).resolvesOnce({
      Items: [{
        cartId: 'active-cart',
        customerId: 'PHONE#1',
        phoneNumber: '1',
        channel: 'WHATSAPP',
        status: 'ACTIVE',
        items: [],
        totalAmount: 0,
        createdAt: '2026-06-07T08:00:00.000Z',
        updatedAt: '2026-06-07T08:00:00.000Z',
        lastInteractionAt: '2026-06-07T08:00:00.000Z',
        expiresAt: 1791357600,
      }],
    }).resolvesOnce({
      Items: [{
        cartId: 'checkout-cart',
        customerId: 'PHONE#2',
        phoneNumber: '2',
        channel: 'WHATSAPP',
        status: 'CHECKOUT_STARTED',
        items: [],
        totalAmount: 0,
        createdAt: '2026-06-07T09:00:00.000Z',
        updatedAt: '2026-06-07T09:00:00.000Z',
        lastInteractionAt: '2026-06-07T09:00:00.000Z',
        expiresAt: 1791357600,
      }],
    });
    docMock.on(PutCommand).resolves({});

    await expect(createCore().markAbandonedCarts()).resolves.toEqual({ abandonedCount: 2 });
    const abandonedWrites = docMock.commandCalls(PutCommand)
      .map((call) => call.args[0].input.Item)
      .filter((item): item is Record<string, unknown> => item !== undefined && item.status === 'ABANDONED');
    expect(abandonedWrites).toHaveLength(2);
  });
});
