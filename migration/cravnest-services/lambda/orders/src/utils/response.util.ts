const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Credentials': 'true'
};

export const createErrorResponse = (statusCode: number, message: string) => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify({ error: message })
});

export const createSuccessResponse = (statusCode: number, data: unknown) => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify(data)
});