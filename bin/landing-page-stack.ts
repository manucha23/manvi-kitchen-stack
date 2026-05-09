#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { LandingPageHosting } from '../lib/constructs/frontend/landing-page-hosting';

class LandingPageStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: cdk.StackProps & { environment: string }) {
    super(scope, id, props);

    const { environment } = props;

    // Hosted Zone
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: 'Z074094923I5W07YNSBUX',
      zoneName: 'cravnest.in',
    });

    // CloudFront certificate ARN from us-east-1 (hardcoded per environment in cdk.context.json)
    const cloudfrontCertificateArn =
      this.node.tryGetContext(`cloudFrontCertificateArn:${environment}`) ??
      this.node.tryGetContext('cloudFrontCertificateArn');

    let cloudfrontCertificate: acm.ICertificate | undefined;
    if (cloudfrontCertificateArn) {
      cloudfrontCertificate = acm.Certificate.fromCertificateArn(this, 'CloudFrontCertificate', cloudfrontCertificateArn);
    }

    // Landing Page Hosting for www.cravnest.in and www.test.cravnest.in
    const landingPage = new LandingPageHosting(this, 'LandingPage', {
      environment,
      certificate: cloudfrontCertificate,
      domainName: 'www.cravnest.in',
      additionalDomains: ['www.test.cravnest.in'],
    });

    // DNS for www.cravnest.in
    new route53.ARecord(this, 'WwwDns', {
      zone: hostedZone,
      recordName: 'www.cravnest.in',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(landingPage.distribution)),
    });

    // DNS for www.test.cravnest.in (same distribution)
    new route53.ARecord(this, 'WwwTestDns', {
      zone: hostedZone,
      recordName: 'www.test.cravnest.in',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(landingPage.distribution)),
    });

    // Redirect for cravnest.in
    const redirectBucketCravnest = new s3.Bucket(this, 'RedirectBucketCravnest', {
      bucketName: `manvi-kitchen-redirect-cravnest-${environment}-${cdk.Aws.ACCOUNT_ID}`,
      websiteRedirect: {
        hostName: 'www.cravnest.in',
        protocol: s3.RedirectProtocol.HTTPS,
      },
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const redirectDistributionCravnest = new cloudfront.Distribution(this, 'RedirectDistributionCravnest', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(`${redirectBucketCravnest.bucketName}.s3-website.${this.region}.amazonaws.com`),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: ['cravnest.in'],
      certificate: cloudfrontCertificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
    });

    new route53.ARecord(this, 'CravnestDns', {
      zone: hostedZone,
      recordName: 'cravnest.in',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(redirectDistributionCravnest)),
    });

    // Redirect for test.cravnest.in → www.test.cravnest.in
    const redirectBucketTest = new s3.Bucket(this, 'RedirectBucketTest', {
      bucketName: `manvi-kitchen-redirect-test-${environment}-${cdk.Aws.ACCOUNT_ID}`,
      websiteRedirect: {
        hostName: 'www.test.cravnest.in',
        protocol: s3.RedirectProtocol.HTTPS,
      },
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const redirectDistributionTest = new cloudfront.Distribution(this, 'RedirectDistributionTest', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(`${redirectBucketTest.bucketName}.s3-website.${this.region}.amazonaws.com`),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: ['test.cravnest.in'],
      certificate: cloudfrontCertificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
    });

    new route53.ARecord(this, 'TestDns', {
      zone: hostedZone,
      recordName: 'test.cravnest.in',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(redirectDistributionTest)),
    });

    // Outputs
    new cdk.CfnOutput(this, 'LandingPageUrl', {
      value: `https://${landingPage.distribution.distributionDomainName}`,
      description: 'Landing Page CloudFront URL',
      exportName: `${environment}-landing-page-url`,
    });

    new cdk.CfnOutput(this, 'LandingPageCustomUrl', {
      value: 'https://www.cravnest.in',
      description: 'Landing Page Custom Domain URL',
      exportName: `${environment}-landing-page-custom-url`,
    });

    new cdk.CfnOutput(this, 'LandingPageBucketName', {
      value: landingPage.bucket.bucketName,
      description: 'Landing Page S3 Bucket Name',
      exportName: `${environment}-landing-page-bucket-name`,
    });

    new cdk.CfnOutput(this, 'LandingPageDistributionId', {
      value: landingPage.distribution.distributionId,
      description: 'Landing Page CloudFront Distribution ID',
      exportName: `${environment}-landing-page-distribution-id`,
    });

    new cdk.CfnOutput(this, 'RedirectCravnestDistributionId', {
      value: redirectDistributionCravnest.distributionId,
      description: 'Redirect Distribution ID for cravnest.in',
      exportName: `${environment}-redirect-cravnest-distribution-id`,
    });

    new cdk.CfnOutput(this, 'RedirectTestDistributionId', {
      value: redirectDistributionTest.distributionId,
      description: 'Redirect Distribution ID for test.cravnest.in',
      exportName: `${environment}-redirect-test-distribution-id`,
    });
  }
}

const app = new cdk.App();
const environment = app.node.tryGetContext('environment') || 'test';

new LandingPageStack(app, `LandingPageStack-${environment}`, {
  environment,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
});