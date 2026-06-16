import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface CognitoAuthProps {
  environment: string;
  adminAuthDomainName: string;
  adminCallbackUrl: string;
  adminLogoutUrl: string;
  customDomainCertificate: acm.ICertificate;
}

export class CognitoAuth extends Construct {
  public readonly adminUserPool: cognito.UserPool;
  public readonly adminUserPoolClient: cognito.UserPoolClient;
  public readonly adminUserPoolDomain: cognito.UserPoolDomain;
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
        userSrp: true,
      },
      generateSecret: false,
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [props.adminCallbackUrl],
        logoutUrls: [props.adminLogoutUrl],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.minutes(10),
      idTokenValidity: cdk.Duration.minutes(10),
    });

    const adminUserPoolClientResource = this.adminUserPoolClient.node.defaultChild as cognito.CfnUserPoolClient;
    adminUserPoolClientResource.addPropertyOverride('RefreshTokenRotation', {
      Feature: 'ENABLED',
      RetryGracePeriodSeconds: 10,
    });

    this.adminUserPoolDomain = this.adminUserPool.addDomain('AdminCustomDomain', {
      customDomain: {
        domainName: props.adminAuthDomainName,
        certificate: props.customDomainCertificate,
      },
    });

    const adminUserPoolDomainResource = this.adminUserPoolDomain.node.defaultChild as cognito.CfnUserPoolDomain;
    adminUserPoolDomainResource.addPropertyOverride('ManagedLoginVersion', 2);

    new cognito.CfnManagedLoginBranding(this, 'AdminManagedLoginBranding', {
      userPoolId: this.adminUserPool.userPoolId,
      clientId: this.adminUserPoolClient.userPoolClientId,
      returnMergedResources: false,
      settings: {
        categories: {
          auth: {
            authMethodOrder: [[
              {
                display: 'INPUT',
                type: 'USERNAME_PASSWORD',
              },
            ]],
            federation: {
              interfaceStyle: 'BUTTON_LIST',
              order: [],
            },
          },
          form: {
            displayGraphics: true,
            instructions: { enabled: false },
            languageSelector: { enabled: false },
            location: {
              horizontal: 'CENTER',
              vertical: 'CENTER',
            },
            sessionTimerDisplay: 'NONE',
          },
          global: {
            colorSchemeMode: 'LIGHT',
            pageFooter: { enabled: false },
            pageHeader: { enabled: false },
            spacingDensity: 'REGULAR',
          },
        },
        componentClasses: {
          buttons: {
            borderRadius: 32,
          },
          input: {
            borderRadius: 32,
            lightMode: {
              defaults: {
                backgroundColor: 'f8fafcff',
                borderColor: 'd1d5dbff',
              },
              placeholderColor: '6b7280ff',
            },
          },
          focusState: {
            lightMode: {
              borderColor: '111827ff',
            },
          },
        },
        components: {
          form: {
            borderRadius: 40,
            lightMode: {
              backgroundColor: 'ffffffff',
              borderColor: 'e5e7ebff',
            },
            logo: {
              enabled: false,
              formInclusion: 'IN',
              location: 'CENTER',
              position: 'TOP',
            },
          },
          pageBackground: {
            image: {
              enabled: false,
            },
            lightMode: {
              color: 'f9fafbff',
            },
          },
          pageText: {
            lightMode: {
              bodyColor: '374151ff',
              descriptionColor: '6b7280ff',
              headingColor: '111827ff',
            },
          },
          primaryButton: {
            lightMode: {
              active: {
                backgroundColor: '111827ff',
                textColor: 'ffffffff',
              },
              defaults: {
                backgroundColor: '111827ff',
                textColor: 'ffffffff',
              },
              hover: {
                backgroundColor: '1f2937ff',
                textColor: 'ffffffff',
              },
            },
          },
        },
      },
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
