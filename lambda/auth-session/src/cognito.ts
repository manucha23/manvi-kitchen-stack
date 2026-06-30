import { config } from './config';

export interface CognitoTokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface JwtClaims {
  sub?: string;
  username?: string;
  'cognito:username'?: string;
  email?: string;
  phone_number?: string;
  nonce?: string;
  exp?: number;
  'cognito:groups'?: string[] | string;
}

const tokenEndpoint = (): string => `${config.cognitoDomain}/oauth2/token`;
const revokeEndpoint = (): string => `${config.cognitoDomain}/oauth2/revoke`;

export const decodeJwtPayload = (token: string): JwtClaims => {
  const [, payload] = token.split('.');
  if (!payload) {
    throw new Error('Invalid JWT payload');
  }
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
};

export const parseGroups = (groupsClaim: unknown): string[] => {
  if (Array.isArray(groupsClaim)) {
    return groupsClaim.filter((group): group is string => typeof group === 'string');
  }
  if (typeof groupsClaim === 'string') {
    return groupsClaim.split(',').map((group) => group.trim()).filter(Boolean);
  }
  return [];
};

const tokenRequest = async (body: URLSearchParams): Promise<CognitoTokenResponse> => {
  const response = await fetch(tokenEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cognito token request failed: ${response.status} ${errorBody}`);
  }

  return response.json() as Promise<CognitoTokenResponse>;
};

export const exchangeCodeForTokens = async (code: string, codeVerifier: string): Promise<CognitoTokenResponse> => {
  return tokenRequest(new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.adminUserPoolClientId,
    code,
    redirect_uri: config.callbackUrl,
    code_verifier: codeVerifier,
  }));
};

export const refreshTokens = async (refreshToken: string): Promise<CognitoTokenResponse> => {
  return tokenRequest(new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.adminUserPoolClientId,
    refresh_token: refreshToken,
  }));
};

export const revokeRefreshToken = async (refreshToken: string): Promise<void> => {
  const response = await fetch(revokeEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.adminUserPoolClientId,
      token: refreshToken,
    }),
  });

  if (!response.ok && response.status !== 400) {
    const errorBody = await response.text();
    throw new Error(`Cognito revoke request failed: ${response.status} ${errorBody}`);
  }
};

export const getClaimsFromTokenResponse = (tokens: CognitoTokenResponse): JwtClaims => {
  return decodeJwtPayload(tokens.id_token || tokens.access_token);
};
