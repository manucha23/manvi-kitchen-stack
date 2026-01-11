import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { updateSlotAvailability } from '../../handlers/update-slot-availability.handler';
import { docClientMock, resetMocks, setupEnv } from '../test-utils';

describe('Update Slot Availability Handler', () => {
  beforeAll(() => setupEnv());
  beforeEach(() => resetMocks());

  const mockEvent = (body: any): APIGatewayProxyEvent => ({
    body: JSON.stringify(body)
  } as APIGatewayProxyEvent);

  const validRequest = {
    itemId: 'item-1',
    slot: 'saturday-lunch',
    date: '2024-12-31',
    quantity: 15
  };

  describe('Success Cases', () => {
    it('should update slot availability', async () => {
      docClientMock.on(UpdateCommand).resolves({});

      const result = await updateSlotAvailability(mockEvent(validRequest));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('updated');
      expect(body.quantity).toBe(15);
    });

    it('should accept zero quantity', async () => {
      docClientMock.on(UpdateCommand).resolves({});

      const result = await updateSlotAvailability(mockEvent({ ...validRequest, quantity: 0 }));

      expect(result.statusCode).toBe(200);
    });
  });

  describe('Validation Cases', () => {
    it('should reject missing fields', async () => {
      const result = await updateSlotAvailability(mockEvent({ itemId: 'item-1' }));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Missing required fields');
    });

    it('should reject negative quantity', async () => {
      const result = await updateSlotAvailability(mockEvent({ ...validRequest, quantity: -5 }));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('non-negative integer');
    });

    it('should reject non-integer quantity', async () => {
      const result = await updateSlotAvailability(mockEvent({ ...validRequest, quantity: 10.5 }));

      expect(result.statusCode).toBe(400);
    });

    it('should reject invalid body', async () => {
      const result = await updateSlotAvailability({ body: null } as any);

      expect(result.statusCode).toBe(400);
    });
  });

  describe('Error Cases', () => {
    it('should handle DynamoDB errors', async () => {
      docClientMock.on(UpdateCommand).rejects(new Error('DynamoDB error'));

      const result = await updateSlotAvailability(mockEvent(validRequest));

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toContain('Failed to update slot availability');
    });
  });
});
