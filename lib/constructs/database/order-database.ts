import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class OrderDatabase extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'OrderTableV2', {
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // GSI 1: Customer order history sorted by creation time
    this.table.addGlobalSecondaryIndex({
      indexName: 'customerPhone-createdAt-index',
      partitionKey: { name: 'customerPhone', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // GSI 2: Orders by status sorted by creation time
    this.table.addGlobalSecondaryIndex({
      indexName: 'status-createdAt-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // GSI 3: Orders by date and slot type
    this.table.addGlobalSecondaryIndex({
      indexName: 'slotDate-slot-index',
      partitionKey: { name: 'slotDate', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'slot', type: dynamodb.AttributeType.STRING },
    });
  }
}