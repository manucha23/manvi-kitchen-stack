import {
  applyAddressChange,
  applySimpleQuantityChange,
  buildOrderConfirmedTemplatePayload,
  buildStartButtons,
  buildOrderReviewMessage,
  calculateExpiresAt,
  formatOrderItems,
  summarizePreferences,
} from '../index';

describe('WhatsApp worker helpers', () => {
  it('sets the conversation TTL one hour ahead', () => {
    expect(calculateExpiresAt(new Date('2026-05-15T10:00:00.000Z'))).toBe(1778842800);
  });

  it('does not show repeat order for a new customer start', () => {
    expect(buildStartButtons(false, true).map((button) => button.title)).toEqual([
      'Order Now',
      'Ask Question',
    ]);
  });

  it('shows repeat order for a returning customer start', () => {
    expect(buildStartButtons(true, true).map((button) => button.title)).toEqual([
      'Order Now',
      'Repeat Order',
      'Ask Question',
    ]);
  });

  it('does not show ordering actions when the kitchen is closed', () => {
    expect(buildStartButtons(true, false).map((button) => button.title)).toEqual([
      'Ask Question',
      'View Menu',
    ]);
  });

  it('formats order items for personalized repeat prompts', () => {
    expect(formatOrderItems([
      { itemId: '1', name: 'Biryani', price: 250, quantity: 2, amount: 500 },
      { itemId: '2', name: 'Paneer Tikka', price: 220, quantity: 1, amount: 220 },
    ])).toBe('2 Biryani, 1 Paneer Tikka');
  });

  it('builds the order confirmation template payload', () => {
    expect(buildOrderConfirmedTemplatePayload('Rahul', 'ORD-123')).toEqual({
      type: 'template',
      template: {
        name: 'order_confirmed_v1',
        language: {
          code: 'en_US',
        },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: 'Rahul' },
            { type: 'text', text: 'ORD-123' },
          ],
        }],
      },
    });
  });

  it('does not expose recommendations before five orders', () => {
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
    expect(summary.recommendationEligible).toBe(false);
    expect(summary.favoriteItems).toEqual([]);
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
    expect(summary.recommendationEligible).toBe(false);
    expect(summary.favoriteItems).toEqual([]);
  });

  it('summarizes recommendations once five orders are available', () => {
    const orders = Array.from({ length: 5 }, (_, index) => ({
      orderId: `ORD-${index + 1}`,
      customerName: 'Rahul',
      customerPhone: '919999999999',
      deliveryAddress: 'Bavdhan',
      items: [
        { itemId: 'biryani', name: 'Biryani', price: 250, quantity: index % 2 ? 1 : 2, amount: index % 2 ? 250 : 500 },
      ],
      totalAmount: index % 2 ? 250 : 500,
      createdAt: `2026-05-${15 - index}T10:00:00.000Z`,
    }));

    const summary = summarizePreferences(orders);

    expect(summary.recommendationEligible).toBe(true);
    expect(summary.favoriteItems[0]).toEqual(expect.objectContaining({
      itemId: 'biryani',
      name: 'Biryani',
      timesOrdered: 5,
      totalQuantity: 8,
      usualQuantity: 2,
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
    expect(body).toContain('Amount: Rs 500');
    expect(body).toContain('Name: Rahul');
    expect(body).toContain('Delivery address: Bavdhan, Pune');
    expect(body).toContain('Phone: 919999999999');
    expect(body).toContain('Payment: COD');
    expect(body).toContain('Instructions: Less spicy');
    expect(body).toContain('Please confirm only if these details are correct.');
  });

  it('updates flat number on an active draft instead of restarting the flow', () => {
    const draft = {
      customerType: 'RETURNING' as const,
      source: 'PREVIOUS_ORDER' as const,
      items: [
        { itemId: 'biryani', name: 'Chicken Biryani', price: 300, quantity: 1, amount: 300 },
      ],
      totalAmount: 300,
      customerName: 'Mohit Manucha',
      customerPhone: '+919921765581',
      deliveryAddress: 'E1-306, Kumar Picasso\nSadesatra Nali, Hadapsar',
      paymentMethod: 'COD' as const,
      lastReviewTimestamp: '2026-06-02T16:45:00.000Z',
    };

    const updated = applyAddressChange(draft, {
      kind: 'text',
      messageId: 'wamid.1',
      from: '919921765581',
      firstName: 'Mohit',
      text: 'Delivery address change my flat number to E1-206',
      receivedAt: '2026-06-02T16:46:00.000Z',
    });

    expect(updated?.deliveryAddress).toContain('E1-206');
    expect(updated?.deliveryAddress).not.toContain('E1-306');
    expect(updated?.items[0].quantity).toBe(1);
  });

  it('updates quantity on an active draft', () => {
    const draft = {
      customerType: 'RETURNING' as const,
      source: 'PREVIOUS_ORDER' as const,
      items: [
        { itemId: 'biryani', name: 'Chicken Biryani', price: 300, quantity: 2, amount: 600 },
      ],
      totalAmount: 600,
      customerName: 'Mohit Manucha',
      customerPhone: '+919921765581',
      deliveryAddress: 'E1-306, Kumar Picasso',
      paymentMethod: 'COD' as const,
      lastReviewTimestamp: '2026-06-02T16:45:00.000Z',
    };

    const updated = applySimpleQuantityChange(draft, 'Make 1 chicken biryani instead of 2');

    expect(updated?.items[0].quantity).toBe(1);
    expect(updated?.totalAmount).toBe(300);
  });

});
