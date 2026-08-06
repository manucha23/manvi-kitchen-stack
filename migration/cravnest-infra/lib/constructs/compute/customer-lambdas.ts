import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { nodeJs24Runtime } from './node-runtime';

export interface CustomerLambdasProps {
  customerProfileTable: dynamodb.ITable;
  allowedOrigins?: string;
  logRetentionDays?: logs.RetentionDays;
}

export class CustomerLambdas extends Construct {
  public readonly customerFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: CustomerLambdasProps) {
    super(scope, id);

    const logGroup = new logs.LogGroup(this, 'CustomerHandlerLogGroup', {
      retention: props.logRetentionDays ?? logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.customerFunction = new lambda.Function(this, 'CustomerHandler', {
      runtime: nodeJs24Runtime,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/customers', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: {
        CUSTOMER_PROFILE_TABLE: props.customerProfileTable.tableName,
        ALLOWED_ORIGIN: props.allowedOrigins || '*',
      },
      timeout: cdk.Duration.seconds(30),
      logGroup,
    });

    props.customerProfileTable.grantReadWriteData(this.customerFunction);
  }
}
