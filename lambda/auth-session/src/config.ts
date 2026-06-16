export const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

export const config = {
  tableName: requiredEnv('SESSION_TABLE'),
  kmsKeyId: requiredEnv('TOKEN_KEY_ID'),
  adminUserPoolClientId: requiredEnv('ADMIN_USER_POOL_CLIENT_ID'),
  cognitoDomain: requiredEnv('COGNITO_DOMAIN').replace(/\/$/, ''),
  apiBaseUrl: requiredEnv('API_BASE_URL').replace(/\/$/, ''),
  callbackUrl: requiredEnv('CALLBACK_URL'),
  adminUiOrigin: requiredEnv('ADMIN_UI_ORIGIN').replace(/\/$/, ''),
  adminGroupName: process.env.ADMIN_GROUP_NAME || 'Admin',
  cookieName: process.env.COOKIE_NAME || '__Host-admin_session',
  stateCookieName: process.env.STATE_COOKIE_NAME || '__Host-admin_oauth_state',
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 30),
  stateTtlSeconds: Number(process.env.STATE_TTL_SECONDS || 300),
  refreshSkewSeconds: Number(process.env.REFRESH_SKEW_SECONDS || 60),
  refreshLockSeconds: Number(process.env.REFRESH_LOCK_SECONDS || 10),
};
