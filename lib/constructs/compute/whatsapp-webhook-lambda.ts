import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface WhatsAppWebhookLambdaProps {
  environment: string;
}

export class WhatsAppWebhookLambda extends Construct {
  public readonly webhookFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: WhatsAppWebhookLambdaProps) {
    super(scope, id);

    const parameterPrefix = `/manvi-kitchen/${props.environment}/whatsapp`;

    this.webhookFunction = new lambda.Function(this, 'WhatsAppWebhookHandler', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/whatsapp-webhook', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: {
        ENVIRONMENT: props.environment,
        WHATSAPP_VERIFY_TOKEN_PARAM: `${parameterPrefix}/verify-token`,
        WHATSAPP_APP_SECRET_PARAM: `${parameterPrefix}/app-secret`,
      },
      reservedConcurrentExecutions: 10,
      timeout: cdk.Duration.seconds(10),
    });

    this.webhookFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter${parameterPrefix}/*`,
      ],
    }));
  }
}
