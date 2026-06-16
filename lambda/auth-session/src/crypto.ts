import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import {
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { config } from './config';

const ssmClient = new SSMClient({});
const keyCache = new Map<string, Promise<Buffer>>();

const tokenKeyParameterName = (version: string): string => `${config.tokenKeyParameterPrefix}/${version}`;

export const randomUrlSafe = (bytes = 32): string => {
  return randomBytes(bytes).toString('base64url');
};

export const sha256Base64Url = (value: string): string => {
  return createHash('sha256').update(value).digest('base64url');
};

const parseTokenKey = (value?: string): Buffer => {
  if (!value) {
    throw new Error('Token encryption key parameter is empty');
  }

  const key = Buffer.from(value.trim(), 'base64url');
  if (key.length !== 32) {
    throw new Error('Token encryption key must decode to 32 bytes');
  }

  return key;
};

const isParameterNotFound = (error: unknown): boolean => {
  return (error as any)?.name === 'ParameterNotFound';
};

const getParameterKey = async (version: string): Promise<Buffer> => {
  const result = await ssmClient.send(new GetParameterCommand({
    Name: tokenKeyParameterName(version),
    WithDecryption: true,
  }));

  return parseTokenKey(result.Parameter?.Value);
};

const createActiveParameterKey = async (): Promise<Buffer> => {
  const generatedKey = randomBytes(32).toString('base64url');

  try {
    await ssmClient.send(new PutParameterCommand({
      Name: tokenKeyParameterName(config.tokenKeyVersion),
      Type: 'SecureString',
      Tier: 'Standard',
      Value: generatedKey,
      Overwrite: false,
      Description: 'Admin session token encryption key',
    }));

    return parseTokenKey(generatedKey);
  } catch (error: any) {
    if (error?.name !== 'ParameterAlreadyExists') {
      throw error;
    }

    return getParameterKey(config.tokenKeyVersion);
  }
};

const loadTokenKey = async (version: string): Promise<Buffer> => {
  try {
    return await getParameterKey(version);
  } catch (error) {
    if (version === config.tokenKeyVersion && isParameterNotFound(error)) {
      return createActiveParameterKey();
    }

    throw error;
  }
};

const getTokenKey = (version: string): Promise<Buffer> => {
  const cached = keyCache.get(version);
  if (cached) {
    return cached;
  }

  const loaded = loadTokenKey(version);
  keyCache.set(version, loaded);
  return loaded;
};

const aadForToken = (version: string, sessionType: string, userSub: string): Buffer => {
  return Buffer.from(`${version}:${sessionType}:${userSub}`, 'utf8');
};

export const encryptToken = async (token: string, sessionType: string, userSub: string): Promise<string> => {
  const version = config.tokenKeyVersion;
  const key = await getTokenKey(version);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aadForToken(version, sessionType, userSub));

  const ciphertext = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    version,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
};

export const decryptToken = async (encryptedToken: string, sessionType: string, userSub: string): Promise<string> => {
  const [version, iv, tag, ciphertext] = encryptedToken.split('.');
  if (!version || !iv || !tag || !ciphertext) {
    throw new Error('Invalid encrypted token format');
  }

  const key = await getTokenKey(version);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(aadForToken(version, sessionType, userSub));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};
