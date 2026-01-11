import { BatchGetCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { createOrder } from '../../handlers/create-order.handler';
import { docClientMock, resetMocks, setupEnv } from '../test-utils';

describe('Create Order Handler', () => {
  beforeAll(() => setupEnv());
  beforeEach(() => resetMocks());

  const mockEvent = (body: any): APIGatewayProxyEvent => ({
    body: JSON.stringify(body),
    requestContext: {
      authorizer: {
        claims: { sub: 'user-123' }
      }
    } as any
  } as APIGatewayProxyEvent);

  const validRequest = {
    customerName: 'John Doe',
    deliveryAddress: '123 Main St',
    contactNumber: '+1234567890',
    orderScheduled: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    slot: 'saturday-lunch',
    items: [{ id: 'item-1', quantity: 2 }],
    instructions: 'Ring doorbell'
  };

  const mockItem = {
    itemId: 'item-1',
    name: 'Biryani',
    price: 250,
    available: true
  };

  describe('Success Cases', () => {
    it('should create order with valid input', async () => {
      docClientMock.on(GetCommand).resolves({ 
        Item: { 
          slotKey: 'item-1#saturday-lunch#' + validRequest.orderScheduled.split('T')[0],
          availableQuantity: 10 
        } 
      });
      docClientMock.on(BatchGetCommand).resolves({
        Responses: { [process.env.ITEM_TABLE!]: [mockItem] }
      });
      docClientMock.on(UpdateCommand).resolves({});
      docClientMock.on(PutCommand).resolves({});

      const result = await createOrder(mockEvent(validRequest));

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.orderId).toMatch(/^[A-Z0-9]{6}$/);
      expect(body.customerName).toBe('John Doe');
      expect(body.total).toBe(500);
    });

    it('should calculate total correctly for multiple items', async () => {
      const multiItemRequest = {
        ...validRequest,
        items: [
          { id: 'item-1', quantity: 2 },
          { id: 'item-2', quantity: 1 }
        ]
      };

      docClientMock.on(GetCommand).resolves({ 
        Item: { 
          slotKey: 'test',
          availableQuantity: 10 
        } 
      });
      docClientMock.on(BatchGetCommand).resolves({
        Responses: {
          [process.env.ITEM_TABLE!]: [
            mockItem,
            { itemId: 'item-2', name: 'Curry', price: 150, available: true }
          ]
        }
      });
      docClientMock.on(UpdateCommand).resolves({});
      docClientMock.on(PutCommand).resolves({});

      const result = await createOrder(mockEvent(multiItemRequest));

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.total).toBe(650); // 250*2 + 150*1
    });
  });

  describe('Authentication Cases', () => {
    it('should reject unauthenticated request', async () => {
      const event = mockEvent(validRequest);
      event.requestContext.authorizer = undefined;

      const result = await createOrder(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).error).toContain('not authenticated');
    });
  });

  describe('Validation Cases', () => {
    it('should reject missing required fields', async () => {
      const result = await createOrder(mockEvent({ customerName: 'John' }));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Missing required fields');
    });

    it('should reject invalid slot', async () => {
      const result = await createOrder(mockEvent({ ...validRequest, slot: 'invalid-slot' }));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Invalid slot');
    });

    it('should reject empty items array', async () => {
      const result = await createOrder(mockEvent({ ...validRequest, items: [] }));

      expect(result.statusCode).toBe(400);
    });

    it('should reject invalid item quantity', async () => {
      const result = await createOrder(mockEvent({
        ...validRequest,
        items: [{ id: 'item-1', quantity: -1 }]
      }));

      expect(result.statusCode).toBe(400);
    });

    it('should reject non-integer quantity', async () => {
      const result = await createOrder(mockEvent({
        ...validRequest,
        items: [{ id: 'item-1', quantity: 1.5 }]
      }));

      expect(result.statusCode).toBe(400);
    });
  });

  describe('Schedule Validation Cases', () => {
    it('should reject past date', async () => {

      const result = await createOrder(mockEvent({
        ...validRequest,
        orderScheduled: '2020-01-01T18:00:00Z'
      }));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Invalid schedule');
    });

    it('should reject non-existent slot', async () => {
      // Mock future date but no slot available
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const futureRequest = {
        ...validRequest,
        orderScheduled: futureDate.toISOString()
      };
      
      docClientMock.on(GetCommand).resolves({ Item: undefined });

      const result = await createOrder(mockEvent(futureRequest));

      expect(result.statusCode).toBe(400);
    });
  });

  describe('Item Validation Cases', () => {
    it('should reject non-existent item', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const futureRequest = {
        ...validRequest,
        orderScheduled: futureDate.toISOString()
      };
      
      docClientMock.on(GetCommand).resolves({ Item: { slotKey: 'test' } });
      docClientMock.on(BatchGetCommand).resolves({ Responses: { [process.env.ITEM_TABLE!]: [] } });

      const result = await createOrder(mockEvent(futureRequest));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('not found');
    });

    it('should reject unavailable item', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const futureRequest = {
        ...validRequest,
        orderScheduled: futureDate.toISOString()
      };
      
      docClientMock.on(GetCommand).resolves({ Item: { slotKey: 'test' } });
      docClientMock.on(BatchGetCommand).resolves({
        Responses: { [process.env.ITEM_TABLE!]: [{ ...mockItem, available: false }] }
      });

      const result = await createOrder(mockEvent(futureRequest));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('not available');
    });
  });

  describe('Inventory Cases', () => {
    it('should reject when insufficient quantity', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const futureRequest = {
        ...validRequest,
        orderScheduled: futureDate.toISOString(),
        items: [{ id: 'item-1', quantity: 5 }]
      };
      
      docClientMock.on(GetCommand).resolves({ Item: { availableQuantity: 1 } });
      docClientMock.on(BatchGetCommand).resolves({
        Responses: { [process.env.ITEM_TABLE!]: [mockItem] }
      });

      const result = await createOrder(mockEvent(futureRequest));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('sold out');
    });
  });

  describe('Error Cases', () => {
    it('should handle DynamoDB errors', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const futureRequest = {
        ...validRequest,
        orderScheduled: futureDate.toISOString()
      };
      
      docClientMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      const result = await createOrder(mockEvent(futureRequest));

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBeTruthy();
    });
  });
});
