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
  inventoryTable: dynamodb.Table;
  slotAvailabilityTable: dynamodb.Table;
}

export class ItemLambdas extends Construct {
  public readonly itemFunction: lambda.Function;
  public readonly liveAlias: lambda.Alias;

  constructor(scope: Construct, id: string, props: ItemLambdasProps) {
    super(scope, id);

    this.itemFunction = new lambda.Function(this, 'ItemHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(
        'exports.handler = async () => ({ statusCode: 503, body: JSON.stringify({ message: "Service not yet deployed" }) });'
      ),
      environment: {
        ITEM_TABLE: props.itemTable.tableName,
        IMAGE_BUCKET: props.imageBucket.bucketName,
        IMAGE_CLOUDFRONT_DOMAIN: props.imageDistribution.distributionDomainName,
        INVENTORY_TABLE: props.inventoryTable.tableName,
        SLOT_AVAILABILITY_TABLE: props.slotAvailabilityTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    const initialVersion = this.itemFunction.currentVersion;

    this.liveAlias = new lambda.Alias(this, 'LiveAlias', {
      aliasName: 'LIVE',
      version: initialVersion,
      description: 'Stable production traffic alias',
    });

    props.itemTable.grantReadWriteData(this.itemFunction);
    props.imageBucket.grantReadWrite(this.itemFunction);
    props.inventoryTable.grantReadData(this.itemFunction);
    props.slotAvailabilityTable.grantReadData(this.itemFunction);
  }
}
