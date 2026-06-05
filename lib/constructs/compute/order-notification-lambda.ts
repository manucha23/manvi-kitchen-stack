import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface OrderNotificationLambdaProps {
  connectionTable: dynamodb.Table;
  orderEventsTopic: sns.Topic;
}

export class OrderNotificationLambda extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: OrderNotificationLambdaProps) {
    super(scope, id);

    this.function = new lambda.Function(this, 'OrderNotificationHandler', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/order-notifications', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: {
        CONNECTION_TABLE: props.connectionTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    props.connectionTable.grantReadWriteData(this.function);
    props.orderEventsTopic.addSubscription(new snsSubscriptions.LambdaSubscription(this.function));

    this.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: ['*'],
    }));
  }
}
