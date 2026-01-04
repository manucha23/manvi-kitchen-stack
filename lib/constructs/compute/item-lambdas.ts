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
}

export class ItemLambdas extends Construct {
  public readonly itemFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ItemLambdasProps) {
    super(scope, id);

    this.itemFunction = new lambda.Function(this, 'ItemHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/items', {
        bundling: {
          image: lambda.Runtime.NODEJS_22_X.bundlingImage,
          command: [
            'bash', '-c',
            'npm ci && npm run build && cp -r dist/* /asset-output/ && cp package*.json /asset-output/'
          ],
        },
      }),
      environment: { 
        ITEM_TABLE: props.itemTable.tableName,
        IMAGE_BUCKET: props.imageBucket.bucketName,
        IMAGE_CLOUDFRONT_DOMAIN: props.imageDistribution.distributionDomainName
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Grant permissions
    props.itemTable.grantReadWriteData(this.itemFunction);
    props.imageBucket.grantReadWrite(this.itemFunction);
  }
}