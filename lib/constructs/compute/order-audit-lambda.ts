import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface OrderAuditLambdaProps {
  orderTable: dynamodb.Table;
  orderHistoryTable: dynamodb.Table;
  logRetention?: logs.RetentionDays;
}

export class OrderAuditLambda extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: OrderAuditLambdaProps) {
    super(scope, id);

    this.function = new lambda.Function(this, 'OrderAuditHandler', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/order-audit', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: {
        ORDER_HISTORY_TABLE: props.orderHistoryTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      logRetention: props.logRetention,
    });

    props.orderHistoryTable.grantWriteData(this.function);

    this.function.addEventSource(new lambdaEventSources.DynamoEventSource(props.orderTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      filters: [
        lambda.FilterCriteria.filter({
          eventName: lambda.FilterRule.isEqual('INSERT')
        }),
        lambda.FilterCriteria.filter({
          eventName: lambda.FilterRule.isEqual('MODIFY')
        })
      ]
    }));
  }
}
