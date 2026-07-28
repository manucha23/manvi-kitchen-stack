import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { createWhatsAppInboundQueue } from '../messaging/whatsapp-inbound-queue';
import { createWhatsAppInboundWorkerLambda } from './whatsapp-inbound-worker-lambda';
import { createWhatsAppWebhookHandlerLambda } from './whatsapp-webhook-handler-lambda';

import { nodeJs24Runtime } from './node-runtime';

export interface WhatsAppWebhookLambdaProps {
  environment: string;
  conversationTable: dynamodb.ITable;
  customerProfileTable: dynamodb.ITable;
  cartTable: dynamodb.ITable;
  cartEventTable: dynamodb.ITable;
  orderTable: dynamodb.ITable;
  itemTable: dynamodb.ITable;
  orderLimitsConfigTable: dynamodb.ITable;
  orderFunction: lambda.IFunction;
  logRetentionDays?: logs.RetentionDays;
}

export class WhatsAppWebhookLambda extends Construct {
  public readonly webhookFunction: lambda.Function;
  public readonly workerFunction: lambda.Function;
  public readonly inboundQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: WhatsAppWebhookLambdaProps) {
    super(scope, id);

    const parameterPrefix = `/manvi-kitchen/${props.environment}/whatsapp`;

    const queueResources = createWhatsAppInboundQueue(this, {
      environment: props.environment,
    });
    this.inboundQueue = queueResources.inboundQueue;

    this.webhookFunction = createWhatsAppWebhookHandlerLambda(this, {
      environment: props.environment,
      inboundQueue: this.inboundQueue,
      nodeRuntime: nodeJs24Runtime,
      parameterPrefix,
      logRetentionDays: props.logRetentionDays,
    });

    this.workerFunction = createWhatsAppInboundWorkerLambda(this, {
      environment: props.environment,
      inboundQueue: this.inboundQueue,
      nodeRuntime: nodeJs24Runtime,
      parameterPrefix,
      conversationTable: props.conversationTable,
      customerProfileTable: props.customerProfileTable,
      cartTable: props.cartTable,
      cartEventTable: props.cartEventTable,
      orderTable: props.orderTable,
      itemTable: props.itemTable,
      orderLimitsConfigTable: props.orderLimitsConfigTable,
      orderFunction: props.orderFunction,
      logRetentionDays: props.logRetentionDays,
    });
  }
}
