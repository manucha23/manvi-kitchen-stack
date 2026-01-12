import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

interface InventoryCleanupProps {
  cleanupLambda: lambda.Function;
}

export class InventoryCleanupStateMachine extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: InventoryCleanupProps) {
    super(scope, id);

    // Wait for 15 minutes
    const wait = new sfn.Wait(this, 'Wait15Minutes', {
      time: sfn.WaitTime.duration(cdk.Duration.minutes(15))
    });

    // Call cleanup lambda to check order status and restore if needed
    const checkAndCleanup = new tasks.LambdaInvoke(this, 'CheckAndCleanup', {
      lambdaFunction: props.cleanupLambda,
      resultPath: '$.cleanupResult'
    });

    // Success state
    const success = new sfn.Succeed(this, 'Success');

    // Define workflow: Wait 15 min -> Check order -> Restore if needed
    const definition = wait.next(checkAndCleanup).next(success);

    this.stateMachine = new sfn.StateMachine(this, 'StateMachine', {
      definition,
      timeout: cdk.Duration.minutes(20)
    });
  }
}
