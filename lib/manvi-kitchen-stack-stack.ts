import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { OrderDatabase } from './constructs/database/order-database';
import { ItemDatabase } from './constructs/database/item-database';
import { OrderHistoryDatabase } from './constructs/database/order-history-database';
import { OrderLimitsConfigDatabase } from './constructs/database/order-limits-config-database';
import { WhatsAppConversationDatabase } from './constructs/database/whatsapp-conversation-database';
import { CustomerProfileDatabase } from './constructs/database/customer-profile-database';
import { CartDatabase } from './constructs/database/cart-database';
import { CartEventDatabase } from './constructs/database/cart-event-database';
import { SessionDatabase } from './constructs/database/session-database';
import { ImageStorage } from './constructs/storage/image-storage';
import { CognitoAuth } from './constructs/auth/cognito-auth';
import { OrderLambdas } from './constructs/compute/order-lambdas';
import { ItemLambdas } from './constructs/compute/item-lambdas';
import { AdminLambdas } from './constructs/compute/admin-lambdas';
import { AuthSessionLambdas } from './constructs/compute/auth-session-lambdas';
import { OrderAuditLambda } from './constructs/compute/order-audit-lambda';
import { WhatsAppWebhookLambda } from './constructs/compute/whatsapp-webhook-lambda';
import { createCartMaintenanceLambda } from './constructs/compute/cart-maintenance-lambda';
import { createImageProcessorLambda } from './constructs/compute/image-processor-lambda';
import { FrontendHosting } from './constructs/frontend/frontend-hosting';
import { OpenApiHosting } from './constructs/frontend/openapi-hosting';
import { OrderApi } from './constructs/api/order-api';
import { Route53HostedZone } from './constructs/dns/route53-hosted-zone';
import { AcmCertificates } from './constructs/certificates/acm-certificates';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as lambda from 'aws-cdk-lib/aws-lambda';

interface ManviKitchenStackProps extends cdk.StackProps {
  environment: string;
}

export class ManviKitchenStackStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ManviKitchenStackProps) {
    super(scope, id, props);

    const { environment } = props;
    const testIndiaGeoRestriction = environment === 'test'
      ? cloudfront.GeoRestriction.allowlist('IN')
      : undefined;

    // Create constructs
    const orderDatabase = new OrderDatabase(this, 'Database');
    const itemDatabase = new ItemDatabase(this, 'ItemDatabase');
    const orderHistory = new OrderHistoryDatabase(this, 'OrderHistory');
    const orderLimitsConfig = new OrderLimitsConfigDatabase(this, 'OrderLimitsConfig');
    const whatsappConversations = new WhatsAppConversationDatabase(this, 'WhatsAppConversations', {
      environment,
    });
    const customerProfiles = new CustomerProfileDatabase(this, 'CustomerProfiles', {
      environment,
    });
    const carts = new CartDatabase(this, 'Carts', {
      environment,
    });
    const cartEvents = new CartEventDatabase(this, 'CartEvents', {
      environment,
    });
    const sessions = new SessionDatabase(this, 'Sessions', { environment });

    const adminFrontendDomain = 'admin.test.cravnest.in';
    const apiDomainName = 'api.test.cravnest.in';
    const adminAuthDomainName = 'auth.test.cravnest.in';
    const adminFrontendOrigin = `https://${adminFrontendDomain}`;
    const apiBaseUrl = `https://${apiDomainName}`;
    
    // Domain and SSL setup
    const hostedZone = new Route53HostedZone(this, 'HostedZone', {
      hostedZoneId: 'Z074094923I5W07YNSBUX',
      zoneName: 'cravnest.in',
    });
    
    // CloudFront certificate ARN from us-east-1 (hardcoded per environment in cdk.context.json)
    const cloudfrontCertificateArn =
      this.node.tryGetContext(`cloudFrontCertificateArn:${environment}`) ??
      this.node.tryGetContext('cloudFrontCertificateArn');
    
    const certificates = new AcmCertificates(this, 'Certificates', {
      hostedZone: hostedZone.hostedZone,
      cloudfrontCertificateArn: cloudfrontCertificateArn,
    });

    const auth = new CognitoAuth(this, 'Auth', {
      environment,
      adminAuthDomainName,
      adminCallbackUrl: `${apiBaseUrl}/auth/callback`,
      adminLogoutUrl: adminFrontendOrigin,
      customDomainCertificate: certificates.cloudfrontCertificate,
    });
    
    const lambdas = new OrderLambdas(this, 'Lambdas', {
      orderTable: orderDatabase.table,
      itemTable: itemDatabase.table,
      orderHistoryTable: orderHistory.table,
      orderLimitsConfigTable: orderLimitsConfig.table,
      allowedOrigins: 'https://admin.test.cravnest.in',
      adminGroupName: auth.adminGroup.groupName!,
    });

    const nodeJs24Runtime = new lambda.Runtime('nodejs24.x', lambda.RuntimeFamily.NODEJS, {
      supportsInlineCode: true,
    });

    const imageStorage = new ImageStorage(this, 'ImageStorage', { 
      environment,
      allowedOrigins: [adminFrontendOrigin],
      hostedZone: hostedZone.hostedZone,
      certificate: certificates.cloudfrontCertificate,
      geoRestriction: testIndiaGeoRestriction,
    });

    createImageProcessorLambda(this, {
      environment,
      pendingImageBucket: imageStorage.pendingBucket,
      imageBucket: imageStorage.bucket,
      nodeRuntime: nodeJs24Runtime,
    });

    const itemLambdas = new ItemLambdas(this, 'ItemLambdas', {
      itemTable: itemDatabase.table,
      imageBucket: imageStorage.bucket,
      pendingImageBucket: imageStorage.pendingBucket,
      imageDistribution: imageStorage.distribution,
      imageDomain: `images.${environment === 'prod' ? 'cravnest.in' : `${environment}.cravnest.in`}`,
      adminGroupName: auth.adminGroup.groupName!,
      allowedOrigins: adminFrontendOrigin,
    });
    
    const orderAudit = new OrderAuditLambda(this, 'OrderAudit', {
      orderTable: orderDatabase.table,
      orderHistoryTable: orderHistory.table,
    });
    
    const adminLambdas = new AdminLambdas(this, 'AdminLambdas', {
      orderLimitsConfigTable: orderLimitsConfig.table,
      adminGroupName: auth.adminGroup.groupName!,
      allowedOrigins: 'https://admin.test.cravnest.in',
    });

    const authSessions = new AuthSessionLambdas(this, 'AuthSessions', {
      sessionTable: sessions.table,
      tokenKey: sessions.tokenKey,
      adminUserPoolClientId: auth.adminUserPoolClient.userPoolClientId,
      cognitoDomain: `https://${adminAuthDomainName}`,
      apiBaseUrl,
      callbackUrl: `${apiBaseUrl}/auth/callback`,
      adminUiOrigin: adminFrontendOrigin,
      adminGroupName: auth.adminGroup.groupName!,
    });

    createCartMaintenanceLambda(this, {
      customerProfileTable: customerProfiles.table,
      cartTable: carts.table,
      cartEventTable: cartEvents.table,
      itemTable: itemDatabase.table,
      orderLimitsConfigTable: orderLimitsConfig.table,
      nodeRuntime: nodeJs24Runtime,
    });

    const whatsappWebhook = new WhatsAppWebhookLambda(this, 'WhatsAppWebhook', {
      environment,
      conversationTable: whatsappConversations.table,
      customerProfileTable: customerProfiles.table,
      cartTable: carts.table,
      cartEventTable: cartEvents.table,
      orderTable: orderDatabase.table,
      itemTable: itemDatabase.table,
      orderLimitsConfigTable: orderLimitsConfig.table,
      orderFunction: lambdas.orderFunction,
    });
    
    const frontend = new FrontendHosting(this, 'Frontend', { 
      environment,
      certificate: certificates.cloudfrontCertificate,
      domainName: adminFrontendDomain,
      geoRestriction: testIndiaGeoRestriction,
    });
    const docs = new OpenApiHosting(this, 'OpenApiDocs', { 
      environment,
      certificate: certificates.cloudfrontCertificate,
      domainName: 'api-doc.test.cravnest.in',
      geoRestriction: testIndiaGeoRestriction,
    });
    const api = new OrderApi(this, 'Api', {
      orderFunction: lambdas.orderFunction,
      itemFunction: itemLambdas.itemFunction,
      adminFunction: adminLambdas.adminFunction,
      whatsappWebhookFunction: whatsappWebhook.webhookFunction,
      customerUserPool: auth.customerUserPool,
      sessionFunction: authSessions.sessionFunction,
      adminSessionAuthorizerFunction: authSessions.authorizerFunction,
      environment,
      cloudfrontDomainName: frontend.distribution.distributionDomainName,
      frontendDomainName: adminFrontendDomain,
      certificate: certificates.apiCertificate,
      domainName: apiDomainName,
    });

    // DNS Records

    // Frontend DNS record
    new route53.ARecord(this, 'FrontendDNS', {
      zone: hostedZone.hostedZone,
      recordName: adminFrontendDomain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(frontend.distribution)),
    });

    // API Docs DNS record
    new route53.ARecord(this, 'ApiDocsDNS', {
      zone: hostedZone.hostedZone,
      recordName: 'api-doc.test.cravnest.in',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(docs.distribution)),
    });

    // API Gateway DNS record
    if (api.domain) {
      new route53.ARecord(this, 'ApiDNS', {
        zone: hostedZone.hostedZone,
        recordName: apiDomainName,
        target: route53.RecordTarget.fromAlias(new targets.ApiGatewayDomain(api.domain)),
      });
    }

    new route53.ARecord(this, 'AdminAuthDNS', {
      zone: hostedZone.hostedZone,
      recordName: adminAuthDomainName,
      target: route53.RecordTarget.fromAlias({
        bind: () => ({
          dnsName: auth.adminUserPoolDomain.cloudFrontEndpoint,
          hostedZoneId: 'Z2FDTNDATAQYW2',
        }),
      }),
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.api.url,
      description: 'API Gateway URL',
      exportName: `${environment}-api-url`,
    });

    new cdk.CfnOutput(this, 'ApiCustomUrl', {
      value: api.domain ? `https://${api.domain.domainName}` : api.api.url,
      description: 'API Gateway Custom Domain URL',
      exportName: `${environment}-api-custom-url`,
    });

    new cdk.CfnOutput(this, 'AdminAuthCustomUrl', {
      value: `https://${adminAuthDomainName}`,
      description: 'Admin Cognito managed login custom domain URL',
      exportName: `${environment}-admin-auth-custom-url`,
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${frontend.distribution.distributionDomainName}`,
      description: 'Frontend CloudFront URL',
      exportName: `${environment}-frontend-url`,
    });

    new cdk.CfnOutput(this, 'FrontendCustomUrl', {
      value: adminFrontendOrigin,
      description: 'Frontend Custom Domain URL',
      exportName: `${environment}-frontend-custom-url`,
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontend.bucket.bucketName,
      description: 'Frontend S3 Bucket Name',
      exportName: `${environment}-frontend-bucket-name`,
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: frontend.distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `${environment}-distribution-id`,
    });

    new cdk.CfnOutput(this, 'OpenApiDocsUrl', {
      value: `https://${docs.distribution.distributionDomainName}`,
      description: 'OpenAPI documentation UI URL',
      exportName: `${environment}-openapi-docs-url`,
    });

    new cdk.CfnOutput(this, 'OpenApiDocsCustomUrl', {
      value: `https://api-doc.test.cravnest.in`,
      description: 'OpenAPI documentation Custom Domain URL',
      exportName: `${environment}-openapi-docs-custom-url`,
    });

    new cdk.CfnOutput(this, 'OpenApiDocsBucketName', {
      value: docs.bucket.bucketName,
      description: 'OpenAPI Docs S3 Bucket Name',
      exportName: `${environment}-openapi-docs-bucket-name`,
    });

    new cdk.CfnOutput(this, 'OpenApiDocsDistributionId', {
      value: docs.distribution.distributionId,
      description: 'OpenAPI Docs CloudFront Distribution ID',
      exportName: `${environment}-openapi-docs-distribution-id`,
    });

    new cdk.CfnOutput(this, 'AdminUserPoolId', {
      value: auth.adminUserPool.userPoolId,
      description: 'Admin Cognito User Pool ID',
      exportName: `${environment}-admin-user-pool-id`,
    });

    new cdk.CfnOutput(this, 'AdminUserPoolClientId', {
      value: auth.adminUserPoolClient.userPoolClientId,
      description: 'Admin Cognito App Client ID',
      exportName: `${environment}-admin-user-pool-client-id`,
    });

    new cdk.CfnOutput(this, 'CustomerUserPoolId', {
      value: auth.customerUserPool.userPoolId,
      description: 'Customer Cognito User Pool ID',
      exportName: `${environment}-customer-user-pool-id`,
    });

    new cdk.CfnOutput(this, 'CustomerUserPoolClientId', {
      value: auth.customerUserPoolClient.userPoolClientId,
      description: 'Customer Cognito App Client ID',
      exportName: `${environment}-customer-user-pool-client-id`,
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS Region',
    });
  }
}
