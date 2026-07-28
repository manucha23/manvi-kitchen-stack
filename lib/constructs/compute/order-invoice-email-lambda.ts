import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ses from 'aws-cdk-lib/aws-ses';
import { Construct } from 'constructs';

import { nodeJs24Runtime } from './node-runtime';

export interface OrderInvoiceEmailLambdaProps {
  environment: string;
  orderTable: dynamodb.Table;
  hostedZone: route53.IHostedZone;
  certificate?: acm.ICertificate;
  logRetentionDays?: logs.RetentionDays;
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
  public readonly distribution?: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: OrderInvoiceEmailLambdaProps) {
    super(scope, id);

    const invoiceDomain = `invoices.${props.environment}.cravnest.in`;

    this.invoiceBucket = new s3.Bucket(this, 'InvoiceBucket', {
      bucketName: `manvi-kitchen-invoices-${props.environment}-${cdk.Aws.ACCOUNT_ID}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: invoiceLifecycleRules(props.environment),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    if (props.certificate) {
      this.distribution = new cloudfront.Distribution(this, 'InvoiceDistribution', {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.invoiceBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        domainNames: [invoiceDomain],
        certificate: props.certificate,
      });

      new route53.ARecord(this, 'InvoiceDNS', {
        zone: props.hostedZone,
        recordName: invoiceDomain,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
      });
    }

    this.emailIdentity = new ses.EmailIdentity(this, 'CravnestEmailIdentity', {
      identity: ses.Identity.publicHostedZone(props.hostedZone),
    });

    const logGroup = new logs.LogGroup(this, 'OrderInvoiceEmailHandlerLogGroup', {
      retention: props.logRetentionDays ?? logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.function = new lambda.Function(this, 'OrderInvoiceEmailHandler', {
      runtime: nodeJs24Runtime,
      handler: 'dist/index.handler',
      code: lambda.Code.fromAsset('lambda/order-invoice-email', {
        exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
      }),
      environment: {
        ENVIRONMENT: props.environment,
        ORDER_TABLE: props.orderTable.tableName,
        INVOICE_BUCKET: this.invoiceBucket.bucketName,
        INVOICE_DOMAIN: invoiceDomain,
        FROM_EMAIL: 'noreply@cravnest.in',
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logGroup,
    });

    this.invoiceBucket.grantPut(this.function);
    this.invoiceBucket.grantRead(this.function);
    props.orderTable.grantReadWriteData(this.function);

    this.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: [
        `arn:${cdk.Aws.PARTITION}:ses:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:identity/cravnest.in`,
      ],
    }));

    this.function.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter/manvi-kitchen/${props.environment}/whatsapp/*`,
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
