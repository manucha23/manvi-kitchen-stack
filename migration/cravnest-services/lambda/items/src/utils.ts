import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client);

export const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*'
};

export const createErrorResponse = (statusCode: number, message: string) => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify({ error: message })
});

export const createSuccessResponse = (statusCode: number, data: any) => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify(data)
});