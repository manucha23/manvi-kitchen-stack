import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export class OrderEventsTopic extends Construct {
  public readonly topic: sns.Topic;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.topic = new sns.Topic(this, 'Topic', {
      displayName: 'Order Events',
    });
  }
}
