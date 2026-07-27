import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { createLambdaLogGroup } from './log-retention';

export interface WhatsAppWebhookHandlerLambdaProps {
  environment: string;
  inboundQueue: sqs.IQueue;
  nodeRuntime: lambda.Runtime;
  parameterPrefix: string;
  logRetention?: logs.RetentionDays;
}

export const createWhatsAppWebhookHandlerLambda = (
  scope: Construct,
  props: WhatsAppWebhookHandlerLambdaProps,
): lambda.Function => {
  const webhookFunction = new lambda.Function(scope, 'WhatsAppWebhookHandler', {
    runtime: props.nodeRuntime,
    handler: 'dist/index.handler',
    code: lambda.Code.fromAsset('lambda/whatsapp-webhook', {
      exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
    }),
    environment: {
      ENVIRONMENT: props.environment,
      WHATSAPP_VERIFY_TOKEN_PARAM: `${props.parameterPrefix}/verify-token`,
      WHATSAPP_APP_SECRET_PARAM: `${props.parameterPrefix}/app-secret`,
      WHATSAPP_INBOUND_QUEUE_URL: props.inboundQueue.queueUrl,
    },
    timeout: cdk.Duration.seconds(10),
    logGroup: createLambdaLogGroup(scope, 'WhatsAppWebhookHandlerLogGroup', props.logRetention),
  });

  webhookFunction.addToRolePolicy(new iam.PolicyStatement({
    actions: ['ssm:GetParameter'],
    resources: [
      `arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${props.parameterPrefix}/*`,
    ],
  }));

  props.inboundQueue.grantSendMessages(webhookFunction);

  return webhookFunction;
};
