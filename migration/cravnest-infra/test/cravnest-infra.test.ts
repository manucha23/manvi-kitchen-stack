import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CravnestInfraStack } from '../lib/cravnest-infra-stack';

test('Stack synthesises without errors', () => {
  const app = new cdk.App();
  const stack = new CravnestInfraStack(app, 'TestStack', {
    environment: 'test',
    env: { account: '123456789012', region: 'ap-south-1' },
  });
  const template = Template.fromStack(stack);
  // Verify at least one Lambda function and DynamoDB table are created
  template.resourceCountIs('AWS::Lambda::Function', 5);
  template.resourceCountIs('AWS::DynamoDB::Table', 5);
  template.resourceCountIs('AWS::Lambda::Alias', 5);
});
