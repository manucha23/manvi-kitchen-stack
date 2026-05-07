import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

export interface Route53HostedZoneProps {
  hostedZoneId: string;
  zoneName: string;
}

export class Route53HostedZone extends Construct {
  public readonly hostedZone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: Route53HostedZoneProps) {
    super(scope, id);

    this.hostedZone = route53.PublicHostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.zoneName,
    });
  }
}