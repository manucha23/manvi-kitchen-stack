import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';

export class ManviKitchenStackStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    const orderTable = new dynamodb.Table(this, 'OrderDb', {
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'version', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Order Lambdas - source code in lambda/ folders
    const orderCreateFn = new lambda.Function(this, 'OrderCreateHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/order-create'),
      environment: { ORDER_TABLE: orderTable.tableName },
      timeout: cdk.Duration.seconds(30),
    });

    const orderListFn = new lambda.Function(this, 'OrderListHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/order-list'),
      environment: { ORDER_TABLE: orderTable.tableName },
      timeout: cdk.Duration.seconds(30),
    });

    const orderGetFn = new lambda.Function(this, 'OrderGetHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/order-get'),
      environment: { ORDER_TABLE: orderTable.tableName },
      timeout: cdk.Duration.seconds(30),
    });

    const orderUpdateFn = new lambda.Function(this, 'OrderUpdateHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/order-update'),
      environment: { ORDER_TABLE: orderTable.tableName },
      timeout: cdk.Duration.seconds(30),
    });

    const orderDeleteFn = new lambda.Function(this, 'OrderDeleteHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/order-delete'),
      environment: { ORDER_TABLE: orderTable.tableName },
      timeout: cdk.Duration.seconds(30),
    });

    // Grant the functions least-privilege access to the order table
    // create: write only
    orderTable.grantWriteData(orderCreateFn);
    // list + get: read only
    orderTable.grantReadData(orderListFn);
    orderTable.grantReadData(orderGetFn);
    // update + delete: read + write
    orderTable.grantReadWriteData(orderUpdateFn);
    orderTable.grantReadWriteData(orderDeleteFn);

    // API Gateway to expose endpoints
    const api = new apigw.RestApi(this, 'OrderApi', {
      restApiName: 'Order Service',
    });

    const orders = api.root.addResource('orders');
    // GET /orders  -> search / filter via query params
    orders.addMethod('GET', new apigw.LambdaIntegration(orderListFn));
    // POST /orders -> create
    orders.addMethod('POST', new apigw.LambdaIntegration(orderCreateFn));

    const order = orders.addResource('{orderId}');
    // GET /orders/{orderId} -> get
    order.addMethod('GET', new apigw.LambdaIntegration(orderGetFn));
    // PUT /orders/{orderId} -> update
    order.addMethod('PUT', new apigw.LambdaIntegration(orderUpdateFn));
    // DELETE /orders/{orderId} -> cancel
    order.addMethod('DELETE', new apigw.LambdaIntegration(orderDeleteFn));
  }
}
