import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { config } from './config';

export interface OAuthStateRecord {
  pk: string;
  recordType: 'OAUTH_STATE';
  state: string;
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  createdAt: number;
  expiresAt: number;
}

export interface SessionRecord {
  pk: string;
  recordType: 'SESSION';
  sessionId: string;
  sessionType: 'admin' | 'customer';
  userSub: string;
  username?: string;
  email?: string;
  phoneNumber?: string;
  groups: string[];
  encryptedAccessToken: string;
  encryptedIdToken?: string;
  encryptedRefreshToken: string;
  accessTokenExpiresAt: number;
  idTokenExpiresAt?: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  refreshLockUntil?: number;
}

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const statePk = (state: string): string => `STATE#${state}`;
export const sessionPk = (sessionId: string): string => `SESSION#${sessionId}`;

export const saveOAuthState = async (record: OAuthStateRecord): Promise<void> => {
  await client.send(new PutCommand({
    TableName: config.tableName,
    Item: record,
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
};

export const consumeOAuthState = async (state: string): Promise<OAuthStateRecord | undefined> => {
  const result = await client.send(new DeleteCommand({
    TableName: config.tableName,
    Key: { pk: statePk(state) },
    ReturnValues: 'ALL_OLD',
  }));

  return result.Attributes as OAuthStateRecord | undefined;
};

export const createSession = async (record: SessionRecord): Promise<void> => {
  await client.send(new PutCommand({
    TableName: config.tableName,
    Item: record,
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
};

export const getSession = async (sessionId: string): Promise<SessionRecord | undefined> => {
  const result = await client.send(new GetCommand({
    TableName: config.tableName,
    Key: { pk: sessionPk(sessionId) },
  }));

  return result.Item as SessionRecord | undefined;
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  await client.send(new DeleteCommand({
    TableName: config.tableName,
    Key: { pk: sessionPk(sessionId) },
  }));
};

export const acquireRefreshLock = async (sessionId: string, now: number, lockUntil: number): Promise<boolean> => {
  try {
    await client.send(new UpdateCommand({
      TableName: config.tableName,
      Key: { pk: sessionPk(sessionId) },
      UpdateExpression: 'SET refreshLockUntil = :lockUntil, updatedAt = :now',
      ConditionExpression: 'attribute_exists(pk) AND (attribute_not_exists(refreshLockUntil) OR refreshLockUntil < :now)',
      ExpressionAttributeValues: {
        ':lockUntil': lockUntil,
        ':now': now,
      },
    }));
    return true;
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return false;
    }
    throw error;
  }
};

export const updateSessionTokens = async (session: SessionRecord): Promise<void> => {
  await client.send(new PutCommand({
    TableName: config.tableName,
    Item: {
      ...session,
      refreshLockUntil: undefined,
    },
    ConditionExpression: 'attribute_exists(pk)',
  }));
};

export const clearRefreshLock = async (sessionId: string): Promise<void> => {
  await client.send(new UpdateCommand({
    TableName: config.tableName,
    Key: { pk: sessionPk(sessionId) },
    UpdateExpression: 'REMOVE refreshLockUntil',
    ConditionExpression: 'attribute_exists(pk)',
  })).catch((error) => {
    if ((error as any)?.name !== 'ConditionalCheckFailedException') {
      throw error;
    }
  });
};
