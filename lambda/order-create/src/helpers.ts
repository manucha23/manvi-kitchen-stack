import * as AWS from 'aws-sdk';

export const ddb = new AWS.DynamoDB.DocumentClient();
export const TABLE = process.env.ORDER_TABLE as string;

export const json = (statusCode: number, body: any) => ({
  statusCode,
  headers: { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  },
  body: JSON.stringify(body),
});

export const nowIso = () => new Date().toISOString();
export const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const getLatestItem = async (orderId: string) => {
  const resp = await ddb
    .query({
      TableName: TABLE,
      KeyConditionExpression: 'orderId = :id',
      ExpressionAttributeValues: { ':id': orderId },
      Limit: 1,
      ScanIndexForward: false,
    })
    .promise();
  return (resp.Items && resp.Items[0]) || null;
};

export const getAllVersions = async (orderId: string) => {
  const resp = await ddb
    .query({
      TableName: TABLE,
      KeyConditionExpression: 'orderId = :id',
      ExpressionAttributeValues: { ':id': orderId },
      ScanIndexForward: false,
    })
    .promise();
  return resp.Items || [];
};
