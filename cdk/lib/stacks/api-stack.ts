import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

interface ApiStackProps extends cdk.StackProps {
  environment: string;
  apiDomainName: string;
  hostedZone: route53.IHostedZone;
  allowedOrigin: string;
}

export class ApiStack extends cdk.Stack {
  public readonly httpApi: apigatewayv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { environment, apiDomainName, hostedZone, allowedOrigin } = props;

    // Create API certificate in the same region as API Gateway (required)
    const apiCertificate = new acm.Certificate(this, 'ApiCertificate', {
      domainName: apiDomainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Create HTTP API
    this.httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: `${environment}-api`,
      description: 'Shared HTTP API Gateway for all services',
      corsPreflight: {
        allowOrigins: [allowedOrigin],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Create custom domain for API
    const domainName = new apigatewayv2.DomainName(this, 'ApiDomainName', {
      domainName: apiDomainName,
      certificate: apiCertificate,
    });

    // Map custom domain to API
    new apigatewayv2.ApiMapping(this, 'ApiMapping', {
      api: this.httpApi,
      domainName: domainName,
      stage: this.httpApi.defaultStage,
    });

    // Create Route53 record for API
    new route53.ARecord(this, 'ApiAliasRecord', {
      zone: hostedZone,
      recordName: apiDomainName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          domainName.regionalDomainName,
          domainName.regionalHostedZoneId
        )
      ),
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.httpApi.url!,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'ApiDomainUrl', {
      value: `https://${apiDomainName}`,
      description: 'API Custom Domain URL',
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.httpApi.apiId,
      description: 'API Gateway ID',
    });
  }
}
