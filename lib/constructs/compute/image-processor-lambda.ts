import * as cdk from 'aws-cdk-lib';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as path from 'path';
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
  const processorFunction = new lambdaNodejs.NodejsFunction(scope, 'ImageProcessor', {
    runtime: props.nodeRuntime,
    entry: path.join(__dirname, '../../../lambda/image-processor/src/index.ts'),
    handler: 'handler',
    depsLockFilePath: path.join(__dirname, '../../../lambda/image-processor/package-lock.json'),
    projectRoot: path.join(__dirname, '../../../lambda/image-processor'),
    bundling: {
      esbuildVersion: '0.28.0',
      forceDockerBundling: true,
      minify: true,
      nodeModules: ['sharp'],
      target: 'node24',
    },
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

  return processorFunction;
};
