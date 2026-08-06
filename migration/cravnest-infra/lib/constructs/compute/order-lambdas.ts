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
  public readonly liveAlias: lambda.Alias;

  constructor(scope: Construct, id: string, props: OrderLambdasProps) {
    super(scope, id);

    this.orderFunction = new lambda.Function(this, 'OrderHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      // Placeholder code — cravnest-services deploys the real code via update-function-code
      code: lambda.Code.fromInline(
        'exports.handler = async () => ({ statusCode: 503, body: JSON.stringify({ message: "Service not yet deployed" }) });'
      ),
      environment: {
        ORDER_TABLE: props.orderTable.tableName,
        INVENTORY_TABLE: props.inventoryTable.tableName,
        ITEM_TABLE: props.itemTable.tableName,
        SLOT_AVAILABILITY_TABLE: props.slotAvailabilityTable.tableName,
        ORDER_HISTORY_TABLE: props.orderHistoryTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Publish initial version so the LIVE alias has something to point at
    const initialVersion = this.orderFunction.currentVersion;

    // LIVE alias — API Gateway routes traffic here; cravnest-services updates the pointer
    this.liveAlias = new lambda.Alias(this, 'LiveAlias', {
      aliasName: 'LIVE',
      version: initialVersion,
      description: 'Stable production traffic alias',
    });

    props.orderTable.grantReadWriteData(this.orderFunction);
    props.inventoryTable.grantReadWriteData(this.orderFunction);
    props.itemTable.grantReadData(this.orderFunction);
    props.slotAvailabilityTable.grantReadWriteData(this.orderFunction);
    props.orderHistoryTable.grantReadData(this.orderFunction);
  }
}
