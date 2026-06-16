import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface AuthSessionLambdasProps {
  sessionTable: dynamodb.Table;
  tokenKey: kms.IKey;
  adminUserPoolClientId: string;
  cognitoDomain: string;
  apiBaseUrl: string;
  callbackUrl: string;
  adminUiOrigin: string;
  adminGroupName: string;
}

export class AuthSessionLambdas extends Construct {
  public readonly sessionFunction: lambda.Function;
  public readonly authorizerFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: AuthSessionLambdasProps) {
    super(scope, id);

    const commonEnvironment = {
      SESSION_TABLE: props.sessionTable.tableName,
      TOKEN_KEY_ID: props.tokenKey.keyId,
      ADMIN_USER_POOL_CLIENT_ID: props.adminUserPoolClientId,
      COGNITO_DOMAIN: props.cognitoDomain,
      API_BASE_URL: props.apiBaseUrl,
      CALLBACK_URL: props.callbackUrl,
      ADMIN_UI_ORIGIN: props.adminUiOrigin,
      ADMIN_GROUP_NAME: props.adminGroupName,
      COOKIE_NAME: '__Host-admin_session',
      SESSION_TTL_SECONDS: String(60 * 60 * 24 * 30),
      STATE_TTL_SECONDS: String(5 * 60),
      REFRESH_SKEW_SECONDS: String(60),
      REFRESH_LOCK_SECONDS: String(10),
    };

    this.sessionFunction = new lambda.Function(this, 'SessionHandler', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/auth-session', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: commonEnvironment,
      timeout: cdk.Duration.seconds(15),
    });

    this.authorizerFunction = new lambda.Function(this, 'AdminSessionAuthorizer', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'dist/authorizer.handler',
      code: lambda.Code.fromAsset('lambda/auth-session', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: commonEnvironment,
      timeout: cdk.Duration.seconds(10),
    });

    props.sessionTable.grantReadWriteData(this.sessionFunction);
    props.sessionTable.grantReadWriteData(this.authorizerFunction);
    props.tokenKey.grantEncryptDecrypt(this.sessionFunction);
    props.tokenKey.grantEncryptDecrypt(this.authorizerFunction);
  }
}
