import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface OrderApiProps {
  // Accepts lambda.IFunction so both Function and Alias are compatible
  orderAlias: lambda.IFunction;
  itemAlias: lambda.IFunction;
  userPool: cognito.UserPool;
  environment: string;
  cloudfrontDomainName: string;
}

export class OrderApi extends Construct {
  public readonly api: apigw.RestApi;

  constructor(scope: Construct, id: string, props: OrderApiProps) {
    super(scope, id);

    const getCorsOrigins = (env: string, cloudfrontDomain: string) => {
      const baseOrigins = ['http://localhost:4200', 'http://localhost:3000'];
      if (env === 'prod') {
        return [`https://${cloudfrontDomain}`];
      }
      return [...baseOrigins, `https://${cloudfrontDomain}`];
    };

    this.api = new apigw.RestApi(this, 'Api', {
      restApiName: `Cravnest Order Service - ${props.environment}`,
      deployOptions: {
        stageName: props.environment,
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        dataTraceEnabled: props.environment !== 'prod',
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: getCorsOrigins(props.environment, props.cloudfrontDomainName),
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
      },
    });

    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [props.userPool],
    });

    const authOptions: apigw.MethodOptions = {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    };

    const orders = this.api.root.addResource('orders');
    orders.addMethod('GET', new apigw.LambdaIntegration(props.orderAlias), authOptions);
    orders.addMethod('POST', new apigw.LambdaIntegration(props.orderAlias), authOptions);

    const slotAvailability = orders.addResource('slot-availability');
    slotAvailability.addMethod('PUT', new apigw.LambdaIntegration(props.orderAlias), authOptions);

    const order = orders.addResource('{orderId}');
    order.addMethod('GET', new apigw.LambdaIntegration(props.orderAlias), authOptions);
    order.addMethod('PUT', new apigw.LambdaIntegration(props.orderAlias), authOptions);
    order.addMethod('DELETE', new apigw.LambdaIntegration(props.orderAlias), authOptions);

    const orderHistory = order.addResource('history');
    orderHistory.addMethod('GET', new apigw.LambdaIntegration(props.orderAlias), authOptions);

    const items = this.api.root.addResource('items');
    items.addMethod('GET', new apigw.LambdaIntegration(props.itemAlias), authOptions);
    items.addMethod('POST', new apigw.LambdaIntegration(props.itemAlias), authOptions);

    const itemsUpload = items.addResource('upload-url');
    itemsUpload.addMethod('POST', new apigw.LambdaIntegration(props.itemAlias), authOptions);

    const item = items.addResource('{itemId}');
    item.addMethod('GET', new apigw.LambdaIntegration(props.itemAlias), authOptions);
    item.addMethod('PUT', new apigw.LambdaIntegration(props.itemAlias), authOptions);
    item.addMethod('DELETE', new apigw.LambdaIntegration(props.itemAlias), authOptions);
  }
}
