import {
  APIGatewayAuthorizerResult,
  APIGatewayRequestAuthorizerEvent,
} from 'aws-lambda';
import { config } from './config';
import { getSessionIdFromEvent, isAllowedUnsafeOrigin } from './http';
import { loadFreshAdminSession } from './session-service';

const policy = (
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context: Record<string, string | boolean> = {},
): APIGatewayAuthorizerResult => ({
  principalId,
  policyDocument: {
    Version: '2012-10-17',
    Statement: [{
      Action: 'execute-api:Invoke',
      Effect: effect,
      Resource: resource,
    }],
  },
  context,
});

const isUnsafeMethod = (method?: string): boolean => {
  return Boolean(method && !['GET', 'HEAD', 'OPTIONS'].includes(method));
};

export const handler = async (event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  try {
    if (isUnsafeMethod(event.httpMethod) && !isAllowedUnsafeOrigin(event.headers || {})) {
      return policy('anonymous', 'Deny', event.methodArn);
    }

    const sessionId = getSessionIdFromEvent({ headers: event.headers || {} });
    if (!sessionId) {
      return policy('anonymous', 'Deny', event.methodArn);
    }

    const session = await loadFreshAdminSession(sessionId);
    return policy(session.userSub, 'Allow', event.methodArn, {
      sessionId: session.sessionId,
      sessionType: session.sessionType,
      userSub: session.userSub,
      username: session.username || '',
      email: session.email || '',
      groups: session.groups.join(','),
      isAdmin: session.groups.includes(config.adminGroupName),
    });
  } catch (error) {
    console.warn('Admin session authorizer denied request:', error);
    return policy('anonymous', 'Deny', event.methodArn);
  }
};
