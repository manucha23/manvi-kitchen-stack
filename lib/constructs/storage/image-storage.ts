import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';

export interface ImageStorageProps {
  environment: string;
  hostedZone?: route53.IHostedZone;
}

export class ImageStorage extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: ImageStorageProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'ImageBucket', {
      bucketName: `manvi-kitchen-images-${props.environment}-${cdk.Aws.ACCOUNT_ID}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    this.distribution = new cloudfront.Distribution(this, 'ImageDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
    });

    // Add DNS record for images domain if hosted zone is provided
    if (props.hostedZone) {
      const imageDomain = `images.${props.environment === 'prod' ? 'cravnest.in' : `${props.environment}.cravnest.in`}`;
      new route53.ARecord(this, 'ImageDns', {
        zone: props.hostedZone,
        recordName: imageDomain,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
      });
    }
  }
}