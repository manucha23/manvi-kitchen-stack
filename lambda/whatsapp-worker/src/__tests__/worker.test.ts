import { buildSystemPrompt, calculateExpiresAt, formatMenuToolResult } from '../index';

describe('WhatsApp Bedrock worker helpers', () => {
  it('builds a short Manvi Kitchen system prompt with menu guardrails', () => {
    const prompt = buildSystemPrompt(new Date('2026-05-15T10:00:00.000Z'));

    expect(prompt).toContain("Manvi's Kitchen");
    expect(prompt).toContain('get_menu');
    expect(prompt).toContain("AI assistant");
    expect(prompt).toContain('Never make up prices');
    expect(prompt).toContain('cannot create orders yet');
    expect(prompt).toContain('Kitchen hours');
    expect(prompt).toContain('Current time in India');
  });

  it('sets the conversation TTL one hour ahead', () => {
    expect(calculateExpiresAt(new Date('2026-05-15T10:00:00.000Z'))).toBe(1778842800);
  });

  it('formats menu tool result with item availability and prices', () => {
    const menu = formatMenuToolResult(
      [
        { itemId: '2', name: 'Paneer Tikka', price: 220, available: true },
        { itemId: '1', name: 'Biryani', price: 250, available: true },
      ],
      [
        { itemId: 'GLOBAL', globalKillswitch: false },
        { itemId: '2', isAcceptingOrders: false, lunchLimit: 5, dinnerLimit: 3 },
      ],
    );

    expect(menu.kitchenOpen).toBe(true);
    expect(menu.items).toEqual([
      expect.objectContaining({ itemId: '1', name: 'Biryani', price: 250, available: true }),
      expect.objectContaining({
        itemId: '2',
        name: 'Paneer Tikka',
        price: 220,
        available: false,
        lunchLimit: 5,
        dinnerLimit: 3,
      }),
    ]);
  });

  it('marks all menu items unavailable when the kitchen killswitch is on', () => {
    const menu = formatMenuToolResult(
      [{ itemId: '1', name: 'Biryani', price: 250, available: true }],
      [{ itemId: 'GLOBAL', globalKillswitch: true }],
    );

    expect(menu.kitchenOpen).toBe(false);
    expect(menu.items[0].available).toBe(false);
  });
});
