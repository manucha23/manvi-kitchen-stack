import { ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from './utils';

const getOrderLimits = async (itemId: string) => {
  const result = await docClient.send(new GetCommand({
    TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
    Key: { itemId }
  }));
  
  if (!result.Item) {
    return {
      lunchLimit: null,
      dinnerLimit: null,
      isAcceptingOrders: true,
      globalKillswitch: false
    };
  }
  
  return {
    lunchLimit: result.Item.lunchLimit || null,
    dinnerLimit: result.Item.dinnerLimit || null,
    isAcceptingOrders: result.Item.isAcceptingOrders !== false,
    globalKillswitch: result.Item.globalKillswitch === true
  };
};

export const listItems = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: process.env.ITEM_TABLE
    }));

    const items = await Promise.all((result.Items || []).map(async (item) => {
      const limits = await getOrderLimits(item.itemId);
      return { ...item, limits };
    }));

    return createSuccessResponse(200, { items });
  } catch (error) {
    console.error('Error listing items:', error);
    return createErrorResponse(500, 'Failed to list items');
  }
};