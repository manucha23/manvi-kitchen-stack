import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class InventoryDatabase extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'InventoryTable', {
      partitionKey: { name: 'slotKey', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'blockId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
      stream: dynamodb.StreamViewType.OLD_IMAGE,
    });

    // GSI for querying blocks by orderId
    this.table.addGlobalSecondaryIndex({
      indexName: 'orderId-index',
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
    });
  }
}
