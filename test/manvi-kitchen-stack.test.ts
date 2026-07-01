import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ManviKitchenStackStack } from '../lib/manvi-kitchen-stack-stack';

const synthStack = () => {
  const app = new cdk.App({ context: { environment: 'test' } });
  const stack = new ManviKitchenStackStack(app, 'IsolationTestStack', {
    environment: 'test',
    env: { account: '123456789012', region: 'ap-south-1' },
  });
  return Template.fromStack(stack);
};

describe('ManviKitchenStack Cognito/API isolation', () => {
  let template: Template;

  beforeAll(() => {
    template = synthStack();
  });

  it('synthesizes separate admin and customer Cognito pools and clients', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'manvi-kitchen-admin-test',
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'manvi-kitchen-customer-test',
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
    });
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 2);
  });

  it('configures admin hosted login and short-lived admin tokens', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AccessTokenValidity: 10,
      IdTokenValidity: 10,
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      ExplicitAuthFlows: ['ALLOW_USER_SRP_AUTH'],
      CallbackURLs: ['https://api.test.cravnest.in/auth/callback'],
      LogoutURLs: ['https://admin.test.cravnest.in/login?loggedOut=true'],
      RefreshTokenRotation: {
        Feature: 'ENABLED',
        RetryGracePeriodSeconds: 10,
      },
    });

    template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: 'auth.test.cravnest.in',
      ManagedLoginVersion: 2,
    });

    template.resourceCountIs('AWS::Cognito::ManagedLoginBranding', 1);
  });

  it('creates typed session storage and SSM-backed token encryption config', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'manvi-kitchen-sessions-test',
      TimeToLiveSpecification: {
        AttributeName: 'expiresAt',
        Enabled: true,
      },
    });

    template.resourceCountIs('AWS::KMS::Key', 0);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          TOKEN_KEY_PARAMETER_PREFIX: '/manvi-kitchen/test/admin-session-token-key',
          TOKEN_KEY_VERSION: 'v1',
        },
      },
    });
    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
    expect(policies).toContain('ssm:GetParameter');
    expect(policies).toContain('ssm:PutParameter');
    expect(policies).toContain(':parameter/manvi-kitchen/test/admin-session-token-key/*');
    expect(policies).toContain(':parameter/manvi-kitchen/test/admin-session-token-key/v1');
  });

  it('attaches customer Cognito authorizer and admin cookie-session authorizer', () => {
    const resources = template.findResources('AWS::ApiGateway::Method');
    const methodJson = JSON.stringify(resources);

    expect(methodJson).toContain('CustomerAuthorizer');
    expect(methodJson).toContain('AdminSessionAuthorizer');
    expect(methodJson).toContain('COGNITO_USER_POOLS');
    expect(methodJson).toContain('CUSTOM');
    expect(methodJson).toContain('GET');
    expect(methodJson).toContain('POST');
    expect(methodJson).toContain('PATCH');

    template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
      Type: 'REQUEST',
      IdentitySource: 'method.request.header.Cookie',
      AuthorizerResultTtlInSeconds: 0,
    });
  });

  it('does not synthesize stale PUT /orders/order-limits and keeps order methods on one Lambda integration', () => {
    const resources = template.findResources('AWS::ApiGateway::Resource');
    const resourceJson = JSON.stringify(resources);

    const orderLimitResources = Object.values(resources).filter((resource: any) => resource.Properties?.PathPart === 'order-limits');
    expect(orderLimitResources).toHaveLength(1);

    const methods = template.findResources('AWS::ApiGateway::Method');
    const orderMethods = Object.values(methods).filter((method: any) =>
      JSON.stringify(method).includes('OrderHandler')
    );
    expect(orderMethods.length).toBeGreaterThanOrEqual(10);
  });
});
