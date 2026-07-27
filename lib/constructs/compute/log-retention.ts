import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export const logRetentionForEnvironment = (environment?: string): logs.RetentionDays =>
  logs.RetentionDays.ONE_MONTH;

export const createLambdaLogGroup = (
  scope: Construct,
  id: string,
  retention?: logs.RetentionDays,
): logs.LogGroup | undefined =>
  retention ? new logs.LogGroup(scope, id, { retention }) : undefined;
