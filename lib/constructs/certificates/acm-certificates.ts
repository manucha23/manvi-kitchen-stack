import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

export interface AcmCertificatesProps {
  hostedZone: route53.IHostedZone;
  cloudfrontCertificateArn?: string; // For cross-region CloudFront certificate
}

export class AcmCertificates extends Construct {
  public readonly apiCertificate: acm.Certificate;
  public readonly cloudfrontCertificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: AcmCertificatesProps) {
    super(scope, id);

    // Certificate for API Gateway (in stack region - ap-south-1)
    this.apiCertificate = new acm.Certificate(this, 'ApiCertificate', {
      domainName: 'api.test.cravnest.in',
      subjectAlternativeNames: ['api.cravnest.in', 'alerts.test.cravnest.in'], // For flexibility
      validation: acm.CertificateValidation.fromDns(props.hostedZone),
    });

    // CloudFront certificate - MUST be in us-east-1
    // For now, create in current region (this will need to be changed for production)
    // In production, this should reference a certificate created in us-east-1
    if (props.cloudfrontCertificateArn) {
      this.cloudfrontCertificate = acm.Certificate.fromCertificateArn(
        this,
        'CloudFrontCertificate',
        props.cloudfrontCertificateArn
      );
    } else {
      // WARNING: This creates certificate in current region (ap-south-1)
      // CloudFront requires certificates in us-east-1
      // For production deployment, create certificate in us-east-1 separately
      this.cloudfrontCertificate = new acm.Certificate(this, 'CloudFrontCertificate', {
        domainName: '*.test.cravnest.in',
        subjectAlternativeNames: ['*.cravnest.in'],
        validation: acm.CertificateValidation.fromDns(props.hostedZone),
      });
    }
  }
}
