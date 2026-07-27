import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ses from 'aws-cdk-lib/aws-ses';
import { Construct } from 'constructs';

export interface OrderInvoiceEmailLambdaProps {
  environment: string;
  orderTable: dynamodb.Table;
  hostedZone: route53.IHostedZone;
  logRetention?: logs.RetentionDays;
}

const invoiceLifecycleRules = (environment: string): s3.LifecycleRule[] => {
  if (environment === 'test') {
    return [
      {
        id: 'TestInvoiceLifecycle',
        transitions: [
          {
            storageClass: s3.StorageClass.INFREQUENT_ACCESS,
            transitionAfter: cdk.Duration.days(30),
          },
        ],
        expiration: cdk.Duration.days(180),
      },
    ];
  }

  return [
    {
      id: 'ProdInvoiceArchiveLifecycle',
      transitions: [
        {
          storageClass: s3.StorageClass.INFREQUENT_ACCESS,
          transitionAfter: cdk.Duration.days(30),
        },
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: cdk.Duration.days(90),
        },
        {
          storageClass: s3.StorageClass.DEEP_ARCHIVE,
          transitionAfter: cdk.Duration.days(365),
        },
      ],
    },
  ];
};

export class OrderInvoiceEmailLambda extends Construct {
  public readonly function: lambda.Function;
  public readonly invoiceBucket: s3.Bucket;
  public readonly emailIdentity: ses.EmailIdentity;

  constructor(scope: Construct, id: string, props: OrderInvoiceEmailLambdaProps) {
    super(scope, id);

    this.invoiceBucket = new s3.Bucket(this, 'InvoiceBucket', {
      bucketName: `manvi-kitchen-invoices-${props.environment}-${cdk.Aws.ACCOUNT_ID}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: invoiceLifecycleRules(props.environment),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.emailIdentity = new ses.EmailIdentity(this, 'CravnestEmailIdentity', {
      identity: ses.Identity.publicHostedZone(props.hostedZone),
    });

    this.function = new lambda.Function(this, 'OrderInvoiceEmailHandler', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/order-invoice-email', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: {
        ORDER_TABLE: props.orderTable.tableName,
        INVOICE_BUCKET: this.invoiceBucket.bucketName,
        FROM_EMAIL: 'noreply@cravnest.in',
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logRetention: props.logRetention,
    });

    this.invoiceBucket.grantPut(this.function);
    props.orderTable.grantReadWriteData(this.function);
    this.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: [
        `arn:${cdk.Aws.PARTITION}:ses:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:identity/cravnest.in`,
      ],
    }));

    this.function.addEventSource(new lambdaEventSources.DynamoEventSource(props.orderTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      retryAttempts: 2,
      filters: [
        lambda.FilterCriteria.filter({
          eventName: lambda.FilterRule.isEqual('MODIFY'),
          dynamodb: {
            NewImage: {
              status: {
                S: lambda.FilterRule.isEqual('COMPLETED'),
              },
            },
          },
        }),
      ],
    }));
  }
}
