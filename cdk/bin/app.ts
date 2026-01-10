#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DnsStack } from '../lib/stacks/dns-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { FrontendStack } from '../lib/stacks/frontend-stack';
import { EventStack } from '../lib/stacks/event-stack';
import { WebSocketStack } from '../lib/stacks/websocket-stack';
import { NotesStack } from '../lib/stacks/notes-stack';

const app = new cdk.App();

// Get configuration from context
const environment = app.node.tryGetContext('environment') || 'production';
const domainName = app.node.tryGetContext('domainName');
const apiDomainName = app.node.tryGetContext('apiDomainName');
const allowedOrigin = app.node.tryGetContext('allowedOrigin');
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
  crossRegionReferences: true,
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

// API Stack - Shared HTTP API Gateway for all services
const apiStack = new ApiStack(app, 'ApiStack', {
  env: envConfig,
  stackName: `${environment}-api-stack`,
  description: 'API Stack with HTTP API Gateway',
  crossRegionReferences: true,
  tags: {
    Environment: environment,
  },
  environment,
  apiDomainName,
  hostedZone: dnsStack.hostedZone,
  allowedOrigin,
});

apiStack.addDependency(dnsStack);

// Auth Service Stack - Lambda functions and routes
const authStack = new AuthStack(app, 'AuthStack', {
  env: envConfig,
  stackName: `${environment}-auth-stack`,
  description: 'Auth Service Stack with Lambda functions',
  tags: {
    Environment: environment,
  },
  environment,
  table: dataStack.table,
  httpApi: apiStack.httpApi,
  allowedOrigin,
});

// Dependencies are implicit through resource references
// authStack depends on dataStack (via table) and apiStack (via httpApi)

// Event Stack - EventBridge and SQS for event-driven architecture
const eventStack = new EventStack(app, 'EventStack', {
  env: envConfig,
  stackName: `${environment}-event-stack`,
  description: 'Event Stack with EventBridge and SQS',
  tags: {
    Environment: environment,
  },
  environment,
});

// WebSocket Stack - WebSocket API for real-time notifications
const webSocketStack = new WebSocketStack(app, 'WebSocketStack', {
  env: envConfig,
  stackName: `${environment}-websocket-stack`,
  description: 'WebSocket Stack for real-time notifications',
  tags: {
    Environment: environment,
  },
  environment,
  eventBus: eventStack.eventBus,
});

webSocketStack.addDependency(eventStack);

// Notes Stack - Notes service with event-driven handlers
const notesStack = new NotesStack(app, 'NotesStack', {
  env: envConfig,
  stackName: `${environment}-notes-stack`,
  description: 'Notes Stack with event-driven Lambda functions',
  tags: {
    Environment: environment,
  },
  environment,
  table: dataStack.table,
  eventBus: eventStack.eventBus,
  noteProcessingQueue: eventStack.noteProcessingQueue,
  httpApi: apiStack.httpApi,
  allowedOrigin,
});

// Dependencies are implicit through resource references
// notesStack depends on dataStack (via table), eventStack (via eventBus and queue), and apiStack (via httpApi)

// Frontend Stack - SvelteKit static site with CloudFront
const frontendStack = new FrontendStack(app, 'FrontendStack', {
  env: envConfig,
  stackName: `${environment}-frontend-stack`,
  description: 'Frontend Stack with S3 and CloudFront',
  crossRegionReferences: true,
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
