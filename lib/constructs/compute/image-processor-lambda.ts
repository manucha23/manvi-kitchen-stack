import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface ImageProcessorLambdaProps {
  environment: string;
  pendingImageBucket: s3.Bucket;
  imageBucket: s3.IBucket;
  nodeRuntime: lambda.Runtime;
}

export const createImageProcessorLambda = (
  scope: Construct,
  props: ImageProcessorLambdaProps,
): lambda.Function => {
  const processorFunction = new lambda.Function(scope, 'ImageProcessor', {
    runtime: props.nodeRuntime,
    handler: 'dist/index.handler',
    code: lambda.Code.fromAsset('lambda/image-processor', {
      exclude: ['src', '*.ts', 'tsconfig.json', '*.md', '.git*'],
    }),
    environment: {
      ENVIRONMENT: props.environment,
      OUTPUT_BUCKET: props.imageBucket.bucketName,
      MAX_DIMENSION_PX: '2048',
    },
    memorySize: 1024,
    timeout: cdk.Duration.seconds(60),
  });

  processorFunction.addEventSource(new eventSources.S3EventSource(props.pendingImageBucket, {
    events: [s3.EventType.OBJECT_CREATED],
    filters: [{ prefix: 'uploads/pending/' }],
  }));

  props.pendingImageBucket.grantRead(processorFunction);
  props.imageBucket.grantPut(processorFunction);

  processorFunction.addToRolePolicy(new iam.PolicyStatement({
    actions: ['cloudwatch:PutMetricData'],
    resources: ['*'],
    conditions: {
      StringEquals: {
        'cloudwatch:namespace': 'ManviKitchen/ImageProcessing',
      },
    },
  }));

  new cloudwatch.Alarm(scope, 'ImageProcessingFailuresAlarm', {
    alarmName: `manvi-kitchen-image-processing-failures-${props.environment}`,
    metric: new cloudwatch.Metric({
      namespace: 'ManviKitchen/ImageProcessing',
      metricName: 'ImageProcessingFailures',
      dimensionsMap: {
        Environment: props.environment,
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    }),
    threshold: 1,
    evaluationPeriods: 1,
    datapointsToAlarm: 1,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  });

  return processorFunction;
};
