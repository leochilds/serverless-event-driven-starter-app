#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DnsStack } from '../lib/stacks/dns-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { FrontendStack } from '../lib/stacks/frontend-stack';

const app = new cdk.App();

// Get configuration from context
const environment = app.node.tryGetContext('environment') || 'production';
const domainName = app.node.tryGetContext('domainName');
const apiDomainName = app.node.tryGetContext('apiDomainName');
const primaryRegion = app.node.tryGetContext('primaryRegion') || 'eu-west-2';
const certificateRegion = app.node.tryGetContext('certificateRegion') || 'us-east-1';

// Get AWS account from environment or CDK CLI
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || primaryRegion;

const envConfig = {
  account,
  region: primaryRegion,
};

const certEnvConfig = {
  account,
  region: certificateRegion,
};

// DNS Stack - must be in us-east-1 for CloudFront certificates
const dnsStack = new DnsStack(app, 'DNSStack', {
  env: certEnvConfig,
  stackName: `${environment}-dns-stack`,
  description: 'DNS Stack with Route53 and ACM certificates',
  tags: {
    Environment: environment,
  },
  domainName,
  apiDomainName,
});

// Data Stack - DynamoDB table
const dataStack = new DataStack(app, 'DataStack', {
  env: envConfig,
  stackName: `${environment}-data-stack`,
  description: 'Data Stack with DynamoDB table',
  tags: {
    Environment: environment,
  },
  environment,
});

// Auth Service Stack - Lambda functions and API Gateway
const authStack = new AuthStack(app, 'AuthStack', {
  env: envConfig,
  stackName: `${environment}-auth-stack`,
  description: 'Auth Service Stack with Lambda functions and API Gateway',
  tags: {
    Environment: environment,
  },
  environment,
  table: dataStack.table,
  apiDomainName,
  certificate: dnsStack.apiCertificate,
  hostedZone: dnsStack.hostedZone,
});

authStack.addDependency(dataStack);
authStack.addDependency(dnsStack);

// Frontend Stack - SvelteKit static site with CloudFront
const frontendStack = new FrontendStack(app, 'FrontendStack', {
  env: envConfig,
  stackName: `${environment}-frontend-stack`,
  description: 'Frontend Stack with S3 and CloudFront',
  tags: {
    Environment: environment,
  },
  environment,
  domainName,
  certificate: dnsStack.frontendCertificate,
  hostedZone: dnsStack.hostedZone,
});

frontendStack.addDependency(dnsStack);

app.synth();
