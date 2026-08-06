import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class CustomerProfileDatabase extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: { environment: string }) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'CustomerProfileTable', {
      partitionKey: { name: 'phoneNumber', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      tableName: `manvi-kitchen-customer-profiles-${props.environment}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
