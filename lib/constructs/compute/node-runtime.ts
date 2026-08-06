import * as lambda from 'aws-cdk-lib/aws-lambda';

export const nodeJs24Runtime = new lambda.Runtime('nodejs24.x', lambda.RuntimeFamily.NODEJS, {
  supportsInlineCode: true,
});
