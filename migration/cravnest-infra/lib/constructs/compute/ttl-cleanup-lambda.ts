import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export interface TtlCleanupLambdaProps {
  inventoryTable: dynamodb.Table;
  slotAvailabilityTable: dynamodb.Table;
}

export class TtlCleanupLambda extends Construct {
  public readonly function: lambda.Function;
  public readonly liveAlias: lambda.Alias;

  constructor(scope: Construct, id: string, props: TtlCleanupLambdaProps) {
    super(scope, id);

    this.function = new lambda.Function(this, 'TtlCleanupHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(
        'exports.handler = async () => ({ statusCode: 503, body: JSON.stringify({ message: "Service not yet deployed" }) });'
      ),
      environment: {
        SLOT_AVAILABILITY_TABLE: props.slotAvailabilityTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    const initialVersion = this.function.currentVersion;

    this.liveAlias = new lambda.Alias(this, 'LiveAlias', {
      aliasName: 'LIVE',
      version: initialVersion,
      description: 'Stable production traffic alias',
    });

    props.slotAvailabilityTable.grantReadWriteData(this.function);

    this.function.addEventSource(new lambdaEventSources.DynamoEventSource(props.inventoryTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      filters: [
        lambda.FilterCriteria.filter({
          eventName: lambda.FilterRule.isEqual('REMOVE'),
          userIdentity: {
            type: lambda.FilterRule.isEqual('Service'),
            principalId: lambda.FilterRule.isEqual('dynamodb.amazonaws.com'),
          },
        }),
      ],
    }));
  }
}
