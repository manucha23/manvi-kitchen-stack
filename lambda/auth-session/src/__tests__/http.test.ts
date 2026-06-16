const setEnv = () => {
  process.env.SESSION_TABLE = 'sessions';
  process.env.TOKEN_KEY_ID = 'key-id';
  process.env.ADMIN_USER_POOL_CLIENT_ID = 'client-id';
  process.env.COGNITO_DOMAIN = 'https://auth.test.cravnest.in';
  process.env.API_BASE_URL = 'https://api.test.cravnest.in';
  process.env.CALLBACK_URL = 'https://api.test.cravnest.in/auth/callback';
  process.env.ADMIN_UI_ORIGIN = 'https://admin.test.cravnest.in';
};

describe('auth session http helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    setEnv();
  });

  it('builds a secure host-only admin session cookie', () => {
    const { buildSessionCookie } = require('../http');

    expect(buildSessionCookie('abc123')).toBe(
      '__Host-admin_session=abc123; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000',
    );
  });

  it('builds a short-lived OAuth state cookie suitable for Cognito redirects', () => {
    const { buildOAuthStateCookie } = require('../http');

    expect(buildOAuthStateCookie('state123')).toBe(
      '__Host-admin_oauth_state=state123; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300',
    );
  });

  it('parses cookies case-insensitively from API Gateway headers', () => {
    const { parseCookies } = require('../http');

    expect(parseCookies({ cookie: 'a=1; __Host-admin_session=session%201' })).toEqual({
      a: '1',
      '__Host-admin_session': 'session 1',
    });
  });
});

export {};
