import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import * as path from 'path';

export interface LandingPageHostingProps {
  environment: string;
  certificate?: acm.ICertificate;
  domainName?: string;
  additionalDomains?: string[];
}

export class LandingPageHosting extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: LandingPageHostingProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'LandingPageBucket', {
      bucketName: `manvi-kitchen-landing-${props.environment}-${cdk.Aws.ACCOUNT_ID}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'LandingPageSecurityHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(730),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
      },
    });

    const distributionConfig: any = {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
    };

    // Add custom domain and certificate if provided
    if (props.certificate && props.domainName) {
      const domainNames = [props.domainName];
      if (props.additionalDomains) {
        domainNames.push(...props.additionalDomains);
      }
      distributionConfig.domainNames = domainNames;
      distributionConfig.certificate = props.certificate;
    }

    this.distribution = new cloudfront.Distribution(this, 'LandingPageDistribution', distributionConfig);

    new s3deploy.BucketDeployment(this, 'LandingPageDeployment', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../../../landing-page')),
      ],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });
  }
}
