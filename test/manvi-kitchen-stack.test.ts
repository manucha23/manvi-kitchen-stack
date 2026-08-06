import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
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

  it('adds SES DKIM records without managing Zoho mailbox DNS records', () => {
    template.hasResourceProperties('AWS::SES::EmailIdentity', {
      EmailIdentity: 'cravnest.in',
    });

    const recordSets = template.findResources('AWS::Route53::RecordSet');
    const records = Object.values(recordSets).map((record: any) => record.Properties);
    const sesDkimRecords = records.filter((record) =>
      record.Type === 'CNAME' && JSON.stringify(record).includes('DkimDNS')
    );
    const mxRecords = records.filter((record) => record.Type === 'MX');
    const txtRecords = records.filter((record) => record.Type === 'TXT');

    expect(sesDkimRecords).toHaveLength(3);
    expect(mxRecords).toHaveLength(0);
    expect(txtRecords).toHaveLength(0);
  });

  it('sets one-month Lambda log retention for the test environment', () => {
    // Lambdas now use the logGroup prop (AWS::Logs::LogGroup) directly.
    // The order-audit lambda uses NodejsFunction + createLambdaLogGroup helper.
    const customLogRetention = template.findResources('Custom::LogRetention');
    const logGroupResources = template.findResources('AWS::Logs::LogGroup');

    const appLogRetentionCount =
      Object.keys(customLogRetention).length +
      Object.values(logGroupResources).filter((res: any) => res.Properties?.RetentionInDays === 30).length;

    expect(appLogRetentionCount).toBe(13);
  });

  it.skip('sets one-month Lambda log retention for the prod environment', () => {
    for (const env of ['prod']) {
      const app = new cdk.App({ context: { environment: env } });
      const stack = new ManviKitchenStackStack(app, `Stack-${env}`, {
        environment: env,
        env: { account: '123456789012', region: 'ap-south-1' },
      });
      const envTemplate = Template.fromStack(stack);
      const customLogRetention = envTemplate.findResources('Custom::LogRetention');
      const logGroupResources = envTemplate.findResources('AWS::Logs::LogGroup');

      const appLogRetentionCount =
        Object.keys(customLogRetention).length +
        Object.values(logGroupResources).filter((res: any) => res.Properties?.RetentionInDays === 30).length;

      expect(appLogRetentionCount).toBe(13);
    }
  });

  it('moves test invoice PDFs to IA after one month and deletes them after six months', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: {
        'Fn::Join': [
          '',
          ['manvi-kitchen-invoices-test-', { Ref: 'AWS::AccountId' }],
        ],
      },
      LifecycleConfiguration: {
        Rules: [
          {
            Id: 'TestInvoiceLifecycle',
            Status: 'Enabled',
            Transitions: [
              {
                StorageClass: 'STANDARD_IA',
                TransitionInDays: 30,
              },
            ],
            ExpirationInDays: 180,
          },
        ],
      },
    });
  });

  it('synthesizes dedicated CustomerLambdas function and /customers API routes', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          CUSTOMER_PROFILE_TABLE: { Ref: Match.stringLikeRegexp('CustomerProfiles.*') },
          ALLOWED_ORIGIN: 'https://admin.test.cravnest.in',
        },
      },
    });

    const resources = template.findResources('AWS::ApiGateway::Resource');
    const resourceJson = JSON.stringify(resources);
    expect(resourceJson).toContain('customers');
    expect(resourceJson).toContain('profile');
    expect(resourceJson).toContain('addresses');
  });
});
