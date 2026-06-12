import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';
import { Construct } from 'constructs';

export interface OrderAuditLambdaProps {
  orderTable: dynamodb.Table;
  orderHistoryTable: dynamodb.Table;
}

export class OrderAuditLambda extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: OrderAuditLambdaProps) {
    super(scope, id);

    this.function = new lambdaNodejs.NodejsFunction(this, 'OrderAuditHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../../lambda/order-audit/src/index.ts'),
      handler: 'handler',
      bundling: {
        minify: true,
        target: 'node22',
      },
      environment: {
        ORDER_HISTORY_TABLE: props.orderHistoryTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    props.orderHistoryTable.grantWriteData(this.function);

    this.function.addEventSource(new lambdaEventSources.DynamoEventSource(props.orderTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      filters: [
        lambda.FilterCriteria.filter({
          eventName: lambda.FilterRule.isEqual('INSERT')
        }),
        lambda.FilterCriteria.filter({
          eventName: lambda.FilterRule.isEqual('MODIFY')
        })
      ]
    }));
  }
}
