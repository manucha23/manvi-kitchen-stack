import { APIGatewayProxyEvent } from 'aws-lambda';

export interface CallerContext {
  principalId: string;
  username?: string;
  email?: string;
  phoneNumber?: string;
  groups: string[];
  isAdmin: boolean;
  isCustomer: boolean;
  isAdminRoute: boolean;
  isCustomerRoute: boolean;
  issuer?: string;
}

const ADMIN_GROUP_NAME = process.env.ADMIN_GROUP_NAME || 'Admin';

export const parseGroups = (groupsClaim: unknown): string[] => {
  if (Array.isArray(groupsClaim)) {
    return groupsClaim.filter((group): group is string => typeof group === 'string');
  }

  if (typeof groupsClaim === 'string') {
    return groupsClaim.split(',').map((group) => group.trim()).filter(Boolean);
  }

  return [];
};

export const getCallerContext = (event: APIGatewayProxyEvent): CallerContext => {
  const authorizer = event.requestContext.authorizer as any || {};
  const claims = authorizer.claims || {};
  const groups = parseGroups(claims['cognito:groups'] || authorizer.groups);
  const path = event.path || '';
  const isAdminRoute = path.startsWith('/admin/orders');
  const isCustomerRoute = path.startsWith('/orders');
  const principalId = String(claims.sub || claims.username || authorizer.userSub || authorizer.principalId || '');

  return {
    principalId,
    username: typeof claims.username === 'string' ? claims.username : authorizer.username,
    email: typeof claims.email === 'string' ? claims.email : authorizer.email,
    phoneNumber: typeof claims.phone_number === 'string' ? claims.phone_number : authorizer.phoneNumber,
    groups,
    isAdmin: groups.includes(ADMIN_GROUP_NAME),
    isCustomer: Boolean(principalId) && !isAdminRoute,
    isAdminRoute,
    isCustomerRoute,
    issuer: typeof claims.iss === 'string' ? claims.iss : undefined,
  };
};

export const requireAuthenticatedCaller = (event: APIGatewayProxyEvent): CallerContext | undefined => {
  const caller = getCallerContext(event);
  return caller.principalId ? caller : undefined;
};

export const isAuthorizedForRoute = (caller: CallerContext): boolean => {
  if (caller.isAdminRoute) {
    return caller.isAdmin;
  }

  if (caller.isCustomerRoute) {
    return Boolean(caller.principalId);
  }

  return false;
};
