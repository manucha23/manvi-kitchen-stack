import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';

interface ManviKitchenStackProps extends cdk.StackProps {
  environment: string;
}

export class ManviKitchenStackStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ManviKitchenStackProps) {
    super(scope, id, props);

    const { environment } = props;

    const orderTable = new dynamodb.Table(this, 'OrderDb', {
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'version', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========================================
    // 2. Cognito User Pool (Admin Only)
    // ========================================
    const userPool = new cognito.UserPool(this, 'AdminUserPool', {
      userPoolName: `manvi-kitchen-admin-${environment}`,
      selfSignUpEnabled: false, // Admin creates users manually
      signInAliases: {
        email: true,
        username: true
      },
      autoVerify: { 
        email: true
      },
      standardAttributes: {
        email: { required: true, mutable: false },
        givenName: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.OPTIONAL, // Allow MFA for additional security
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // User Pool Client
    const userPoolClient = userPool.addClient('AdminAppClient', {
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
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
      restApiName: `Order Service - ${environment}`,
      deployOptions: {
        stageName: environment,
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        dataTraceEnabled: environment !== 'prod', // Disable in prod for performance
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: ['http://localhost:3000'], // Add your admin frontend URL
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

    // ========================================
    // 4. Cognito Authorizer for API Gateway
    // ========================================
    const cognitoAuthorizer = new apigw.CognitoUserPoolsAuthorizer(
      this,
      'AdminAuthorizer',
      {
        cognitoUserPools: [userPool]
      }
    );

    // Method options with Cognito authorization
    const authorizedMethodOptions: apigw.MethodOptions = {
      authorizer: cognitoAuthorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    };

    const orders = api.root.addResource('orders');
    // GET /orders  -> search / filter via query params
    orders.addMethod('GET', new apigw.LambdaIntegration(orderListFn),
                     authorizedMethodOptions);
    // POST /orders -> create
    orders.addMethod('POST', new apigw.LambdaIntegration(orderCreateFn),
                      authorizedMethodOptions);

    const order = orders.addResource('{orderId}');
    // GET /orders/{orderId} -> get
    order.addMethod('GET', new apigw.LambdaIntegration(orderGetFn),
                     authorizedMethodOptions);
    // PUT /orders/{orderId} -> update
    order.addMethod('PUT', new apigw.LambdaIntegration(orderUpdateFn),
                     authorizedMethodOptions);
    // DELETE /orders/{orderId} -> cancel
    order.addMethod('DELETE', new apigw.LambdaIntegration(orderDeleteFn),
                     authorizedMethodOptions);

    // ========================================
    // 7. Outputs
    // ========================================
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
      exportName: `${environment}-api-url`,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${environment}-user-pool-id`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID',
      exportName: `${environment}-user-pool-client-id`,
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS Region',
    });
  }
}
