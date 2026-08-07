import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

import { nodeJs24Runtime } from './node-runtime';

export interface AuthSessionLambdasProps {
  sessionTable: dynamodb.Table;
  tokenKeyParameterPrefix: string;
  activeTokenKeyVersion: string;
  adminUserPoolClientId: string;
  cognitoDomain: string;
  apiBaseUrl: string;
  callbackUrl: string;
  adminUiOrigin: string;
  adminGroupName: string;
  logRetentionDays?: logs.RetentionDays;
}

export class AuthSessionLambdas extends Construct {
  public readonly sessionFunction: lambda.Function;
  public readonly authorizerFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: AuthSessionLambdasProps) {
    super(scope, id);

    const commonEnvironment = {
      SESSION_TABLE: props.sessionTable.tableName,
      TOKEN_KEY_PARAMETER_PREFIX: props.tokenKeyParameterPrefix,
      TOKEN_KEY_VERSION: props.activeTokenKeyVersion,
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

    const sessionLogGroup = new logs.LogGroup(this, 'SessionHandlerLogGroup', {
      retention: props.logRetentionDays ?? logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.sessionFunction = new lambda.Function(this, 'SessionHandler', {
      runtime: nodeJs24Runtime,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/auth-session', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: commonEnvironment,
      timeout: cdk.Duration.seconds(15),
      logGroup: sessionLogGroup,
    });

    const authorizerLogGroup = new logs.LogGroup(this, 'AdminSessionAuthorizerLogGroup', {
      retention: props.logRetentionDays ?? logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.authorizerFunction = new lambda.Function(this, 'AdminSessionAuthorizer', {
      runtime: nodeJs24Runtime,
      handler: 'dist/authorizer.handler',
      code: lambda.Code.fromAsset('lambda/auth-session', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: commonEnvironment,
      timeout: cdk.Duration.seconds(10),
      logGroup: authorizerLogGroup,
    });

    props.sessionTable.grantReadWriteData(this.sessionFunction);
    props.sessionTable.grantReadWriteData(this.authorizerFunction);

    const tokenKeyPathArn = `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${props.tokenKeyParameterPrefix}/*`;
    const activeTokenKeyArn = `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${props.tokenKeyParameterPrefix}/${props.activeTokenKeyVersion}`;

    const readTokenKeyPolicy = new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [tokenKeyPathArn],
    });
    const createActiveTokenKeyPolicy = new iam.PolicyStatement({
      actions: ['ssm:PutParameter'],
      resources: [activeTokenKeyArn],
    });

    for (const fn of [this.sessionFunction, this.authorizerFunction]) {
      fn.addToRolePolicy(readTokenKeyPolicy);
      fn.addToRolePolicy(createActiveTokenKeyPolicy);
    }
  }
}
