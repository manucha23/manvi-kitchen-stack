import { APIGatewayProxyEvent } from 'aws-lambda';

const ADMIN_GROUP_NAME = process.env.ADMIN_GROUP_NAME || 'Admin';

const parseGroups = (groupsClaim: unknown): string[] => {
  if (Array.isArray(groupsClaim)) {
    return groupsClaim.filter((group): group is string => typeof group === 'string');
  }
  if (typeof groupsClaim === 'string') {
    return groupsClaim.split(',').map((group) => group.trim()).filter(Boolean);
  }
  return [];
};

export const isAdminRequest = (event: APIGatewayProxyEvent): boolean => {
  const claims = event.requestContext.authorizer?.claims || {};
  return parseGroups(claims['cognito:groups']).includes(ADMIN_GROUP_NAME);
};
