import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface OrderApiProps {
  orderFunction: lambda.Function;
  customerFunction?: lambda.Function;
  itemFunction: lambda.Function;
  adminFunction: lambda.Function;
  whatsappWebhookFunction: lambda.Function;
  customerUserPool: cognito.UserPool;
  sessionFunction: lambda.Function;
  adminSessionAuthorizerFunction: lambda.Function;
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
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-CSRF-Token',
          'X-Amz-Date',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
      },
    });

    const customerAuthorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'CustomerAuthorizer', {
      cognitoUserPools: [props.customerUserPool]
    });

    const adminSessionAuthorizer = new apigw.RequestAuthorizer(this, 'AdminSessionAuthorizer', {
      handler: props.adminSessionAuthorizerFunction,
      identitySources: [apigw.IdentitySource.header('Cookie')],
      resultsCacheTtl: cdk.Duration.seconds(0),
    });

    const adminAuthOptions: apigw.MethodOptions = {
      authorizer: adminSessionAuthorizer,
      authorizationType: apigw.AuthorizationType.CUSTOM,
    };

    const customerAuthOptions: apigw.MethodOptions = {
      authorizer: customerAuthorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    };

    const orderIntegration = new apigw.LambdaIntegration(props.orderFunction);
    const itemIntegration = new apigw.LambdaIntegration(props.itemFunction);
    const sessionIntegration = new apigw.LambdaIntegration(props.sessionFunction);

    this.api.addGatewayResponse('UnauthorizedGatewayResponse', {
      type: apigw.ResponseType.UNAUTHORIZED,
      responseHeaders: {
        'Access-Control-Allow-Origin': props.frontendDomainName
          ? `'https://${props.frontendDomainName}'`
          : `'https://${props.cloudfrontDomainName}'`,
        'Access-Control-Allow-Credentials': "'true'",
      },
    });

    this.api.addGatewayResponse('AccessDeniedGatewayResponse', {
      type: apigw.ResponseType.ACCESS_DENIED,
      responseHeaders: {
        'Access-Control-Allow-Origin': props.frontendDomainName
          ? `'https://${props.frontendDomainName}'`
          : `'https://${props.cloudfrontDomainName}'`,
        'Access-Control-Allow-Credentials': "'true'",
      },
    });

    const auth = this.api.root.addResource('auth');
    auth.addResource('login').addMethod('GET', sessionIntegration);
    auth.addResource('callback').addMethod('GET', sessionIntegration);
    auth.addResource('session').addMethod('GET', sessionIntegration);
    auth.addResource('logout').addMethod('POST', sessionIntegration);

    const orders = this.api.root.addResource('orders');
    orders.addMethod('GET', orderIntegration, customerAuthOptions);
    orders.addMethod('POST', orderIntegration, customerAuthOptions);

    const order = orders.addResource('{orderId}');
    order.addMethod('GET', orderIntegration, customerAuthOptions);
    order.addMethod('PUT', orderIntegration, customerAuthOptions);
    order.addMethod('DELETE', orderIntegration, customerAuthOptions);

    if (props.customerFunction) {
      const customerIntegration = new apigw.LambdaIntegration(props.customerFunction);
      const customers = this.api.root.addResource('customers');
      const customerProfile = customers.addResource('profile');
      customerProfile.addMethod('GET', customerIntegration, customerAuthOptions);
      customerProfile.addMethod('PUT', customerIntegration, customerAuthOptions);

      const customerAddresses = customers.addResource('addresses');
      customerAddresses.addMethod('POST', customerIntegration, customerAuthOptions);

      const customerAddress = customerAddresses.addResource('{addressId}');
      customerAddress.addMethod('PUT', customerIntegration, customerAuthOptions);
      customerAddress.addMethod('DELETE', customerIntegration, customerAuthOptions);
    }

    const items = this.api.root.addResource('items');
    items.addMethod('GET', itemIntegration);

    const item = items.addResource('{itemId}');
    item.addMethod('GET', itemIntegration);

    const admin = this.api.root.addResource('admin');

    const adminOrders = admin.addResource('orders');
    adminOrders.addMethod('GET', orderIntegration, adminAuthOptions);
    adminOrders.addMethod('POST', orderIntegration, adminAuthOptions);

    const adminOrdersBulk = adminOrders.addResource('bulk');
    adminOrdersBulk.addMethod('PATCH', orderIntegration, adminAuthOptions);

    const adminOrder = adminOrders.addResource('{orderId}');
    adminOrder.addMethod('GET', orderIntegration, adminAuthOptions);
    adminOrder.addMethod('PUT', orderIntegration, adminAuthOptions);
    adminOrder.addMethod('DELETE', orderIntegration, adminAuthOptions);

    const adminOrderHistory = adminOrder.addResource('history');
    adminOrderHistory.addMethod('GET', orderIntegration, adminAuthOptions);

    const adminItems = admin.addResource('items');
    adminItems.addMethod('POST', itemIntegration, adminAuthOptions);

    const adminItemsUpload = adminItems.addResource('upload-url');
    adminItemsUpload.addMethod('POST', itemIntegration, adminAuthOptions);

    const adminItem = adminItems.addResource('{itemId}');
    adminItem.addMethod('PUT', itemIntegration, adminAuthOptions);
    adminItem.addMethod('DELETE', itemIntegration, adminAuthOptions);

    const adminOrderLimits = admin.addResource('order-limits');
    adminOrderLimits.addMethod('GET', new apigw.LambdaIntegration(props.adminFunction), adminAuthOptions);
    adminOrderLimits.addMethod('PUT', new apigw.LambdaIntegration(props.adminFunction), adminAuthOptions);

    const adminKillswitch = admin.addResource('killswitch');
    adminKillswitch.addMethod('PUT', new apigw.LambdaIntegration(props.adminFunction), adminAuthOptions);

    const webhooks = this.api.root.addResource('webhooks');
    const whatsappWebhook = webhooks.addResource('whatsapp');
    whatsappWebhook.addMethod('GET', new apigw.LambdaIntegration(props.whatsappWebhookFunction));
    whatsappWebhook.addMethod('POST', new apigw.LambdaIntegration(props.whatsappWebhookFunction));

    const whatsappFlowsWebhook = whatsappWebhook.addResource('flows');
    whatsappFlowsWebhook.addMethod('POST', new apigw.LambdaIntegration(props.whatsappWebhookFunction));

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
