#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CloudFrontCertificate } from '../lib/constructs/certificates/cloudfront-certificate';

const app = new cdk.App();
const environment = app.node.tryGetContext('environment') || 'test';

// Deploy CloudFront certificate to us-east-1
new CloudFrontCertificate(app, `CloudFrontCertificate-${environment}`, {
  hostedZoneId: 'Z074094923I5W07YNSBUX',
  zoneName: 'cravnest.in',
  env: {
    region: 'us-east-1', // CloudFront certificates must be in us-east-1
  },
});