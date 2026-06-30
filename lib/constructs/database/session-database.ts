import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface SessionDatabaseProps {
  environment: string;
}

export class SessionDatabase extends Construct {
  public readonly table: dynamodb.Table;
  public readonly tokenKeyParameterPrefix: string;
  public readonly activeTokenKeyVersion = 'v1';

  constructor(scope: Construct, id: string, props: SessionDatabaseProps) {
    super(scope, id);

    this.tokenKeyParameterPrefix = `/manvi-kitchen/${props.environment}/admin-session-token-key`;

    this.table = new dynamodb.Table(this, 'SessionTable', {
      tableName: `manvi-kitchen-sessions-${props.environment}`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
