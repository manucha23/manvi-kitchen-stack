import { calculateExpiresAt, formatOrderItems, summarizePreferences } from '../index';

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
});
