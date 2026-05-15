import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { createWhatsAppInboundQueue } from '../messaging/whatsapp-inbound-queue';
import { createWhatsAppInboundWorkerLambda } from './whatsapp-inbound-worker-lambda';
import { createWhatsAppWebhookHandlerLambda } from './whatsapp-webhook-handler-lambda';

export interface WhatsAppWebhookLambdaProps {
  environment: string;
  conversationTable: dynamodb.ITable;
  itemTable: dynamodb.ITable;
  orderLimitsConfigTable: dynamodb.ITable;
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

    const queueResources = createWhatsAppInboundQueue(this, {
      environment: props.environment,
    });
    this.inboundQueue = queueResources.inboundQueue;

    this.webhookFunction = createWhatsAppWebhookHandlerLambda(this, {
      environment: props.environment,
      inboundQueue: this.inboundQueue,
      nodeRuntime: nodeJs24Runtime,
      parameterPrefix,
    });

    this.workerFunction = createWhatsAppInboundWorkerLambda(this, {
      environment: props.environment,
      inboundQueue: this.inboundQueue,
      nodeRuntime: nodeJs24Runtime,
      parameterPrefix,
      conversationTable: props.conversationTable,
      itemTable: props.itemTable,
      orderLimitsConfigTable: props.orderLimitsConfigTable,
    });
  }
}
