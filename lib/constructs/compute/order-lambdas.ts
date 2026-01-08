import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface OrderLambdasProps {
  orderTable: dynamodb.Table;
  inventoryTable: dynamodb.Table;
  itemTable: dynamodb.Table;
  slotAvailabilityTable: dynamodb.Table;
  orderHistoryTable: dynamodb.Table;
}

export class OrderLambdas extends Construct {
  public readonly orderFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: OrderLambdasProps) {
    super(scope, id);

    this.orderFunction = new lambda.Function(this, 'OrderHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/orders', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: { 
        ORDER_TABLE: props.orderTable.tableName,
        INVENTORY_TABLE: props.inventoryTable.tableName,
        ITEM_TABLE: props.itemTable.tableName,
        SLOT_AVAILABILITY_TABLE: props.slotAvailabilityTable.tableName,
        ORDER_HISTORY_TABLE: props.orderHistoryTable.tableName
      },
      timeout: cdk.Duration.seconds(30),
    });

    props.orderTable.grantReadWriteData(this.orderFunction);
    props.inventoryTable.grantReadWriteData(this.orderFunction);
    props.itemTable.grantReadData(this.orderFunction);
    props.slotAvailabilityTable.grantReadWriteData(this.orderFunction);
    props.orderHistoryTable.grantReadData(this.orderFunction);
  }
}