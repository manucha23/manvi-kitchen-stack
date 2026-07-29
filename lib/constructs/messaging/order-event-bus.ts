import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipes from 'aws-cdk-lib/aws-pipes';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface OrderEventBusProps {
  environment: string;
  orderTable: dynamodb.ITable;
}

export class OrderEventBus extends Construct {
  public readonly topic: sns.Topic;
  public readonly auditQueue: sqs.Queue;
  public readonly invoiceEmailQueue: sqs.Queue;
  public readonly whatsAppNotificationQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: OrderEventBusProps) {
    super(scope, id);

    // 1. Create SNS Topic for Order Events
    this.topic = new sns.Topic(this, 'OrderEventsTopic', {
      topicName: `manvi-kitchen-order-events-${props.environment}`,
      displayName: 'Manvi Kitchen Order Lifecycle Events',
    });

    // 2. Audit Queue & Subscription (all INSERT / MODIFY events)
    const auditDlq = new sqs.Queue(this, 'OrderAuditDlq', {
      queueName: `manvi-kitchen-order-audit-dlq-${props.environment}`,
      retentionPeriod: cdk.Duration.days(14),
    });
    this.auditQueue = new sqs.Queue(this, 'OrderAuditQueue', {
      queueName: `manvi-kitchen-order-audit-queue-${props.environment}`,
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: auditDlq,
        maxReceiveCount: 3,
      },
    });
    this.topic.addSubscription(
      new subscriptions.SqsSubscription(this.auditQueue, {
        // rawMessageDelivery: true — intentionally disabled so the SQS body
        // is the standard SNS JSON envelope { Message: '...', Subject: '...' }.
        // The audit lambda already handles both raw and enveloped formats.
        rawMessageDelivery: false,
      })
    );

    // 3. Invoice Email Queue & Subscription (Filtered for status = COMPLETED)
    const invoiceEmailDlq = new sqs.Queue(this, 'OrderInvoiceEmailDlq', {
      queueName: `manvi-kitchen-order-invoice-email-dlq-${props.environment}`,
      retentionPeriod: cdk.Duration.days(14),
    });
    this.invoiceEmailQueue = new sqs.Queue(this, 'OrderInvoiceEmailQueue', {
      queueName: `manvi-kitchen-order-invoice-email-queue-${props.environment}`,
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: invoiceEmailDlq,
        maxReceiveCount: 3,
      },
    });
    this.topic.addSubscription(
      new subscriptions.SqsSubscription(this.invoiceEmailQueue, {
        // rawMessageDelivery must be FALSE when using filterPolicyWithMessageBody.
        // SNS body-based filtering requires the SNS JSON envelope to be present
        // so SNS can parse and evaluate the Message JSON before delivering.
        rawMessageDelivery: false,
        filterPolicyWithMessageBody: {
          status: sns.FilterOrPolicy.filter(
            sns.SubscriptionFilter.stringFilter({
              allowlist: ['COMPLETED'],
            })
          ),
        },
      })
    );

    // 4. WhatsApp Notification Queue & Subscription (Filtered for CONFIRMED, DISPATCHED, COMPLETED)
    const whatsAppNotificationDlq = new sqs.Queue(this, 'WhatsAppNotificationDlq', {
      queueName: `manvi-kitchen-whatsapp-notification-dlq-${props.environment}`,
      retentionPeriod: cdk.Duration.days(14),
    });
    this.whatsAppNotificationQueue = new sqs.Queue(this, 'WhatsAppNotificationQueue', {
      queueName: `manvi-kitchen-whatsapp-notification-queue-${props.environment}`,
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: whatsAppNotificationDlq,
        maxReceiveCount: 3,
      },
    });
    this.topic.addSubscription(
      new subscriptions.SqsSubscription(this.whatsAppNotificationQueue, {
        // rawMessageDelivery must be FALSE when using filterPolicyWithMessageBody.
        // SNS body-based filtering requires the SNS JSON envelope to be present
        // so SNS can parse and evaluate the Message JSON before delivering.
        rawMessageDelivery: false,
        filterPolicyWithMessageBody: {
          status: sns.FilterOrPolicy.filter(
            sns.SubscriptionFilter.stringFilter({
              allowlist: ['CONFIRMED', 'DISPATCHED', 'COMPLETED'],
            })
          ),
        },
      })
    );

    // 5. IAM Role for EventBridge Pipe
    const pipeRole = new iam.Role(this, 'OrderStreamPipeRole', {
      assumedBy: new iam.ServicePrincipal('pipes.amazonaws.com'),
    });

    if (props.orderTable.tableStreamArn) {
      props.orderTable.grantStreamRead(pipeRole);
    }
    this.topic.grantPublish(pipeRole);

    // 6. EventBridge Pipe connecting DynamoDB Stream to SNS Topic
    if (props.orderTable.tableStreamArn) {
      new pipes.CfnPipe(this, 'OrderStreamToSnsPipe', {
        name: `manvi-kitchen-order-stream-pipe-${props.environment}`,
        roleArn: pipeRole.roleArn,
        source: props.orderTable.tableStreamArn,
        sourceParameters: {
          dynamoDbStreamParameters: {
            startingPosition: 'LATEST',
            batchSize: 1,
          },
          filterCriteria: {
            filters: [
              {
                pattern: JSON.stringify({
                  eventName: ['INSERT', 'MODIFY'],
                }),
              },
            ],
          },
        },
        target: this.topic.topicArn,
        targetParameters: {
          // EventBridge Pipe input transformer: use individual field references.
          // Do NOT embed <$.dynamodb> directly — it injects a JSON-escaped string
          // literal into the JSON template, producing invalid JSON that breaks
          // downstream lambda parsers. Instead, reference individual sub-fields.
          inputTemplate: [
            '{',
            '"eventName": <$.eventName>,',
            '"status": <$.dynamodb.NewImage.status.S>,',
            '"oldStatus": <$.dynamodb.OldImage.status.S>,',
            '"orderId": <$.dynamodb.NewImage.orderId.S>,',
            '"customerName": <$.dynamodb.NewImage.customerName.S>,',
            '"customerPhone": <$.dynamodb.NewImage.customerPhone.S>,',
            '"newImage": <$.dynamodb.NewImage>,',
            '"oldImage": <$.dynamodb.OldImage>',
            '}',
          ].join(''),
        },
      });
    }
  }
}
