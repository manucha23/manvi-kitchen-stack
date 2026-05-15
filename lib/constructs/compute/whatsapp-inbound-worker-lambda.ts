import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface WhatsAppInboundWorkerLambdaProps {
  environment: string;
  inboundQueue: sqs.IQueue;
  nodeRuntime: lambda.Runtime;
  parameterPrefix: string;
  conversationTable: dynamodb.ITable;
  itemTable: dynamodb.ITable;
  orderLimitsConfigTable: dynamodb.ITable;
}

export const createWhatsAppInboundWorkerLambda = (
  scope: Construct,
  props: WhatsAppInboundWorkerLambdaProps,
): lambda.Function => {
  const workerFunction = new lambda.Function(scope, 'WhatsAppInboundWorker', {
    runtime: props.nodeRuntime,
    handler: 'dist/index.handler',
    code: lambda.Code.fromAsset('lambda/whatsapp-worker', {
      exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
    }),
    environment: {
      ENVIRONMENT: props.environment,
      WHATSAPP_ACCESS_TOKEN_PARAM: `${props.parameterPrefix}/access-token`,
      WHATSAPP_PHONE_NUMBER_ID_PARAM: `${props.parameterPrefix}/phone-number-id`,
      WHATSAPP_GRAPH_API_VERSION: 'v25.0',
      WHATSAPP_CONVERSATION_TABLE: props.conversationTable.tableName,
      ITEM_TABLE: props.itemTable.tableName,
      ORDER_LIMITS_CONFIG_TABLE: props.orderLimitsConfigTable.tableName,
      BEDROCK_MODEL_ID: 'anthropic.claude-haiku-4-5-20251001-v1:0',
    },
    timeout: cdk.Duration.seconds(60),
  });

  workerFunction.addEventSource(new eventSources.SqsEventSource(props.inboundQueue, {
    batchSize: 1,
  }));

  workerFunction.addToRolePolicy(new iam.PolicyStatement({
    actions: ['ssm:GetParameter'],
    resources: [
      `arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${props.parameterPrefix}/*`,
    ],
  }));

  props.inboundQueue.grantConsumeMessages(workerFunction);
  props.conversationTable.grantReadWriteData(workerFunction);
  props.itemTable.grantReadData(workerFunction);
  props.orderLimitsConfigTable.grantReadData(workerFunction);

  workerFunction.addToRolePolicy(new iam.PolicyStatement({
    actions: ['bedrock:InvokeModel'],
    resources: [
      `arn:aws:bedrock:${cdk.Aws.REGION}::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`,
    ],
  }));

  return workerFunction;
};
