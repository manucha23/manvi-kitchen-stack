import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { createLambdaLogGroup } from './log-retention';

export interface CartMaintenanceLambdaProps {
  customerProfileTable: dynamodb.ITable;
  cartTable: dynamodb.ITable;
  cartEventTable: dynamodb.ITable;
  itemTable: dynamodb.ITable;
  orderLimitsConfigTable: dynamodb.ITable;
  nodeRuntime: lambda.Runtime;
  logRetention?: logs.RetentionDays;
}

export const createCartMaintenanceLambda = (
  scope: Construct,
  props: CartMaintenanceLambdaProps,
): lambda.Function => {
  const maintenanceFunction = new lambda.Function(scope, 'CartMaintenance', {
    runtime: props.nodeRuntime,
    handler: 'dist/index.handler',
    code: lambda.Code.fromAsset('lambda/cart-maintenance', {
      exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
    }),
    environment: {
      CUSTOMER_PROFILE_TABLE: props.customerProfileTable.tableName,
      CART_TABLE: props.cartTable.tableName,
      CART_EVENT_TABLE: props.cartEventTable.tableName,
      ITEM_TABLE: props.itemTable.tableName,
      ORDER_LIMITS_CONFIG_TABLE: props.orderLimitsConfigTable.tableName,
    },
    timeout: cdk.Duration.seconds(60),
    logGroup: createLambdaLogGroup(scope, 'CartMaintenanceLogGroup', props.logRetention),
  });

  props.customerProfileTable.grantReadWriteData(maintenanceFunction);
  props.cartTable.grantReadWriteData(maintenanceFunction);
  props.cartEventTable.grantReadWriteData(maintenanceFunction);
  props.itemTable.grantReadData(maintenanceFunction);
  props.orderLimitsConfigTable.grantReadData(maintenanceFunction);

  new events.Rule(scope, 'DailyCartMaintenanceSchedule', {
    schedule: events.Schedule.cron({
      minute: '30',
      hour: '20',
    }),
    targets: [new targets.LambdaFunction(maintenanceFunction)],
  });

  return maintenanceFunction;
};
