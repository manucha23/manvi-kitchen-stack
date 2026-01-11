import { validateCreateOrderRequest, validateUpdateOrderRequest, validateUpdateSlotRequest } from '../../utils/validation.util';

describe('Validation Utils', () => {
  describe('validateCreateOrderRequest', () => {
    const validRequest = JSON.stringify({
      customerName: 'John Doe',
      deliveryAddress: '123 Main St',
      contactNumber: '+1234567890',
      orderScheduled: '2024-12-31T18:00:00Z',
      slot: 'saturday-lunch',
      items: [{ id: 'item-1', quantity: 2 }],
      instructions: 'Ring doorbell'
    });

    it('should validate correct request', () => {
      const result = validateCreateOrderRequest(validRequest);
      expect(result).toHaveProperty('customerName', 'John Doe');
    });

    it('should reject null body', () => {
      const result = validateCreateOrderRequest(null);
      expect(result).toHaveProperty('statusCode', 400);
    });

    it('should reject invalid JSON', () => {
      const result = validateCreateOrderRequest('{invalid}');
      expect(result).toHaveProperty('statusCode', 400);
    });

    it('should reject non-object body', () => {
      const result = validateCreateOrderRequest('[]');
      expect(result).toHaveProperty('statusCode', 400);
    });

    it('should reject missing required fields', () => {
      const result = validateCreateOrderRequest(JSON.stringify({ customerName: 'John' }));
      expect(result).toHaveProperty('statusCode', 400);
    });

    it('should reject invalid slot', () => {
      const invalid = JSON.parse(validRequest);
      invalid.slot = 'invalid-slot';
      const result = validateCreateOrderRequest(JSON.stringify(invalid));
      expect(result).toHaveProperty('statusCode', 400);
    });

    it('should reject invalid item quantity', () => {
      const invalid = JSON.parse(validRequest);
      invalid.items = [{ id: 'item-1', quantity: -1 }];
      const result = validateCreateOrderRequest(JSON.stringify(invalid));
      expect(result).toHaveProperty('statusCode', 400);
    });

    it('should reject non-integer quantity', () => {
      const invalid = JSON.parse(validRequest);
      invalid.items = [{ id: 'item-1', quantity: 1.5 }];
      const result = validateCreateOrderRequest(JSON.stringify(invalid));
      expect(result).toHaveProperty('statusCode', 400);
    });
  });

  describe('validateUpdateOrderRequest', () => {
    it('should validate correct request', () => {
      const result = validateUpdateOrderRequest(JSON.stringify({ orderStatus: 'Accepted' }));
      expect(result).toHaveProperty('orderStatus', 'Accepted');
    });

    it('should reject null body', () => {
      const result = validateUpdateOrderRequest(null);
      expect(result).toHaveProperty('statusCode', 400);
    });

    it('should reject invalid types', () => {
      const result = validateUpdateOrderRequest(JSON.stringify({ feedbackProvided: 'yes' }));
      expect(result).toHaveProperty('statusCode', 400);
    });
  });

  describe('validateUpdateSlotRequest', () => {
    it('should validate correct request', () => {
      const result = validateUpdateSlotRequest(JSON.stringify({
        itemId: 'item-1',
        slot: 'saturday-lunch',
        date: '2024-12-31',
        quantity: 10
      }));
      expect(result).toHaveProperty('quantity', 10);
    });

    it('should reject negative quantity', () => {
      const result = validateUpdateSlotRequest(JSON.stringify({
        itemId: 'item-1',
        slot: 'saturday-lunch',
        date: '2024-12-31',
        quantity: -5
      }));
      expect(result).toHaveProperty('statusCode', 400);
    });

    it('should reject non-integer quantity', () => {
      const result = validateUpdateSlotRequest(JSON.stringify({
        itemId: 'item-1',
        slot: 'saturday-lunch',
        date: '2024-12-31',
        quantity: 10.5
      }));
      expect(result).toHaveProperty('statusCode', 400);
    });
  });
});
