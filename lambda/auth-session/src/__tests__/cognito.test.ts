const setEnv = () => {
  process.env.SESSION_TABLE = 'sessions';
  process.env.TOKEN_KEY_ID = 'key-id';
  process.env.ADMIN_USER_POOL_CLIENT_ID = 'client-id';
  process.env.COGNITO_DOMAIN = 'https://auth.test.cravnest.in';
  process.env.API_BASE_URL = 'https://api.test.cravnest.in';
  process.env.CALLBACK_URL = 'https://api.test.cravnest.in/auth/callback';
  process.env.ADMIN_UI_ORIGIN = 'https://admin.test.cravnest.in';
};

const jwt = (payload: Record<string, unknown>): string => {
  return [
    Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.');
};

describe('cognito helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    setEnv();
  });

  it('decodes JWT payload claims', () => {
    const { decodeJwtPayload } = require('../cognito');

    expect(decodeJwtPayload(jwt({ sub: 'user-1', email: 'admin@example.com' }))).toEqual({
      sub: 'user-1',
      email: 'admin@example.com',
    });
  });

  it('parses Cognito group claims from arrays and strings', () => {
    const { parseGroups } = require('../cognito');

    expect(parseGroups(['Admin', 'Other'])).toEqual(['Admin', 'Other']);
    expect(parseGroups('Admin,Other')).toEqual(['Admin', 'Other']);
    expect(parseGroups(undefined)).toEqual([]);
  });
});

export {};
