import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { OrderDatabase } from './constructs/database/order-database';
import { ItemDatabase } from './constructs/database/item-database';
import { InventoryDatabase } from './constructs/database/inventory-database';
import { SlotAvailabilityDatabase } from './constructs/database/slot-availability-database';
import { OrderHistoryDatabase } from './constructs/database/order-history-database';
import { ImageStorage } from './constructs/storage/image-storage';
import { CognitoAuth } from './constructs/auth/cognito-auth';
import { OrderLambdas } from './constructs/compute/order-lambdas';
import { ItemLambdas } from './constructs/compute/item-lambdas';
import { SlotManagementLambda } from './constructs/compute/slot-management-lambda';
import { TtlCleanupLambda } from './constructs/compute/ttl-cleanup-lambda';
import { OrderAuditLambda } from './constructs/compute/order-audit-lambda';
import { FrontendHosting } from './constructs/frontend/frontend-hosting';
import { OrderApi } from './constructs/api/order-api';

interface ManviKitchenStackProps extends cdk.StackProps {
  environment: string;
}

export class ManviKitchenStackStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ManviKitchenStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Create constructs
    const orderdatabase = new OrderDatabase(this, 'Database');
    const itemdatabase = new ItemDatabase(this, 'ItemDatabase');
    const inventorydatabase = new InventoryDatabase(this, 'InventoryDatabase');
    const slotAvailability = new SlotAvailabilityDatabase(this, 'SlotAvailability');
    const orderHistory = new OrderHistoryDatabase(this, 'OrderHistory');
    const auth = new CognitoAuth(this, 'Auth', { environment });
    const lambdas = new OrderLambdas(this, 'Lambdas', {
      orderTable: orderdatabase.table,
      inventoryTable: inventorydatabase.table,
      itemTable: itemdatabase.table,
      slotAvailabilityTable: slotAvailability.table,
      orderHistoryTable: orderHistory.table,
    });
    const imageStorage = new ImageStorage(this, 'ImageStorage', { environment });
    const itemLambdas = new ItemLambdas(this, 'ItemLambdas', {
      itemTable: itemdatabase.table,
      imageBucket: imageStorage.bucket,
      imageDistribution: imageStorage.distribution,
      inventoryTable: inventorydatabase.table,
      slotAvailabilityTable: slotAvailability.table,
    });
    const slotManagement = new SlotManagementLambda(this, 'SlotManagement', {
      itemTable: itemdatabase.table,
      slotAvailabilityTable: slotAvailability.table,
    });
    const ttlCleanup = new TtlCleanupLambda(this, 'TtlCleanup', {
      inventoryTable: inventorydatabase.table,
      slotAvailabilityTable: slotAvailability.table,
    });
    const orderAudit = new OrderAuditLambda(this, 'OrderAudit', {
      orderTable: orderdatabase.table,
      orderHistoryTable: orderHistory.table,
    });
    const frontend = new FrontendHosting(this, 'Frontend', { environment });
    const api = new OrderApi(this, 'Api', {
      orderFunction: lambdas.orderFunction,
      itemFunction: itemLambdas.itemFunction,
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
