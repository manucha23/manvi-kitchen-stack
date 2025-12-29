#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ManviKitchenStackStack } from '../lib/manvi-kitchen-stack-stack';

const app = new cdk.App();
const environment = app.node.tryGetContext('environment') || 'test';

new ManviKitchenStackStack(app, `ManviKitchenStack-${environment}`, {
  environment,
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});