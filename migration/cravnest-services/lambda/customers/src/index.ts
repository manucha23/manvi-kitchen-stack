import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { OrderingCore } from '@manvi-kitchen/ordering-core';

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const getOrderingCore = (): OrderingCore => new OrderingCore({
  customerTableName: getRequiredEnv('CUSTOMER_PROFILE_TABLE'),
  cartTableName: process.env.CART_TABLE || 'dummy-cart',
  cartEventTableName: process.env.CART_EVENT_TABLE || 'dummy-cart-events',
  itemTableName: process.env.ITEM_TABLE || 'dummy-items',
  orderLimitsConfigTableName: process.env.ORDER_LIMITS_CONFIG_TABLE || 'dummy-limits',
});

const corsHeaders = (allowedOrigin?: string) => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': allowedOrigin || process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Credentials': 'true',
});

const getCallerPhone = (event: APIGatewayProxyEvent): string | undefined => {
  const claims = event.requestContext?.authorizer?.claims;
  if (claims?.phone_number) {
    return claims.phone_number;
  }

  // Fallback to query parameter for dev/testing if unauthenticated
  return event.queryStringParameters?.customerPhone || event.queryStringParameters?.phoneNumber;
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Customer request:', { method: event.httpMethod, path: event.path, resource: event.resource });
  const allowedOrigin = event.headers?.origin || event.headers?.Origin;
  const headers = corsHeaders(allowedOrigin);

  try {
    const phoneNumber = getCallerPhone(event);
    if (!phoneNumber) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Customer phone number is required (via token or query)' }),
      };
    }

    const core = getOrderingCore();
    const path = event.path || '';
    const httpMethod = event.httpMethod;
    const addressId = event.pathParameters?.addressId;

    // GET /customers/profile
    if (httpMethod === 'GET' && (path.endsWith('/customers/profile') || event.resource === '/customers/profile')) {
      const profile = await core.getOrCreateCustomer(phoneNumber);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(profile),
      };
    }

    // PUT /customers/profile
    if (httpMethod === 'PUT' && (path.endsWith('/customers/profile') || event.resource === '/customers/profile')) {
      const body = JSON.parse(event.body || '{}');
      let profile = await core.getOrCreateCustomer(phoneNumber);

      if (body.firstName || body.lastName) {
        profile = await core.updateCustomerName(phoneNumber, body.firstName || profile.firstName || '', body.lastName);
      }
      if (body.email) {
        profile = await core.updateCustomerEmail(phoneNumber, body.email);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(profile),
      };
    }

    // POST /customers/addresses
    if (httpMethod === 'POST' && (path.endsWith('/customers/addresses') || event.resource === '/customers/addresses')) {
      const body = JSON.parse(event.body || '{}');
      if (!body.text || typeof body.text !== 'string' || !body.text.trim()) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Address text is required' }),
        };
      }

      const profile = await core.saveCustomerAddress(phoneNumber, body.text, body.label, body.isDefault);
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(profile),
      };
    }

    // PUT /customers/addresses/{addressId}
    if (httpMethod === 'PUT' && addressId) {
      const body = JSON.parse(event.body || '{}');
      let profile: any;

      if (body.isDefault === true) {
        profile = await core.setDefaultCustomerAddress(phoneNumber, addressId);
      }
      if (body.text) {
        profile = await core.saveCustomerAddress(phoneNumber, body.text, body.label, body.isDefault);
      }

      if (!profile) {
        profile = await core.getOrCreateCustomer(phoneNumber);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(profile),
      };
    }

    // DELETE /customers/addresses/{addressId}
    if (httpMethod === 'DELETE' && addressId) {
      const profile = await core.deleteCustomerAddress(phoneNumber, addressId);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(profile),
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Route not found' }),
    };
  } catch (error) {
    console.error('Customer handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
    };
  }
};
