import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface OrderApiProps {
  orderFunction: lambda.Function;
  itemFunction: lambda.Function;
  adminFunction: lambda.Function;
  whatsappWebhookFunction: lambda.Function;
  userPool: cognito.UserPool;
  environment: string;
  cloudfrontDomainName: string;
  frontendDomainName?: string;
  certificate?: acm.ICertificate;
  domainName?: string;
}

export class OrderApi extends Construct {
  public readonly api: apigw.RestApi;
  public readonly domain?: apigw.DomainName;

  constructor(scope: Construct, id: string, props: OrderApiProps) {
    super(scope, id);

    const getCorsOrigins = (cloudfrontDomain: string, frontendDomain?: string) => {
      const origins = [`https://${cloudfrontDomain}`];
      if (frontendDomain) origins.push(`https://${frontendDomain}`);
      return origins;
    };

    this.api = new apigw.RestApi(this, 'Api', {
      restApiName: `Order Service - ${props.environment}`,
      deployOptions: {
        stageName: props.environment,
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
        methodOptions: {
          '/webhooks/whatsapp/GET': {
            throttlingRateLimit: 2,
            throttlingBurstLimit: 5,
          },
          '/webhooks/whatsapp/POST': {
            throttlingRateLimit: 10,
            throttlingBurstLimit: 20,
          },
          '/webhooks/whatsapp/flows/POST': {
            throttlingRateLimit: 10,
            throttlingBurstLimit: 20,
          },
        },
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        dataTraceEnabled: props.environment !== 'prod',
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: getCorsOrigins(props.cloudfrontDomainName, props.frontendDomainName),
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
      cognitoUserPools: [props.userPool]
    });

    const authOptions: apigw.MethodOptions = {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    };

    const orders = this.api.root.addResource('orders');
    orders.addMethod('GET', new apigw.LambdaIntegration(props.orderFunction), authOptions);
    orders.addMethod('POST', new apigw.LambdaIntegration(props.orderFunction), authOptions);

    const orderLimits = orders.addResource('order-limits');
    orderLimits.addMethod('PUT', new apigw.LambdaIntegration(props.orderFunction), authOptions);

    const order = orders.addResource('{orderId}');
    order.addMethod('GET', new apigw.LambdaIntegration(props.orderFunction), authOptions);
    order.addMethod('PUT', new apigw.LambdaIntegration(props.orderFunction), authOptions);
    order.addMethod('DELETE', new apigw.LambdaIntegration(props.orderFunction), authOptions);

    const orderHistory = order.addResource('history');
    orderHistory.addMethod('GET', new apigw.LambdaIntegration(props.orderFunction), authOptions);

    const items = this.api.root.addResource('items');
    items.addMethod('GET', new apigw.LambdaIntegration(props.itemFunction), authOptions);
    items.addMethod('POST', new apigw.LambdaIntegration(props.itemFunction), authOptions);

    const itemsUpload = items.addResource('upload-url');
    itemsUpload.addMethod('POST', new apigw.LambdaIntegration(props.itemFunction), authOptions);

    const item = items.addResource('{itemId}');
    item.addMethod('GET', new apigw.LambdaIntegration(props.itemFunction), authOptions);
    item.addMethod('PUT', new apigw.LambdaIntegration(props.itemFunction), authOptions);
    item.addMethod('DELETE', new apigw.LambdaIntegration(props.itemFunction), authOptions);

    const itemAvailability = item.addResource('availability');
    itemAvailability.addMethod('GET', new apigw.LambdaIntegration(props.itemFunction), authOptions);

    // Admin endpoints (require authentication)
    const admin = this.api.root.addResource('admin');
    const adminOrderLimits = admin.addResource('order-limits');
    adminOrderLimits.addMethod('GET', new apigw.LambdaIntegration(props.adminFunction), authOptions);
    adminOrderLimits.addMethod('PUT', new apigw.LambdaIntegration(props.adminFunction), authOptions);

    const adminKillswitch = admin.addResource('killswitch');
    adminKillswitch.addMethod('PUT', new apigw.LambdaIntegration(props.adminFunction), authOptions);

    // WhatsApp webhook endpoints (public callback secured by Meta verification/signature checks)
    const webhooks = this.api.root.addResource('webhooks');
    const whatsappWebhook = webhooks.addResource('whatsapp');
    whatsappWebhook.addMethod('GET', new apigw.LambdaIntegration(props.whatsappWebhookFunction));
    whatsappWebhook.addMethod('POST', new apigw.LambdaIntegration(props.whatsappWebhookFunction));

    const whatsappFlowsWebhook = whatsappWebhook.addResource('flows');
    whatsappFlowsWebhook.addMethod('POST', new apigw.LambdaIntegration(props.whatsappWebhookFunction));

    // Create custom domain if certificate and domain name are provided
    if (props.certificate && props.domainName) {
      this.domain = new apigw.DomainName(this, 'ApiDomain', {
        domainName: props.domainName,
        certificate: props.certificate,
        endpointType: apigw.EndpointType.REGIONAL,
      });

      new apigw.BasePathMapping(this, 'BasePathMapping', {
        domainName: this.domain,
        restApi: this.api,
      });
    }
  }
}
