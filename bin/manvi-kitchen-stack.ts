#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { ManviKitchenStackStack } from '../lib/manvi-kitchen-stack-stack';

// Build all lambdas before CDK synthesizes/deploys
const lambdas = ['order-create', 'order-get', 'order-list', 'order-update', 'order-delete'];
const rootPath = resolve(__dirname, '..');

console.log('Building lambdas...');
for (const lambda of lambdas) {
  try {
    const lambdaPath = resolve(rootPath, 'lambda', lambda);
    console.log(`Building ${lambda}...`);
    execSync('npm install && npm run build', { cwd: lambdaPath, stdio: 'inherit' });
  } catch (err) {
    console.error(`Failed to build ${lambda}`);
    throw err;
  }
}

const app = new cdk.App();
new ManviKitchenStackStack(app, 'ManviKitchenStackStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});