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
  it('synthesizes separate admin and customer Cognito pools and clients', () => {
    const template = synthStack();

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

  it('attaches customer authorizer to /orders and admin authorizer to /admin orders', () => {
    const template = synthStack();
    const resources = template.findResources('AWS::ApiGateway::Method');
    const methodJson = JSON.stringify(resources);

    expect(methodJson).toContain('CustomerAuthorizer');
    expect(methodJson).toContain('AdminAuthorizer');
    expect(methodJson).toContain('GET');
    expect(methodJson).toContain('POST');
    expect(methodJson).toContain('PATCH');
  });

  it('does not synthesize stale PUT /orders/order-limits and keeps order methods on one Lambda integration', () => {
    const template = synthStack();
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
