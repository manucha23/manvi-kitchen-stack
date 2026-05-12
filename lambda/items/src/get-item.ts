import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from './utils';
import { getTodayAvailability } from './availability';

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

export const getItem = async (itemId: string): Promise<APIGatewayProxyResult> => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: process.env.ITEM_TABLE,
      Key: { itemId }
    }));

    if (!result.Item) {
      return createErrorResponse(404, 'Item not found');
    }

    const [limits, availability] = await Promise.all([
      getOrderLimits(itemId),
      getTodayAvailability(itemId),
    ]);
    const item = { ...result.Item, limits, availability };

    return createSuccessResponse(200, item);
  } catch (error) {
    console.error('Error getting item:', error);
    return createErrorResponse(500, 'Failed to get item');
  }
};
