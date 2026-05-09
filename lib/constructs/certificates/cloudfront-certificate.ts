import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

export interface CloudFrontCertificateProps {
  hostedZoneId: string;
  zoneName: string;
}

export class CloudFrontCertificate extends Construct {
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: CloudFrontCertificateProps) {
    super(scope, id);

    // Reference the hosted zone (works cross-region)
    const hostedZone = route53.PublicHostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.zoneName,
    });

    // Create certificate in us-east-1 for CloudFront
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: '*.cravnest.in',
      subjectAlternativeNames: [
        'cravnest.in',
        '*.test.cravnest.in',
        'test.cravnest.in',
      ],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Output the certificate ARN for reference in other stacks
    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'CloudFront Certificate ARN (us-east-1)',
      exportName: 'CloudFrontCertificateArn',
    });
  }
}