import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

interface DnsStackProps extends cdk.StackProps {
  domainName: string;
  apiDomainName: string;
  wsDomainName: string;
}

export class DnsStack extends cdk.Stack {
  public readonly hostedZone: route53.IHostedZone;
  public readonly frontendCertificate: acm.ICertificate;
  public readonly apiCertificate: acm.ICertificate;
  public readonly wsCertificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    const { domainName, apiDomainName, wsDomainName } = props;

    // Import existing hosted zone for the domain
    this.hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: domainName,
    });

    // Create SSL/TLS certificate for frontend (CloudFront requires us-east-1)
    this.frontendCertificate = new acm.Certificate(this, 'FrontendCertificate', {
      domainName: domainName,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // Create SSL/TLS certificate for API Gateway
    this.apiCertificate = new acm.Certificate(this, 'ApiCertificate', {
      domainName: apiDomainName,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // Create SSL/TLS certificate for WebSocket API
    this.wsCertificate = new acm.Certificate(this, 'WebSocketCertificate', {
      domainName: wsDomainName,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // Outputs
    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: 'Hosted Zone ID',
      exportName: 'HostedZoneId',
    });

    new cdk.CfnOutput(this, 'HostedZoneName', {
      value: this.hostedZone.zoneName,
      description: 'Hosted Zone Name',
      exportName: 'HostedZoneName',
    });

    new cdk.CfnOutput(this, 'FrontendCertificateArn', {
      value: this.frontendCertificate.certificateArn,
      description: 'Frontend Certificate ARN',
      exportName: 'FrontendCertificateArn',
    });

    new cdk.CfnOutput(this, 'ApiCertificateArn', {
      value: this.apiCertificate.certificateArn,
      description: 'API Certificate ARN',
      exportName: 'ApiCertificateArn',
    });

    new cdk.CfnOutput(this, 'WebSocketCertificateArn', {
      value: this.wsCertificate.certificateArn,
      description: 'WebSocket Certificate ARN',
      exportName: 'WebSocketCertificateArn',
    });
  }
}
