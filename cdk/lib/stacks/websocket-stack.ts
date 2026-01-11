import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

interface WebSocketStackProps extends cdk.StackProps {
  environment: string;
  eventBus: events.EventBus;
  wsDomainName: string;
  hostedZone: route53.IHostedZone;
}

export class WebSocketStack extends cdk.Stack {
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  public readonly connectionsTable: dynamodb.Table;
  public readonly webSocketUrl: string;

  constructor(scope: Construct, id: string, props: WebSocketStackProps) {
    super(scope, id, props);

    const { environment, eventBus, wsDomainName, hostedZone } = props;

    // Create SSL/TLS certificate for WebSocket API (must be in same region as API)
    const wsCertificate = new acm.Certificate(this, 'WebSocketCertificate', {
      domainName: wsDomainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Create DynamoDB table for WebSocket connections
    this.connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      tableName: `${environment}-websocket-connections`,
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Add GSI for querying connections by username
    this.connectionsTable.addGlobalSecondaryIndex({
      indexName: 'username-index',
      partitionKey: {
        name: 'username',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Common Lambda configuration
    const lambdaEnvironment = {
      CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
      ENVIRONMENT: environment,
    };

    const lambdaProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: lambdaEnvironment,
      logRetention: logs.RetentionDays.ONE_WEEK,
    };

    // Connect Lambda
    const connectFunction = new NodejsFunction(this, 'ConnectFunction', {
      ...lambdaProps,
      functionName: `${environment}-websocket-connect`,
      entry: '../services/websocket/src/handlers/connect.ts',
      handler: 'handler',
      description: 'WebSocket connect handler',
    });

    // Disconnect Lambda
    const disconnectFunction = new NodejsFunction(this, 'DisconnectFunction', {
      ...lambdaProps,
      functionName: `${environment}-websocket-disconnect`,
      entry: '../services/websocket/src/handlers/disconnect.ts',
      handler: 'handler',
      description: 'WebSocket disconnect handler',
    });

    // Notify Lambda (triggered by EventBridge events)
    const notifyFunction = new NodejsFunction(this, 'NotifyFunction', {
      ...lambdaProps,
      functionName: `${environment}-websocket-notify`,
      entry: '../services/websocket/src/handlers/notify.ts',
      handler: 'handler',
      description: 'WebSocket notify handler',
      timeout: cdk.Duration.seconds(30),
    });

    // Grant permissions to Lambda functions
    this.connectionsTable.grantReadWriteData(connectFunction);
    this.connectionsTable.grantReadWriteData(disconnectFunction);
    this.connectionsTable.grantReadData(notifyFunction);

    // Create WebSocket API
    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: `${environment}-notes-websocket`,
      description: 'WebSocket API for real-time note notifications',
      connectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          connectFunction
        ),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          disconnectFunction
        ),
      },
    });

    // Create WebSocket stage
    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName: environment,
      autoDeploy: true,
    });

    // Create custom domain name for WebSocket API
    const domainName = new apigatewayv2.DomainName(this, 'WebSocketDomainName', {
      domainName: wsDomainName,
      certificate: wsCertificate,
    });

    // Map the custom domain to the WebSocket stage
    new apigatewayv2.ApiMapping(this, 'WebSocketApiMapping', {
      api: this.webSocketApi,
      domainName: domainName,
      stage: webSocketStage,
    });

    // Create Route53 A record for the custom domain
    new route53.ARecord(this, 'WebSocketAliasRecord', {
      zone: hostedZone,
      recordName: wsDomainName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          domainName.regionalDomainName,
          domainName.regionalHostedZoneId
        )
      ),
    });

    // Store WebSocket URL for use in notify function (use custom domain)
    this.webSocketUrl = `wss://${wsDomainName}`;

    // Update notify function environment with WebSocket API details
    notifyFunction.addEnvironment('WEBSOCKET_API_ENDPOINT', this.webSocketApi.apiEndpoint);
    notifyFunction.addEnvironment('WEBSOCKET_STAGE', environment);

    // Grant notify function permission to post to connections
    notifyFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [
          `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${environment}/POST/@connections/*`,
        ],
      })
    );

    // Event Rules: Route note events to WebSocket notify function
    const noteEventPatterns = [
      { detailType: ['note-saved'], source: ['notes.service'] },
      { detailType: ['note-failed'], source: ['notes.service'] },
      { detailType: ['note-updated'], source: ['notes.service'] },
      { detailType: ['note-deleted'], source: ['notes.service'] },
    ];

    noteEventPatterns.forEach((pattern, index) => {
      new events.Rule(this, `NotifyRule${index}`, {
        eventBus: eventBus,
        ruleName: `${environment}-websocket-notify-${pattern.detailType[0]}`,
        description: `Route ${pattern.detailType[0]} events to WebSocket notify`,
        eventPattern: pattern,
        targets: [new targets.LambdaFunction(notifyFunction)],
      });
    });

    // Add tags
    cdk.Tags.of(this.connectionsTable).add('Environment', environment);

    // Outputs
    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: this.webSocketUrl,
      description: 'WebSocket API URL',
      exportName: `${environment}-WebSocketUrl`,
    });

    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.webSocketApi.apiId,
      description: 'WebSocket API ID',
    });

    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value: this.connectionsTable.tableName,
      description: 'WebSocket Connections Table Name',
    });
  }
}
