import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { config } from './config';
import { exchangeCodeForTokens, revokeRefreshToken } from './cognito';
import { randomUrlSafe, sha256Base64Url } from './crypto';
import {
  buildOAuthStateCookie,
  buildSessionCookie,
  clearOAuthStateCookie,
  clearSessionCookie,
  corsHeaders,
  getSessionIdFromEvent,
  isAllowedUnsafeOrigin,
  jsonResponse,
  noContentResponse,
  parseCookies,
  redirectResponse,
} from './http';
import {
  OAuthStateRecord,
  consumeOAuthState,
  saveOAuthState,
  statePk,
} from './session-store';
import {
  UnauthorizedSessionError,
  createAdminSession,
  getAdminSessionForLogout,
  loadFreshAdminSession,
  revokeAndDeleteSession,
} from './session-service';

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

const validateReturnTo = (rawReturnTo?: string): string => {
  if (!rawReturnTo) {
    return `${config.adminUiOrigin}/orders`;
  }

  if (rawReturnTo.startsWith('/')) {
    return `${config.adminUiOrigin}${rawReturnTo}`;
  }

  try {
    const parsed = new URL(rawReturnTo);
    if (parsed.origin === config.adminUiOrigin) {
      return parsed.toString();
    }
  } catch {
    return `${config.adminUiOrigin}/orders`;
  }

  return `${config.adminUiOrigin}/orders`;
};

const buildLoginUrl = (returnTo?: string): string => {
  const loginUrl = new URL(`${config.apiBaseUrl}/auth/login`);
  if (returnTo) loginUrl.searchParams.set('returnTo', returnTo);
  return loginUrl.toString();
};

const buildLoggedOutUrl = (): string => {
  const loggedOutUrl = new URL('/login', config.adminUiOrigin);
  loggedOutUrl.searchParams.set('loggedOut', 'true');
  return loggedOutUrl.toString();
};

const buildHostedLogoutUrl = (): string => {
  const logoutUrl = new URL(`${config.cognitoDomain}/logout`);
  logoutUrl.searchParams.set('client_id', config.adminUserPoolClientId);
  logoutUrl.searchParams.set('logout_uri', buildLoggedOutUrl());
  return logoutUrl.toString();
};

const login = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const state = randomUrlSafe(32);
  const nonce = randomUrlSafe(32);
  const codeVerifier = randomUrlSafe(64);
  const now = nowSeconds();
  const returnTo = validateReturnTo(event.queryStringParameters?.returnTo);

  const stateRecord: OAuthStateRecord = {
    pk: statePk(state),
    recordType: 'OAUTH_STATE',
    state,
    nonce,
    codeVerifier,
    returnTo,
    createdAt: now,
    expiresAt: now + config.stateTtlSeconds,
  };

  await saveOAuthState(stateRecord);

  const authorizeUrl = new URL(`${config.cognitoDomain}/oauth2/authorize`);
  authorizeUrl.searchParams.set('client_id', config.adminUserPoolClientId);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'openid email profile');
  authorizeUrl.searchParams.set('redirect_uri', config.callbackUrl);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('nonce', nonce);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('code_challenge', sha256Base64Url(codeVerifier));

  return redirectResponse(authorizeUrl.toString(), {
    'Set-Cookie': buildOAuthStateCookie(state),
  });
};

const callback = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const code = event.queryStringParameters?.code;
  const state = event.queryStringParameters?.state;
  if (!code || !state) {
    return redirectResponse(`${config.adminUiOrigin}/login?error=missing_auth_code`, {
      'Set-Cookie': clearOAuthStateCookie(),
    });
  }

  const stateCookie = parseCookies(event.headers || {})[config.stateCookieName];

  if (!stateCookie || decodeURIComponent(stateCookie) !== state) {
    return redirectResponse(`${config.adminUiOrigin}/login?error=invalid_auth_state`, {
      'Set-Cookie': clearOAuthStateCookie(),
    });
  }

  const stateRecord = await consumeOAuthState(state);
  if (!stateRecord || stateRecord.expiresAt <= nowSeconds()) {
    return redirectResponse(`${config.adminUiOrigin}/login?error=invalid_auth_state`, {
      'Set-Cookie': clearOAuthStateCookie(),
    });
  }

  let refreshTokenToRevoke: string | undefined;
  try {
    const tokens = await exchangeCodeForTokens(code, stateRecord.codeVerifier);
    refreshTokenToRevoke = tokens.refresh_token;
    const session = await createAdminSession(tokens, stateRecord.nonce);

    return redirectResponse(stateRecord.returnTo, {}, {
      'Set-Cookie': [
        buildSessionCookie(session.sessionId),
        clearOAuthStateCookie(),
      ],
    });
  } catch (error) {
    console.error('Admin auth callback failed:', error);
    if (refreshTokenToRevoke) {
      await revokeRefreshToken(refreshTokenToRevoke).catch(() => undefined);
    }
    return redirectResponse(`${config.adminUiOrigin}/login?error=not_authorized`, {
      'Set-Cookie': clearOAuthStateCookie(),
    });
  }
};

const session = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const sessionId = getSessionIdFromEvent(event);
  if (!sessionId) {
    return jsonResponse(401, { authenticated: false, loginUrl: buildLoginUrl(event.queryStringParameters?.returnTo) });
  }

  try {
    const adminSession = await loadFreshAdminSession(sessionId);
    return jsonResponse(200, {
      authenticated: true,
      user: {
        userSub: adminSession.userSub,
        username: adminSession.username,
        email: adminSession.email,
        groups: adminSession.groups,
      },
      expiresAt: adminSession.expiresAt,
    });
  } catch (error) {
    if (error instanceof UnauthorizedSessionError) {
      return jsonResponse(401, { authenticated: false, loginUrl: buildLoginUrl(event.queryStringParameters?.returnTo) });
    }
    throw error;
  }
};

const logout = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!isAllowedUnsafeOrigin(event.headers || {})) {
    return jsonResponse(403, { message: 'Invalid request origin' });
  }

  const sessionId = getSessionIdFromEvent(event);
  if (sessionId) {
    const adminSession = await getAdminSessionForLogout(sessionId);
    if (adminSession) {
      await revokeAndDeleteSession(adminSession);
    }
  }

  return jsonResponse(200, {
    logoutUrl: buildHostedLogoutUrl(),
  }, {
    'Set-Cookie': clearSessionCookie(),
  });
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return noContentResponse();
    }

    if (event.path === '/auth/login' && event.httpMethod === 'GET') {
      return login(event);
    }

    if (event.path === '/auth/callback' && event.httpMethod === 'GET') {
      return callback(event);
    }

    if (event.path === '/auth/session' && event.httpMethod === 'GET') {
      return session(event);
    }

    if (event.path === '/auth/logout' && event.httpMethod === 'POST') {
      return logout(event);
    }

    return jsonResponse(404, { message: 'Route not found' });
  } catch (error) {
    console.error('Auth session handler failed:', error);
    return jsonResponse(500, { message: 'Internal server error' });
  }
};

export { corsHeaders };
