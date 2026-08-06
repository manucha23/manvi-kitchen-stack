import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
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

interface CravnestInfraStackProps extends cdk.StackProps {
  environment: string;
}

export class CravnestInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CravnestInfraStackProps) {
    super(scope, id, props);

    const { environment } = props;
    const ssmPrefix = `/cravnest/${environment}`;

    // ── Databases ────────────────────────────────────────────────────────────
    const orderdatabase = new OrderDatabase(this, 'Database');
    const itemdatabase = new ItemDatabase(this, 'ItemDatabase');
    const inventorydatabase = new InventoryDatabase(this, 'InventoryDatabase');
    const slotAvailability = new SlotAvailabilityDatabase(this, 'SlotAvailability');
    const orderHistory = new OrderHistoryDatabase(this, 'OrderHistory');

    // ── Auth ─────────────────────────────────────────────────────────────────
    const auth = new CognitoAuth(this, 'Auth', { environment });

    // ── Storage ──────────────────────────────────────────────────────────────
    const imageStorage = new ImageStorage(this, 'ImageStorage', { environment });

    // ── Frontend hosting ─────────────────────────────────────────────────────
    const frontend = new FrontendHosting(this, 'Frontend', { environment });

    // ── Compute (Lambda functions + LIVE aliases) ─────────────────────────────
    const lambdas = new OrderLambdas(this, 'Lambdas', {
      orderTable: orderdatabase.table,
      inventoryTable: inventorydatabase.table,
      itemTable: itemdatabase.table,
      slotAvailabilityTable: slotAvailability.table,
      orderHistoryTable: orderHistory.table,
    });

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

    // ── API Gateway (wired to LIVE aliases) ───────────────────────────────────
    const api = new OrderApi(this, 'Api', {
      orderAlias: lambdas.liveAlias,
      itemAlias: itemLambdas.liveAlias,
      userPool: auth.userPool,
      environment,
      cloudfrontDomainName: frontend.distribution.distributionDomainName,
    });

    // ── SSM Parameters ────────────────────────────────────────────────────────
    // Infrastructure outputs — read by cravnest-services and cravnest-frontend
    new ssm.StringParameter(this, 'SsmApiUrl', {
      parameterName: `${ssmPrefix}/api-url`,
      stringValue: api.api.url,
      description: 'API Gateway invoke URL',
    });

    new ssm.StringParameter(this, 'SsmUserPoolId', {
      parameterName: `${ssmPrefix}/user-pool-id`,
      stringValue: auth.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new ssm.StringParameter(this, 'SsmUserPoolClientId', {
      parameterName: `${ssmPrefix}/user-pool-client-id`,
      stringValue: auth.userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID',
    });

    new ssm.StringParameter(this, 'SsmFrontendBucket', {
      parameterName: `${ssmPrefix}/frontend-bucket-name`,
      stringValue: frontend.bucket.bucketName,
      description: 'Frontend S3 bucket name',
    });

    new ssm.StringParameter(this, 'SsmFrontendDistribution', {
      parameterName: `${ssmPrefix}/frontend-distribution-id`,
      stringValue: frontend.distribution.distributionId,
      description: 'Frontend CloudFront distribution ID',
    });

    new ssm.StringParameter(this, 'SsmImageBucket', {
      parameterName: `${ssmPrefix}/image-bucket-name`,
      stringValue: imageStorage.bucket.bucketName,
      description: 'Image S3 bucket name',
    });

    // Lambda function names — read by cravnest-services pipelines
    new ssm.StringParameter(this, 'SsmOrdersFn', {
      parameterName: `${ssmPrefix}/lambda/orders/function-name`,
      stringValue: lambdas.orderFunction.functionName,
      description: 'Orders Lambda function name',
    });

    new ssm.StringParameter(this, 'SsmItemsFn', {
      parameterName: `${ssmPrefix}/lambda/items/function-name`,
      stringValue: itemLambdas.itemFunction.functionName,
      description: 'Items Lambda function name',
    });

    new ssm.StringParameter(this, 'SsmSlotMgmtFn', {
      parameterName: `${ssmPrefix}/lambda/slot-management/function-name`,
      stringValue: slotManagement.function.functionName,
      description: 'Slot Management Lambda function name',
    });

    new ssm.StringParameter(this, 'SsmTtlCleanupFn', {
      parameterName: `${ssmPrefix}/lambda/ttl-cleanup/function-name`,
      stringValue: ttlCleanup.function.functionName,
      description: 'TTL Cleanup Lambda function name',
    });

    new ssm.StringParameter(this, 'SsmOrderAuditFn', {
      parameterName: `${ssmPrefix}/lambda/order-audit/function-name`,
      stringValue: orderAudit.function.functionName,
      description: 'Order Audit Lambda function name',
    });

    // ── CloudFormation Outputs ────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${frontend.distribution.distributionDomainName}`,
      description: 'Frontend CloudFront URL',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: auth.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: auth.userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID',
    });
  }
}
