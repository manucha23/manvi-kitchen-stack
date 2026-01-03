import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { OrderDatabase } from './constructs/database/order-database';
import { CognitoAuth } from './constructs/auth/cognito-auth';
import { OrderLambdas } from './constructs/compute/order-lambdas';
import { OrderApi } from './constructs/api/order-api';
import { FrontendHosting } from './constructs/frontend/frontend-hosting';

interface ManviKitchenStackProps extends cdk.StackProps {
  environment: string;
}

export class ManviKitchenStackStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ManviKitchenStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Create constructs
    const database = new OrderDatabase(this, 'Database');
    const auth = new CognitoAuth(this, 'Auth', { environment });
    const lambdas = new OrderLambdas(this, 'Lambdas', {
      orderTable: database.table,
    });
    const frontend = new FrontendHosting(this, 'Frontend', { environment });
    const api = new OrderApi(this, 'Api', {
      functions: lambdas.functions,
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
