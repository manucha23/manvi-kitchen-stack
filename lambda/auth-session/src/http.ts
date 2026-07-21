import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { config } from './config';

export const parseCookies = (headers: Record<string, string | undefined>): Record<string, string> => {
  const cookieHeader = headers.Cookie || headers.cookie;
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, part) => {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName || rawValue.length === 0) return cookies;
    cookies[rawName] = decodeURIComponent(rawValue.join('='));
    return cookies;
  }, {});
};

export const getSessionIdFromEvent = (event: Pick<APIGatewayProxyEvent, 'headers'>): string | undefined => {
  return parseCookies(event.headers || {})[config.cookieName];
};

export const buildSessionCookie = (sessionId: string): string => {
  return [
    `${config.cookieName}=${encodeURIComponent(sessionId)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${config.sessionTtlSeconds}`,
  ].join('; ');
};

export const buildOAuthStateCookie = (state: string): string => {
  return [
    `${config.stateCookieName}=${encodeURIComponent(state)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${config.stateTtlSeconds}`,
  ].join('; ');
};

export const clearOAuthStateCookie = (): string => {
  return [
    `${config.stateCookieName}=`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
  ].join('; ');
};

export const clearSessionCookie = (): string => {
  return [
    `${config.cookieName}=`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0',
  ].join('; ');
};

export const corsHeaders = {
  'Access-Control-Allow-Origin': config.adminUiOrigin,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type,X-CSRF-Token',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  Vary: 'Origin',
};

export const jsonResponse = (statusCode: number, body: unknown, headers: Record<string, string> = {}): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
    ...headers,
  },
  body: JSON.stringify(body),
});

export const noContentResponse = (headers: Record<string, string> = {}): APIGatewayProxyResult => ({
  statusCode: 204,
  headers: {
    ...corsHeaders,
    ...headers,
  },
  body: '',
});

export const redirectResponse = (
  location: string,
  headers: Record<string, string> = {},
  multiValueHeaders?: Record<string, string[]>,
): APIGatewayProxyResult => ({
  statusCode: 302,
  headers: {
    Location: location,
    ...headers,
  },
  multiValueHeaders,
  body: '',
});

export const isAllowedUnsafeOrigin = (headers: Record<string, string | undefined>): boolean => {
  const origin = headers.Origin || headers.origin;
  return !origin || origin === config.adminUiOrigin || origin === 'http://localhost:4200';
};
