import { randomBytes } from 'crypto';

const setEnv = () => {
  process.env.SESSION_TABLE = 'sessions';
  process.env.TOKEN_KEY_PARAMETER_PREFIX = '/manvi/test/admin-session-token-key';
  process.env.TOKEN_KEY_VERSION = 'v1';
  process.env.ADMIN_USER_POOL_CLIENT_ID = 'client-id';
  process.env.COGNITO_DOMAIN = 'https://auth.test.cravnest.in';
  process.env.API_BASE_URL = 'https://api.test.cravnest.in';
  process.env.CALLBACK_URL = 'https://api.test.cravnest.in/auth/callback';
  process.env.ADMIN_UI_ORIGIN = 'https://admin.test.cravnest.in';
};

const keyValue = (): string => randomBytes(32).toString('base64url');

describe('token crypto helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    setEnv();
  });

  it('encrypts and decrypts tokens with a versioned SSM key', async () => {
    const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');
    const { mockClient } = require('aws-sdk-client-mock');
    const ssmMock = mockClient(SSMClient);
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: { Value: keyValue() },
    });

    const { encryptToken, decryptToken } = require('../crypto');
    const encrypted = await encryptToken('refresh-token', 'admin', 'user-1');

    expect(encrypted).toMatch(/^v1\./);
    await expect(decryptToken(encrypted, 'admin', 'user-1')).resolves.toBe('refresh-token');
    expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(1);
  });

  it('creates the active SecureString key when it is missing', async () => {
    const { GetParameterCommand, PutParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');
    const { mockClient } = require('aws-sdk-client-mock');
    const ssmMock = mockClient(SSMClient);
    ssmMock.on(GetParameterCommand).rejects({ name: 'ParameterNotFound' });
    ssmMock.on(PutParameterCommand).resolves({});

    const { encryptToken } = require('../crypto');
    await encryptToken('access-token', 'admin', 'user-1');

    const putCall = ssmMock.commandCalls(PutParameterCommand)[0];
    expect(putCall.args[0].input).toMatchObject({
      Name: '/manvi/test/admin-session-token-key/v1',
      Type: 'SecureString',
      Tier: 'Standard',
      Overwrite: false,
    });
    expect(Buffer.from(String(putCall.args[0].input.Value), 'base64url')).toHaveLength(32);
  });

  it('binds ciphertext to session identity as authenticated data', async () => {
    const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');
    const { mockClient } = require('aws-sdk-client-mock');
    const ssmMock = mockClient(SSMClient);
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: { Value: keyValue() },
    });

    const { encryptToken, decryptToken } = require('../crypto');
    const encrypted = await encryptToken('id-token', 'admin', 'user-1');

    await expect(decryptToken(encrypted, 'admin', 'user-2')).rejects.toThrow();
  });
});

export {};
