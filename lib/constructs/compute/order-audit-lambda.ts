import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';

export interface OrderAuditLambdaProps {
  auditQueue: sqs.IQueue;
  orderHistoryTable: dynamodb.Table;
  logRetentionDays?: logs.RetentionDays;
}

export class OrderAuditLambda extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: OrderAuditLambdaProps) {
    super(scope, id);

    const logGroup = new logs.LogGroup(this, 'OrderAuditHandlerLogGroup', {
      retention: props.logRetentionDays ?? logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.function = new lambda.Function(this, 'OrderAuditHandler', {
      runtime: nodeJs24Runtime,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/order-audit', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: {
        ORDER_HISTORY_TABLE: props.orderHistoryTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      logGroup,
    });

    props.orderHistoryTable.grantWriteData(this.function);
    props.auditQueue.grantConsumeMessages(this.function);

    this.function.addEventSource(new lambdaEventSources.SqsEventSource(props.auditQueue, {
      batchSize: 10,
    }));
  }
}

