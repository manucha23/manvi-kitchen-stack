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

    // Order Lambda (code lives in ./lambda/order)
    const orderFn = new lambda.Function(this, 'OrderHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      // lambda code will be compiled to TypeScript output in `lambda/order/dist`
      code: lambda.Code.fromAsset('lambda/order'),
      environment: {
        ORDER_TABLE: orderTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Grant the function read/write access to the order table
    orderTable.grantReadWriteData(orderFn);

    // API Gateway to expose endpoints
    const api = new apigw.RestApi(this, 'OrderApi', {
      restApiName: 'Order Service',
    });

    const orders = api.root.addResource('orders');
    // GET /orders  -> search / filter via query params
    orders.addMethod('GET', new apigw.LambdaIntegration(orderFn));
    // POST /orders -> create
    orders.addMethod('POST', new apigw.LambdaIntegration(orderFn));

    const order = orders.addResource('{orderId}');
    // GET /orders/{orderId} -> get
    order.addMethod('GET', new apigw.LambdaIntegration(orderFn));
    // PUT /orders/{orderId} -> update
    order.addMethod('PUT', new apigw.LambdaIntegration(orderFn));
    // DELETE /orders/{orderId} -> cancel
    order.addMethod('DELETE', new apigw.LambdaIntegration(orderFn));
  }
}
