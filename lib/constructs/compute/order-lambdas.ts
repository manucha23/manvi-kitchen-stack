import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface OrderLambdasProps {
  orderTable: dynamodb.Table;
}

export class OrderLambdas extends Construct {
  public readonly functions: { [key: string]: lambda.Function };

  constructor(scope: Construct, id: string, props: OrderLambdasProps) {
    super(scope, id);

    const commonProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      environment: { ORDER_TABLE: props.orderTable.tableName },
      timeout: cdk.Duration.seconds(30),
    };

    this.functions = {
      create: new lambda.Function(this, 'CreateHandler', {
        ...commonProps,
        code: lambda.Code.fromAsset('lambda/order-create'),
      }),
      list: new lambda.Function(this, 'ListHandler', {
        ...commonProps,
        code: lambda.Code.fromAsset('lambda/order-list'),
      }),
      get: new lambda.Function(this, 'GetHandler', {
        ...commonProps,
        code: lambda.Code.fromAsset('lambda/order-get'),
      }),
      update: new lambda.Function(this, 'UpdateHandler', {
        ...commonProps,
        code: lambda.Code.fromAsset('lambda/order-update'),
      }),
      delete: new lambda.Function(this, 'DeleteHandler', {
        ...commonProps,
        code: lambda.Code.fromAsset('lambda/order-delete'),
      }),
    };

    // Grant permissions
    props.orderTable.grantWriteData(this.functions.create);
    props.orderTable.grantReadData(this.functions.list);
    props.orderTable.grantReadData(this.functions.get);
    props.orderTable.grantReadWriteData(this.functions.update);
    props.orderTable.grantReadWriteData(this.functions.delete);
  }
}