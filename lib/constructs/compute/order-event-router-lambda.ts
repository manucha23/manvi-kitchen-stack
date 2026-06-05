import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export interface OrderEventRouterLambdaProps {
  orderTable: dynamodb.Table;
  orderEventsTopic: sns.Topic;
}

export class OrderEventRouterLambda extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: OrderEventRouterLambdaProps) {
    super(scope, id);

    this.function = new lambda.Function(this, 'OrderEventRouterHandler', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/order-event-router', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: {
        ORDER_EVENTS_TOPIC_ARN: props.orderEventsTopic.topicArn,
      },
      timeout: cdk.Duration.seconds(30),
    });

    props.orderEventsTopic.grantPublish(this.function);

    this.function.addEventSource(new lambdaEventSources.DynamoEventSource(props.orderTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      filters: [
        lambda.FilterCriteria.filter({
          eventName: lambda.FilterRule.isEqual('INSERT'),
        }),
        lambda.FilterCriteria.filter({
          eventName: lambda.FilterRule.isEqual('MODIFY'),
        }),
      ],
    }));
  }
}
