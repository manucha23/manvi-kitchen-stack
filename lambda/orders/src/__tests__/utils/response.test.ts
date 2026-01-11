import { createErrorResponse, createSuccessResponse } from '../../utils/response.util';

describe('Response Utils', () => {
  describe('createErrorResponse', () => {
    it('should create error response with correct structure', () => {
      const response = createErrorResponse(400, 'Bad Request');
      
      expect(response.statusCode).toBe(400);
      expect(response.headers).toHaveProperty('Content-Type', 'application/json');
      expect(JSON.parse(response.body)).toEqual({ error: 'Bad Request' });
    });

    it('should include CORS headers', () => {
      const response = createErrorResponse(500, 'Internal Error');
      
      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin');
    });
  });

  describe('createSuccessResponse', () => {
    it('should create success response with data', () => {
      const data = { orderId: 'ABC123', status: 'Created' };
      const response = createSuccessResponse(200, data);
      
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(data);
    });

    it('should handle arrays', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const response = createSuccessResponse(200, data);
      
      expect(JSON.parse(response.body)).toEqual(data);
    });
  });
});
