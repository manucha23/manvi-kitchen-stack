import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { nodeJs24Runtime } from './node-runtime';

export interface ItemLambdasProps {
  itemTable: dynamodb.Table;
  imageBucket: s3.Bucket;
  pendingImageBucket: s3.Bucket;
  imageDistribution: cloudfront.Distribution;
  imageDomain: string;
  adminGroupName: string;
  allowedOrigins?: string;
  logRetentionDays?: logs.RetentionDays;
}

export class ItemLambdas extends Construct {
  public readonly itemFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ItemLambdasProps) {
    super(scope, id);

    const logGroup = new logs.LogGroup(this, 'ItemHandlerLogGroup', {
      retention: props.logRetentionDays ?? logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.itemFunction = new lambda.Function(this, 'ItemHandler', {
      runtime: nodeJs24Runtime,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/items', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: { 
        ITEM_TABLE: props.itemTable.tableName,
        IMAGE_BUCKET: props.imageBucket.bucketName,
        PENDING_IMAGE_BUCKET: props.pendingImageBucket.bucketName,
        IMAGE_DOMAIN: props.imageDomain,
        ADMIN_GROUP_NAME: props.adminGroupName,
        ALLOWED_ORIGIN: props.allowedOrigins || '*',
      },
      timeout: cdk.Duration.seconds(30),
      logGroup,
    });

    props.itemTable.grantReadWriteData(this.itemFunction);
    props.pendingImageBucket.grantPut(this.itemFunction);
  }
}
