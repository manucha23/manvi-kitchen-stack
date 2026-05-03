import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';

export interface ItemLambdasProps {
  itemTable: dynamodb.Table;
  imageBucket: s3.Bucket;
  imageDistribution: cloudfront.Distribution;
  orderLimitsConfigTable: dynamodb.Table;
}

export class ItemLambdas extends Construct {
  public readonly itemFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ItemLambdasProps) {
    super(scope, id);

    this.itemFunction = new lambda.Function(this, 'ItemHandler', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/items', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: { 
        ITEM_TABLE: props.itemTable.tableName,
        IMAGE_BUCKET: props.imageBucket.bucketName,
        IMAGE_CLOUDFRONT_DOMAIN: props.imageDistribution.distributionDomainName,
        ORDER_LIMITS_CONFIG_TABLE: props.orderLimitsConfigTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    props.itemTable.grantReadWriteData(this.itemFunction);
    props.imageBucket.grantReadWrite(this.itemFunction);
    props.orderLimitsConfigTable.grantReadData(this.itemFunction);
  }
}