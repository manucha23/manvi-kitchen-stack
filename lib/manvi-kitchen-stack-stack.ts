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
    
    const lambdas = new OrderLambdas(this, 'Lambdas', {
      orderTable: orderDatabase.table,
      itemTable: itemDatabase.table,
      orderHistoryTable: orderHistory.table,
      orderLimitsConfigTable: orderLimitsConfig.table,
      itemOrderCountTable: itemOrderCount.table,
    });
    
    const imageStorage = new ImageStorage(this, 'ImageStorage', { environment });
    const itemLambdas = new ItemLambdas(this, 'ItemLambdas', {
      itemTable: itemDatabase.table,
      imageBucket: imageStorage.bucket,
      imageDistribution: imageStorage.distribution,
      orderLimitsConfigTable: orderLimitsConfig.table,
    });
    
    const orderAudit = new OrderAuditLambda(this, 'OrderAudit', {
      orderTable: orderDatabase.table,
      orderHistoryTable: orderHistory.table,
    });
    
    const adminLambdas = new AdminLambdas(this, 'AdminLambdas', {
      orderLimitsConfigTable: orderLimitsConfig.table,
    });
    
    const frontend = new FrontendHosting(this, 'Frontend', { environment });
    const docs = new OpenApiHosting(this, 'OpenApiDocs', { environment });
    const api = new OrderApi(this, 'Api', {
      orderFunction: lambdas.orderFunction,
      itemFunction: itemLambdas.itemFunction,
      adminFunction: adminLambdas.adminFunction,
      userPool: auth.userPool,
      environment,
      cloudfrontDomainName: frontend.distribution.distributionDomainName,
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.api.url,
      description: 'API Gateway URL',
      exportName: `${environment}-api-url`,
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${frontend.distribution.distributionDomainName}`,
      description: 'Frontend CloudFront URL',
      exportName: `${environment}-frontend-url`,
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
