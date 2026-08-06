#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CravnestInfraStack } from '../lib/cravnest-infra-stack';

const app = new cdk.App();
const environment = app.node.tryGetContext('environment') || 'test';

new CravnestInfraStack(app, `CravnestInfra-${environment}`, {
  environment,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
