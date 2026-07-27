import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import * as path from 'path';

export interface OrderAuditLambdaProps {
  orderTable: dynamodb.Table;
  orderHistoryTable: dynamodb.Table;
  nodeRuntime?: lambda.Runtime;
}

export class OrderAuditLambda extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: OrderAuditLambdaProps) {
    super(scope, id);

    this.function = new NodejsFunction(this, 'OrderAuditHandler', {
      entry: path.join(__dirname, '../../../lambda/order-audit/src/index.ts'),
      handler: 'handler',
      runtime: props.nodeRuntime ?? lambda.Runtime.NODEJS_20_X,
      environment: {
        ORDER_HISTORY_TABLE: props.orderHistoryTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      bundling: {
        minify: true,
        sourceMap: false,
        externalModules: ['@aws-sdk/*'],
      },
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

