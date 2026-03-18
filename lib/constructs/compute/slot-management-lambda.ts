import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

export interface SlotManagementLambdaProps {
  itemTable: dynamodb.Table;
  slotAvailabilityTable: dynamodb.Table;
}

export class SlotManagementLambda extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: SlotManagementLambdaProps) {
    super(scope, id);

    this.function = new lambda.Function(this, 'SlotManagementHandler', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/slot-management', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: {
        ITEM_TABLE: props.itemTable.tableName,
        SLOT_AVAILABILITY_TABLE: props.slotAvailabilityTable.tableName,
      },
      timeout: cdk.Duration.minutes(5),
    });

    props.itemTable.grantReadData(this.function);
    props.slotAvailabilityTable.grantReadWriteData(this.function);

    // EventBridge rule: Every Monday at 00:00 UTC
    const rule = new events.Rule(this, 'WeeklySlotOpeningRule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '0',
        weekDay: 'MON',
      }),
    });

    rule.addTarget(new targets.LambdaFunction(this.function));
  }
}
