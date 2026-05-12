import { docClient } from '../utils';
import { reserveCapacityForOrderItems, validateSameDaySlotAndCutoff } from '../services/inventory.service';
import { Slot } from '../models';

jest.mock('../utils', () => ({
  docClient: {
    send: jest.fn(),
  },
}));

const sendMock = docClient.send as jest.Mock;

describe('inventory capacity service', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    sendMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts same-day lunch before the configured cutoff', async () => {
    jest.setSystemTime(new Date('2026-05-12T06:00:00.000Z')); // 11:30 IST
    sendMock.mockResolvedValueOnce({ Item: { lunchCutoffTime: '13:00', dinnerCutoffTime: '20:00' } });

    const result = await validateSameDaySlotAndCutoff(Slot.LUNCH, '2026-05-12');

    expect(result.valid).toBe(true);
  });

  it('rejects same-day lunch after the configured cutoff', async () => {
    jest.setSystemTime(new Date('2026-05-12T08:00:00.000Z')); // 13:30 IST
    sendMock.mockResolvedValueOnce({ Item: { lunchCutoffTime: '13:00', dinnerCutoffTime: '20:00' } });

    const result = await validateSameDaySlotAndCutoff(Slot.LUNCH, '2026-05-12');

    expect(result).toMatchObject({
      valid: false,
      reason: 'Lunch orders are closed for today',
      cutoffPassed: true,
    });
  });

  it('rejects future dates for Day 1 same-day ordering', async () => {
    jest.setSystemTime(new Date('2026-05-12T06:00:00.000Z'));

    const result = await validateSameDaySlotAndCutoff(Slot.DINNER, '2026-05-13');

    expect(result).toMatchObject({
      valid: false,
      reason: 'Orders are accepted for today only',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('initializes a missing count record and reserves aggregated duplicate items', async () => {
    jest.setSystemTime(new Date('2026-05-12T06:00:00.000Z'));
    sendMock
      .mockResolvedValueOnce({ Item: { lunchCutoffTime: '13:00', dinnerCutoffTime: '20:00' } }) // global config
      .mockResolvedValueOnce({ Item: { lunchLimit: 10, isAcceptingOrders: true } }) // item config
      .mockResolvedValueOnce({ Item: { lunchCutoffTime: '13:00', dinnerCutoffTime: '20:00' } }) // cutoff validation global
      .mockResolvedValueOnce({}) // count record missing
      .mockResolvedValueOnce({}) // initialize put
      .mockResolvedValueOnce({}); // transact reserve

    await reserveCapacityForOrderItems([
      { itemId: 'biryani', quantity: 2 },
      { itemId: 'biryani', quantity: 3 },
    ], Slot.LUNCH, '2026-05-12');

    const transactCommand = sendMock.mock.calls[5][0];
    expect(transactCommand.input.TransactItems).toHaveLength(1);
    expect(transactCommand.input.TransactItems[0].Update.ExpressionAttributeValues[':qty']).toBe(5);
  });
});
