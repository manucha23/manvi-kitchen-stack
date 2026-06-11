import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface ImageStorageProps {
  environment: string;
  allowedOrigins?: string[];
  hostedZone?: route53.IHostedZone;
  certificate?: acm.ICertificate;
  geoRestriction?: cloudfront.GeoRestriction;
}

export class ImageStorage extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly pendingBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: ImageStorageProps) {
    super(scope, id);

    const allowedOrigins = props.allowedOrigins?.length ? props.allowedOrigins : ['*'];

    this.pendingBucket = new s3.Bucket(this, 'PendingImageUploadBucket', {
      bucketName: `manvi-kitchen-pending-images-${props.environment}-${cdk.Aws.ACCOUNT_ID}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.POST],
          allowedOrigins,
          allowedHeaders: ['Content-Type', 'x-amz-*'],
          maxAge: 300,
        },
      ],
    });

    this.bucket = new s3.Bucket(this, 'ImageBucket', {
      bucketName: `manvi-kitchen-images-${props.environment}-${cdk.Aws.ACCOUNT_ID}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins,
          allowedHeaders: ['Content-Type'],
          maxAge: 3000,
        },
      ],
    });

    const distributionConfig: any = {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      geoRestriction: props.geoRestriction,
    };

    // Add custom domain and certificate if provided
    if (props.certificate && props.hostedZone) {
      const imageDomain = `images.${props.environment === 'prod' ? 'cravnest.in' : `${props.environment}.cravnest.in`}`;
      distributionConfig.domainNames = [imageDomain];
      distributionConfig.certificate = props.certificate;
    }

    this.distribution = new cloudfront.Distribution(this, 'ImageDistribution', distributionConfig);

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
