import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface OrderLambdasProps {
  orderTable: dynamodb.Table;
  itemTable: dynamodb.Table;
  orderHistoryTable: dynamodb.Table;
  orderLimitsConfigTable: dynamodb.Table;
  allowedOrigins?: string;
  adminGroupName: string;
  logRetention?: logs.RetentionDays;
}

export class OrderLambdas extends Construct {
  public readonly orderFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: OrderLambdasProps) {
    super(scope, id);

    this.orderFunction = new lambda.Function(this, 'OrderHandler', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/orders', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: { 
        ORDER_TABLE: props.orderTable.tableName,
        ITEM_TABLE: props.itemTable.tableName,
        ORDER_HISTORY_TABLE: props.orderHistoryTable.tableName,
        ORDER_LIMITS_CONFIG_TABLE: props.orderLimitsConfigTable.tableName,
        ALLOWED_ORIGIN: props.allowedOrigins || '*',
        ADMIN_GROUP_NAME: props.adminGroupName,
      },
      timeout: cdk.Duration.seconds(30),
      logRetention: props.logRetention,
    });

    props.orderTable.grantReadWriteData(this.orderFunction);
    props.itemTable.grantReadData(this.orderFunction);
    props.orderHistoryTable.grantReadData(this.orderFunction);
    props.orderLimitsConfigTable.grantReadData(this.orderFunction);
  }
}
