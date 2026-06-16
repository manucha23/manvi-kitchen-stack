import { createHash, randomBytes } from 'crypto';
import { DecryptCommand, EncryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { config } from './config';

const kmsClient = new KMSClient({});

export const randomUrlSafe = (bytes = 32): string => {
  return randomBytes(bytes).toString('base64url');
};

export const sha256Base64Url = (value: string): string => {
  return createHash('sha256').update(value).digest('base64url');
};

export const encryptToken = async (token: string, sessionType: string, userSub: string): Promise<string> => {
  const result = await kmsClient.send(new EncryptCommand({
    KeyId: config.kmsKeyId,
    Plaintext: Buffer.from(token, 'utf8'),
    EncryptionContext: {
      sessionType,
      userSub,
    },
  }));

  if (!result.CiphertextBlob) {
    throw new Error('KMS did not return ciphertext');
  }

  return Buffer.from(result.CiphertextBlob).toString('base64');
};

export const decryptToken = async (encryptedToken: string, sessionType: string, userSub: string): Promise<string> => {
  const result = await kmsClient.send(new DecryptCommand({
    CiphertextBlob: Buffer.from(encryptedToken, 'base64'),
    EncryptionContext: {
      sessionType,
      userSub,
    },
  }));

  if (!result.Plaintext) {
    throw new Error('KMS did not return plaintext');
  }

  return Buffer.from(result.Plaintext).toString('utf8');
};
