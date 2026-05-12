import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { OrderDatabase } from './constructs/database/order-database';
import { ItemDatabase } from './constructs/database/item-database';
import { OrderHistoryDatabase } from './constructs/database/order-history-database';
import { OrderLimitsConfigDatabase } from './constructs/database/order-limits-config-database';
import { ItemOrderCountDatabase } from './constructs/database/item-order-count-database';
import { ImageStorage } from './constructs/storage/image-storage';
import { CognitoAuth } from './constructs/auth/cognito-auth';
import { OrderLambdas } from './constructs/compute/order-lambdas';
import { ItemLambdas } from './constructs/compute/item-lambdas';
import { AdminLambdas } from './constructs/compute/admin-lambdas';
import { OrderAuditLambda } from './constructs/compute/order-audit-lambda';
import { FrontendHosting } from './constructs/frontend/frontend-hosting';
import { OpenApiHosting } from './constructs/frontend/openapi-hosting';
import { OrderApi } from './constructs/api/order-api';
import { Route53HostedZone } from './constructs/dns/route53-hosted-zone';
import { AcmCertificates } from './constructs/certificates/acm-certificates';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';

interface ManviKitchenStackProps extends cdk.StackProps {
  environment: string;
}

export class ManviKitchenStackStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ManviKitchenStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Create constructs
    const orderDatabase = new OrderDatabase(this, 'Database');
    const itemDatabase = new ItemDatabase(this, 'ItemDatabase');
    const orderHistory = new OrderHistoryDatabase(this, 'OrderHistory');
    const orderLimitsConfig = new OrderLimitsConfigDatabase(this, 'OrderLimitsConfig');
    const itemOrderCount = new ItemOrderCountDatabase(this, 'ItemOrderCount');
    const auth = new CognitoAuth(this, 'Auth', { environment });
    
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
    
    const lambdas = new OrderLambdas(this, 'Lambdas', {
      orderTable: orderDatabase.table,
      itemTable: itemDatabase.table,
      orderHistoryTable: orderHistory.table,
      orderLimitsConfigTable: orderLimitsConfig.table,
      itemOrderCountTable: itemOrderCount.table,
      allowedOrigins: 'https://admin.test.cravnest.in',
    });
    
    const imageStorage = new ImageStorage(this, 'ImageStorage', { 
      environment,
      hostedZone: hostedZone.hostedZone,
      certificate: certificates.cloudfrontCertificate,
    });
    const itemLambdas = new ItemLambdas(this, 'ItemLambdas', {
      itemTable: itemDatabase.table,
      imageBucket: imageStorage.bucket,
      imageDistribution: imageStorage.distribution,
      orderLimitsConfigTable: orderLimitsConfig.table,
      itemOrderCountTable: itemOrderCount.table,
      imageDomain: `images.${environment === 'prod' ? 'cravnest.in' : `${environment}.cravnest.in`}`,
      allowedOrigins: 'https://admin.test.cravnest.in',
    });
    
    const orderAudit = new OrderAuditLambda(this, 'OrderAudit', {
      orderTable: orderDatabase.table,
      orderHistoryTable: orderHistory.table,
    });
    
    const adminLambdas = new AdminLambdas(this, 'AdminLambdas', {
      orderLimitsConfigTable: orderLimitsConfig.table,
      allowedOrigins: 'https://admin.test.cravnest.in',
    });
    
    const frontend = new FrontendHosting(this, 'Frontend', { 
      environment,
      certificate: certificates.cloudfrontCertificate,
      domainName: 'admin.test.cravnest.in',
    });
    const docs = new OpenApiHosting(this, 'OpenApiDocs', { 
      environment,
      certificate: certificates.cloudfrontCertificate,
      domainName: 'api-doc.test.cravnest.in',
    });
    const api = new OrderApi(this, 'Api', {
      orderFunction: lambdas.orderFunction,
      itemFunction: itemLambdas.itemFunction,
      adminFunction: adminLambdas.adminFunction,
      userPool: auth.userPool,
      environment,
      cloudfrontDomainName: frontend.distribution.distributionDomainName,
      frontendDomainName: 'admin.test.cravnest.in',
      certificate: certificates.apiCertificate,
      domainName: 'api.test.cravnest.in',
    });

    // DNS Records

    // Frontend DNS record
    new route53.ARecord(this, 'FrontendDNS', {
      zone: hostedZone.hostedZone,
      recordName: 'admin.test.cravnest.in',
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
        recordName: 'api.test.cravnest.in',
        target: route53.RecordTarget.fromAlias(new targets.ApiGatewayDomain(api.domain)),
      });
    }

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

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${frontend.distribution.distributionDomainName}`,
      description: 'Frontend CloudFront URL',
      exportName: `${environment}-frontend-url`,
    });

    new cdk.CfnOutput(this, 'FrontendCustomUrl', {
      value: `https://admin.test.cravnest.in`,
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

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: auth.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${environment}-user-pool-id`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: auth.userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID',
      exportName: `${environment}-user-pool-client-id`,
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS Region',
    });
  }
}
