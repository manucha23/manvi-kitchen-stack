import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface WhatsAppWebhookLambdaProps {
  environment: string;
}

export class WhatsAppWebhookLambda extends Construct {
  public readonly webhookFunction: lambda.Function;
  public readonly workerFunction: lambda.Function;
  public readonly inboundQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: WhatsAppWebhookLambdaProps) {
    super(scope, id);

    const parameterPrefix = `/manvi-kitchen/${props.environment}/whatsapp`;
    const nodeJs24Runtime = new lambda.Runtime('nodejs24.x', lambda.RuntimeFamily.NODEJS, {
      supportsInlineCode: true,
    });
    const webhookCode = lambda.Code.fromAsset('lambda/whatsapp-webhook', {
      exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
    });
    const workerCode = lambda.Code.fromAsset('lambda/whatsapp-worker', {
      exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
    });

    const deadLetterQueue = new sqs.Queue(this, 'WhatsAppInboundMessagesDlq', {
      fifo: true,
      queueName: `manvi-kitchen-whatsapp-inbound-dlq-${props.environment}.fifo`,
      retentionPeriod: cdk.Duration.days(14),
    });

    this.inboundQueue = new sqs.Queue(this, 'WhatsAppInboundMessages', {
      fifo: true,
      queueName: `manvi-kitchen-whatsapp-inbound-${props.environment}.fifo`,
      contentBasedDeduplication: false,
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    this.webhookFunction = new lambda.Function(this, 'WhatsAppWebhookHandler', {
      runtime: nodeJs24Runtime,
      handler: 'dist/index.handler',
      code: webhookCode,
      environment: {
        ENVIRONMENT: props.environment,
        WHATSAPP_VERIFY_TOKEN_PARAM: `${parameterPrefix}/verify-token`,
        WHATSAPP_APP_SECRET_PARAM: `${parameterPrefix}/app-secret`,
        WHATSAPP_INBOUND_QUEUE_URL: this.inboundQueue.queueUrl,
      },
      timeout: cdk.Duration.seconds(10),
    });

    this.workerFunction = new lambda.Function(this, 'WhatsAppInboundWorker', {
      runtime: nodeJs24Runtime,
      handler: 'dist/index.handler',
      code: workerCode,
      environment: {
        ENVIRONMENT: props.environment,
        WHATSAPP_ACCESS_TOKEN_PARAM: `${parameterPrefix}/access-token`,
        WHATSAPP_PHONE_NUMBER_ID_PARAM: `${parameterPrefix}/phone-number-id`,
        WHATSAPP_GRAPH_API_VERSION: 'v25.0',
      },
      timeout: cdk.Duration.seconds(30),
    });

    this.workerFunction.addEventSource(new eventSources.SqsEventSource(this.inboundQueue, {
      batchSize: 5,
    }));

    this.webhookFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${parameterPrefix}/*`,
      ],
    }));
    this.workerFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${parameterPrefix}/*`,
      ],
    }));

    this.inboundQueue.grantSendMessages(this.webhookFunction);
    this.inboundQueue.grantConsumeMessages(this.workerFunction);
  }
}
