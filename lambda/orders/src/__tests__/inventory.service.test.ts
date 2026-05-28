import { docClient } from '../utils';
import { getPromisedDeliveryAt, validateOrderingWindow } from '../services/inventory.service';

jest.mock('../utils', () => ({
  docClient: {
    send: jest.fn(),
  },
}));

const sendMock = docClient.send as jest.Mock;

describe('ordering window service', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    sendMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts orders inside the configured IST window and promises delivery in configured minutes', async () => {
    const now = new Date('2026-05-12T06:00:00.000Z'); // 11:30 IST
    sendMock.mockResolvedValueOnce({
      Item: {
        openTime: '11:00',
        closeTime: '21:00',
        deliveryPromiseMinutes: 45,
        isAcceptingOrders: true,
      },
    });

    const result = await validateOrderingWindow(now);

    expect(result).toMatchObject({
      valid: true,
      promisedDeliveryAt: '2026-05-12T06:45:00.000Z',
    });
  });

  it('rejects orders outside the configured IST window', async () => {
    const now = new Date('2026-05-12T04:59:00.000Z'); // 10:29 IST
    sendMock.mockResolvedValueOnce({
      Item: {
        openTime: '11:00',
        closeTime: '21:00',
        deliveryPromiseMinutes: 60,
      },
    });

    const result = await validateOrderingWindow(now);

    expect(result).toMatchObject({
      valid: false,
      reason: 'Orders are accepted between 11:00 and 21:00 IST',
    });
  });

  it('rejects orders when global accepting is disabled', async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        isAcceptingOrders: false,
      },
    });

    const result = await validateOrderingWindow(new Date('2026-05-12T06:00:00.000Z'));

    expect(result).toMatchObject({
      valid: false,
      reason: 'Ordering is temporarily disabled',
    });
  });

  it('uses a 60 minute promise by default', () => {
    expect(getPromisedDeliveryAt(60, new Date('2026-05-12T06:00:00.000Z'))).toBe('2026-05-12T07:00:00.000Z');
  });
});
