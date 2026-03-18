import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface OrderLambdasProps {
  orderTable: dynamodb.Table;
  itemTable: dynamodb.Table;
  slotAvailabilityTable: dynamodb.Table;
  orderHistoryTable: dynamodb.Table;
  cleanupStateMachine: sfn.StateMachine;
}

export class OrderLambdas extends Construct {
  public readonly orderFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: OrderLambdasProps) {
    super(scope, id);

    this.orderFunction = new lambda.Function(this, 'OrderHandler', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/orders', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: { 
        ORDER_TABLE: props.orderTable.tableName,
        ITEM_TABLE: props.itemTable.tableName,
        SLOT_AVAILABILITY_TABLE: props.slotAvailabilityTable.tableName,
        ORDER_HISTORY_TABLE: props.orderHistoryTable.tableName,
        CLEANUP_STATE_MACHINE_ARN: props.cleanupStateMachine.stateMachineArn
      },
      timeout: cdk.Duration.seconds(30),
    });

    props.orderTable.grantReadWriteData(this.orderFunction);
    props.itemTable.grantReadData(this.orderFunction);
    props.slotAvailabilityTable.grantReadWriteData(this.orderFunction);
    props.orderHistoryTable.grantReadData(this.orderFunction);
    props.cleanupStateMachine.grantStartExecution(this.orderFunction);
  }
}