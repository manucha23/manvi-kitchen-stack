import { config } from './config';
import { decryptToken, encryptToken, randomUrlSafe } from './crypto';
import {
  CognitoTokenResponse,
  getClaimsFromTokenResponse,
  parseGroups,
  refreshTokens,
  revokeRefreshToken,
} from './cognito';
import {
  acquireRefreshLock,
  clearRefreshLock,
  createSession,
  deleteSession,
  getSession,
  SessionRecord,
  updateSessionTokens,
} from './session-store';

export class UnauthorizedSessionError extends Error {
  constructor(message = 'Unauthorized session') {
    super(message);
    this.name = 'UnauthorizedSessionError';
  }
}

export interface AdminSessionIdentity {
  userSub: string;
  username?: string;
  email?: string;
  phoneNumber?: string;
  groups: string[];
}

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const buildIdentity = (tokens: CognitoTokenResponse, expectedNonce?: string): AdminSessionIdentity => {
  const claims = getClaimsFromTokenResponse(tokens);
  if (expectedNonce && claims.nonce && claims.nonce !== expectedNonce) {
    throw new UnauthorizedSessionError('Invalid Cognito nonce');
  }

  const userSub = claims.sub;
  if (!userSub) {
    throw new UnauthorizedSessionError('Cognito token is missing subject');
  }

  const groups = parseGroups(claims['cognito:groups']);
  if (!groups.includes(config.adminGroupName)) {
    throw new UnauthorizedSessionError('Admin group is required');
  }

  return {
    userSub,
    username: claims['cognito:username'] || claims.username,
    email: claims.email,
    phoneNumber: claims.phone_number,
    groups,
  };
};

const tokensToSession = async (
  tokens: CognitoTokenResponse,
  identity: AdminSessionIdentity,
  sessionId = randomUrlSafe(32),
  currentRefreshToken?: string,
): Promise<SessionRecord> => {
  const now = nowSeconds();
  const refreshToken = tokens.refresh_token || currentRefreshToken;
  if (!refreshToken) {
    throw new UnauthorizedSessionError('Cognito did not return a refresh token');
  }

  return {
    pk: `SESSION#${sessionId}`,
    recordType: 'SESSION',
    sessionId,
    sessionType: 'admin',
    userSub: identity.userSub,
    username: identity.username,
    email: identity.email,
    phoneNumber: identity.phoneNumber,
    groups: identity.groups,
    encryptedAccessToken: await encryptToken(tokens.access_token, 'admin', identity.userSub),
    encryptedIdToken: tokens.id_token
      ? await encryptToken(tokens.id_token, 'admin', identity.userSub)
      : undefined,
    encryptedRefreshToken: await encryptToken(refreshToken, 'admin', identity.userSub),
    accessTokenExpiresAt: now + tokens.expires_in,
    idTokenExpiresAt: tokens.id_token ? now + tokens.expires_in : undefined,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + config.sessionTtlSeconds,
  };
};

export const createAdminSession = async (tokens: CognitoTokenResponse, expectedNonce: string): Promise<SessionRecord> => {
  const identity = buildIdentity(tokens, expectedNonce);
  const session = await tokensToSession(tokens, identity);
  await createSession(session);
  return session;
};

export const revokeAndDeleteSession = async (session: SessionRecord): Promise<void> => {
  try {
    const refreshToken = await decryptToken(session.encryptedRefreshToken, session.sessionType, session.userSub);
    await revokeRefreshToken(refreshToken);
  } catch (error) {
    console.warn('Failed to revoke Cognito refresh token:', error);
  } finally {
    await deleteSession(session.sessionId);
  }
};

const refreshSession = async (session: SessionRecord): Promise<SessionRecord> => {
  const now = nowSeconds();
  const lockUntil = now + config.refreshLockSeconds;
  const lockAcquired = await acquireRefreshLock(session.sessionId, now, lockUntil);

  if (!lockAcquired) {
    await sleep(300);
    const reloaded = await getSession(session.sessionId);
    if (reloaded && reloaded.accessTokenExpiresAt > now + config.refreshSkewSeconds) {
      return reloaded;
    }
    throw new UnauthorizedSessionError('Session token refresh is already in progress');
  }

  try {
    const currentRefreshToken = await decryptToken(session.encryptedRefreshToken, session.sessionType, session.userSub);
    const refreshedTokens = await refreshTokens(currentRefreshToken);
    const identity = buildIdentity(refreshedTokens);
    const refreshedSession = await tokensToSession(refreshedTokens, identity, session.sessionId, currentRefreshToken);

    await updateSessionTokens({
      ...refreshedSession,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    });

    return {
      ...refreshedSession,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };
  } catch (error) {
    await deleteSession(session.sessionId).catch(() => undefined);
    console.warn('Admin session refresh failed:', error);
    throw new UnauthorizedSessionError('Session refresh failed');
  } finally {
    await clearRefreshLock(session.sessionId).catch(() => undefined);
  }
};

export const loadFreshAdminSession = async (sessionId: string): Promise<SessionRecord> => {
  const session = await getSession(sessionId);
  const now = nowSeconds();

  if (!session || session.recordType !== 'SESSION' || session.sessionType !== 'admin') {
    throw new UnauthorizedSessionError();
  }

  if (session.expiresAt <= now) {
    await deleteSession(session.sessionId).catch(() => undefined);
    throw new UnauthorizedSessionError('Session expired');
  }

  if (!session.groups.includes(config.adminGroupName)) {
    await deleteSession(session.sessionId).catch(() => undefined);
    throw new UnauthorizedSessionError('Admin group is required');
  }

  if (session.accessTokenExpiresAt <= now + config.refreshSkewSeconds) {
    return refreshSession(session);
  }

  return session;
};

export const getAdminSessionForLogout = async (sessionId: string): Promise<SessionRecord | undefined> => {
  const session = await getSession(sessionId);
  return session?.recordType === 'SESSION' && session.sessionType === 'admin' ? session : undefined;
};
