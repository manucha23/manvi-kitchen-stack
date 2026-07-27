import * as cdk from 'aws-cdk-lib';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { createLambdaLogGroup } from './log-retention';

export interface ImageProcessorLambdaProps {
  environment: string;
  pendingImageBucket: s3.Bucket;
  imageBucket: s3.IBucket;
  nodeRuntime: lambda.Runtime;
  logRetention?: logs.RetentionDays;
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
    logGroup: createLambdaLogGroup(scope, 'ImageProcessorLogGroup', props.logRetention),
  });

  processorFunction.addEventSource(new eventSources.S3EventSource(props.pendingImageBucket, {
    events: [s3.EventType.OBJECT_CREATED],
    filters: [{ prefix: 'uploads/pending/' }],
  }));

  props.pendingImageBucket.grantRead(processorFunction);
  props.imageBucket.grantPut(processorFunction);

  return processorFunction;
};
