import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { nodeJs24Runtime } from './node-runtime';

export interface WhatsAppNotificationLambdaProps {
  environment: string;
  notificationQueue: sqs.IQueue;
  templateTable: dynamodb.ITable;
  parameterPrefix: string;
  logRetentionDays?: logs.RetentionDays;
}

export class WhatsAppNotificationLambda extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: WhatsAppNotificationLambdaProps) {
    super(scope, id);

    const logGroup = new logs.LogGroup(this, 'WhatsAppNotificationHandlerLogGroup', {
      retention: props.logRetentionDays ?? logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.function = new lambda.Function(this, 'WhatsAppNotificationHandler', {
      runtime: nodeJs24Runtime,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/whatsapp-notification', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: {
        ENVIRONMENT: props.environment,
        WHATSAPP_ACCESS_TOKEN_PARAM: `${props.parameterPrefix}/access-token`,
        WHATSAPP_PHONE_NUMBER_ID_PARAM: `${props.parameterPrefix}/phone-number-id`,
        WHATSAPP_GRAPH_API_VERSION: 'v25.0',
        WHATSAPP_TEMPLATE_TABLE: props.templateTable.tableName,
        WHATSAPP_TEMPLATE_LANGUAGE: 'en',
      },
      timeout: cdk.Duration.seconds(30),
      logGroup,
    });

    props.templateTable.grantReadData(this.function);
    props.notificationQueue.grantConsumeMessages(this.function);

    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${props.parameterPrefix}/*`,
        ],
      })
    );

    this.function.addEventSource(
      new lambdaEventSources.SqsEventSource(props.notificationQueue, {
        batchSize: 1,
      })
    );
  }
}
