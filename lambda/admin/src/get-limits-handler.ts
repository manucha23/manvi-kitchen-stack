import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse } from './utils';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

export const getOrderLimits = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!
    }));

    const configs = result.Items || [];
    
    return createSuccessResponse(200, {
      message: 'Order limits configuration retrieved',
      configs,
      count: configs.length
    });
  } catch (error) {
    console.error('Error retrieving order limits:', error);
    return createErrorResponse(500, 'Failed to retrieve order limits');
  }
};
