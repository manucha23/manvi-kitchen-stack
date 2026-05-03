import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class ItemOrderCountDatabase extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'ItemOrderCountTable', {
      partitionKey: { name: 'countKey', type: dynamodb.AttributeType.STRING }, // Format: itemId-slot-YYYY-MM-DD
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // GSI for querying by itemId and date
    this.table.addGlobalSecondaryIndex({
      indexName: 'itemId-date-index',
      partitionKey: { name: 'itemId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING },
    });
  }
}
