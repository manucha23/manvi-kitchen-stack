import { buildOrderReviewMessage, calculateExpiresAt, formatOrderItems, summarizePreferences } from '../index';

describe('WhatsApp worker helpers', () => {
  it('sets the conversation TTL one hour ahead', () => {
    expect(calculateExpiresAt(new Date('2026-05-15T10:00:00.000Z'))).toBe(1778842800);
  });

  it('formats order items for personalized repeat prompts', () => {
    expect(formatOrderItems([
      { itemId: '1', name: 'Biryani', price: 250, quantity: 2, amount: 500 },
      { itemId: '2', name: 'Paneer Tikka', price: 220, quantity: 1, amount: 220 },
    ])).toBe('2 Biryani, 1 Paneer Tikka');
  });

  it('summarizes preferences from the last five orders', () => {
    const summary = summarizePreferences([
      {
        orderId: 'ORD-5',
        customerName: 'Rahul',
        customerPhone: '919999999999',
        deliveryAddress: 'Bavdhan',
        items: [
          { itemId: 'biryani', name: 'Biryani', price: 250, quantity: 2, amount: 500 },
          { itemId: 'tikka', name: 'Paneer Tikka', price: 220, quantity: 1, amount: 220 },
        ],
        totalAmount: 720,
        createdAt: '2026-05-15T10:00:00.000Z',
      },
      {
        orderId: 'ORD-4',
        customerName: 'Rahul',
        customerPhone: '919999999999',
        deliveryAddress: 'Bavdhan',
        items: [
          { itemId: 'biryani', name: 'Biryani', price: 250, quantity: 1, amount: 250 },
        ],
        totalAmount: 250,
        createdAt: '2026-05-14T10:00:00.000Z',
      },
    ]);

    expect(summary.orderCountAnalyzed).toBe(2);
    expect(summary.favoriteItems[0]).toEqual(expect.objectContaining({
      itemId: 'biryani',
      name: 'Biryani',
      timesOrdered: 2,
      totalQuantity: 3,
      usualQuantity: 2,
    }));
    expect(summary.repeatCandidate).toEqual(expect.objectContaining({
      orderId: 'ORD-5',
      itemsText: '2 Biryani, 1 Paneer Tikka',
      deliveryAddress: 'Bavdhan',
    }));
  });

  it('does not invent repeat preference from a single prior order', () => {
    const summary = summarizePreferences([
      {
        orderId: 'ORD-1',
        customerName: 'Rahul',
        customerPhone: '919999999999',
        deliveryAddress: 'Bavdhan',
        items: [
          { itemId: 'biryani', name: 'Biryani', price: 250, quantity: 2, amount: 500 },
        ],
        totalAmount: 500,
        createdAt: '2026-05-15T10:00:00.000Z',
      },
    ]);

    expect(summary.orderCountAnalyzed).toBe(1);
    expect(summary.favoriteItems[0]).toEqual(expect.objectContaining({
      name: 'Biryani',
      timesOrdered: 1,
    }));
  });

  it('builds a review message before confirming a repeat order', () => {
    const body = buildOrderReviewMessage({
      orderId: 'ORD-5',
      customerName: 'Rahul',
      customerPhone: '919999999999',
      deliveryAddress: 'Bavdhan, Pune',
      items: [
        { itemId: 'biryani', name: 'Biryani', price: 250, quantity: 2, amount: 500 },
      ],
      totalAmount: 500,
      instructions: 'Less spicy',
      createdAt: '2026-05-15T10:00:00.000Z',
    });

    expect(body).toContain('Please review your order');
    expect(body).toContain('2 Biryani');
    expect(body).toContain('Delivery address: Bavdhan, Pune');
    expect(body).toContain('Phone: 919999999999');
    expect(body).toContain('Instructions: Less spicy');
    expect(body).toContain('Should I confirm this order?');
  });
});
