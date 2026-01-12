import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface OrderCleanupLambdaProps {
  orderTable: dynamodb.Table;
  slotAvailabilityTable: dynamodb.Table;
}

export class OrderCleanupLambda extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: OrderCleanupLambdaProps) {
    super(scope, id);

    this.function = new lambda.Function(this, 'Function', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/ttl-cleanup', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: {
        ORDER_TABLE: props.orderTable.tableName,
        SLOT_AVAILABILITY_TABLE: props.slotAvailabilityTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    props.orderTable.grantReadData(this.function);
    props.slotAvailabilityTable.grantReadWriteData(this.function);
  }
}
