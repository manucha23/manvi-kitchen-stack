import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, createSuccessResponse, createErrorResponse, validateSetKillswitchRequest } from './utils';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

export const setKillswitch = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const validationResult = validateSetKillswitchRequest(event.body);
    if ('statusCode' in validationResult) {
      return createErrorResponse(validationResult.statusCode, validationResult.message);
    }

    const { itemId, isAcceptingOrders, globalKillswitch } = validationResult;

    // Global killswitch
    if (globalKillswitch !== undefined && itemId === undefined) {
      const config = { 
        itemId: 'GLOBAL', 
        globalKillswitch, 
        updatedAt: new Date().toISOString() 
      };
      
      await docClient.send(new PutCommand({
        TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
        Item: config
      }));

      return createSuccessResponse(200, {
        message: `Global killswitch ${globalKillswitch ? 'enabled' : 'disabled'}`,
        config
      });
    }

    // Item-specific killswitch
    if (isAcceptingOrders !== undefined && itemId) {
      const existingResult = await docClient.send(new GetCommand({
        TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
        Key: { itemId }
      }));

      const config = existingResult.Item || { itemId };
      config.isAcceptingOrders = isAcceptingOrders;
      config.updatedAt = new Date().toISOString();

      await docClient.send(new PutCommand({
        TableName: process.env.ORDER_LIMITS_CONFIG_TABLE!,
        Item: config
      }));

      return createSuccessResponse(200, {
        message: `Item ${isAcceptingOrders ? 'enabled' : 'disabled'}`,
        config
      });
    }

    return createErrorResponse(400, 'Invalid request: must specify either global killswitch or item-specific killswitch');
  } catch (error) {
    console.error('Error setting killswitch:', error);
    return createErrorResponse(500, 'Failed to set killswitch');
  }
};
