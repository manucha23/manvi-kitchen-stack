import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface AdminLambdasProps {
  orderLimitsConfigTable: dynamodb.Table;
  allowedOrigins?: string;
  adminGroupName: string;
}

export class AdminLambdas extends Construct {
  public readonly adminFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: AdminLambdasProps) {
    super(scope, id);

    this.adminFunction = new lambda.Function(this, 'AdminHandler', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/admin', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: { 
        ORDER_LIMITS_CONFIG_TABLE: props.orderLimitsConfigTable.tableName,
        ALLOWED_ORIGIN: props.allowedOrigins || '*',
        ADMIN_GROUP_NAME: props.adminGroupName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    props.orderLimitsConfigTable.grantReadWriteData(this.adminFunction);
  }
}
