import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface WhatsAppTemplateDatabaseProps {
  environment: string;
}

export class WhatsAppTemplateDatabase extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: WhatsAppTemplateDatabaseProps) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'WhatsAppTemplateTable', {
      partitionKey: { name: 'eventKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      tableName: `manvi-kitchen-whatsapp-templates-${props.environment}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
