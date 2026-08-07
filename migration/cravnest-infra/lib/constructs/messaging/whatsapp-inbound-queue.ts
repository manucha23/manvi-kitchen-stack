import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface WhatsAppInboundQueueProps {
  environment: string;
}

export interface WhatsAppInboundQueueResources {
  deadLetterQueue: sqs.Queue;
  inboundQueue: sqs.Queue;
}

export const createWhatsAppInboundQueue = (
  scope: Construct,
  props: WhatsAppInboundQueueProps,
): WhatsAppInboundQueueResources => {
  const deadLetterQueue = new sqs.Queue(scope, 'WhatsAppInboundMessagesDlq', {
    fifo: true,
    queueName: `manvi-kitchen-whatsapp-inbound-dlq-${props.environment}.fifo`,
    retentionPeriod: cdk.Duration.days(14),
  });

  const inboundQueue = new sqs.Queue(scope, 'WhatsAppInboundMessages', {
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

  return {
    deadLetterQueue,
    inboundQueue,
  };
};
