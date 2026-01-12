import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class OrderDatabase extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'OrderTable', {
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // GSI temporarily removed to allow CloudFormation to drop the old GSI. Re-add after deploy.
    // this.table.addGlobalSecondaryIndex({
    //   indexName: 'orderStatus-slotDate-index-v2',
    //   partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
    //   sortKey: { name: 'slotDate', type: dynamodb.AttributeType.STRING },
    // });
  }
}