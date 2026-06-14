import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface CognitoAuthProps {
  environment: string;
}

export class CognitoAuth extends Construct {
  public readonly adminUserPool: cognito.UserPool;
  public readonly adminUserPoolClient: cognito.UserPoolClient;
  public readonly adminGroup: cognito.CfnUserPoolGroup;
  public readonly customerUserPool: cognito.UserPool;
  public readonly customerUserPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: CognitoAuthProps) {
    super(scope, id);

    this.adminUserPool = new cognito.UserPool(this, 'AdminUserPool', {
      userPoolName: `manvi-kitchen-admin-${props.environment}`,
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
        username: true
      },
      autoVerify: { 
        email: true
      },
      standardAttributes: {
        email: { required: true, mutable: false },
        givenName: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.adminUserPoolClient = this.adminUserPool.addClient('AdminAppClient', {
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
    });

    this.adminGroup = new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.adminUserPool.userPoolId,
      groupName: 'Admin',
      description: 'Administrators allowed to manage kitchen menu assets and operations',
    });

    this.customerUserPool = new cognito.UserPool(this, 'CustomerUserPool', {
      userPoolName: `manvi-kitchen-customer-${props.environment}`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        phone: true,
      },
      autoVerify: {
        email: true,
        phone: true,
      },
      standardAttributes: {
        email: { required: false, mutable: true },
        phoneNumber: { required: false, mutable: true },
        givenName: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_AND_PHONE_WITHOUT_MFA,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.customerUserPoolClient = this.customerUserPool.addClient('CustomerAppClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
    });
  }
}
