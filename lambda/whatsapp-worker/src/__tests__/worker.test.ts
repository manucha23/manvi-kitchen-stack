import { buildWelcomeMessage } from '../index';

describe('WhatsApp worker', () => {
  it('builds the welcome message from the customer first name', () => {
    expect(buildWelcomeMessage('Rahul')).toBe(
      "Hi Rahul, welcome to Manvi's Kitchen! How can we help you today?",
    );
  });

  it('falls back to there when first name is empty', () => {
    expect(buildWelcomeMessage('')).toBe(
      "Hi there, welcome to Manvi's Kitchen! How can we help you today?",
    );
  });
});
