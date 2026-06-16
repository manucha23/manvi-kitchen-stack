import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface SessionDatabaseProps {
  environment: string;
}

export class SessionDatabase extends Construct {
  public readonly table: dynamodb.Table;
  public readonly tokenKey: kms.Key;

  constructor(scope: Construct, id: string, props: SessionDatabaseProps) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'SessionTable', {
      tableName: `manvi-kitchen-sessions-${props.environment}`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.tokenKey = new kms.Key(this, 'SessionTokenKey', {
      alias: `alias/manvi-kitchen-session-tokens-${props.environment}`,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
