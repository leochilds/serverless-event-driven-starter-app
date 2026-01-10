import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

interface NotesStackProps extends cdk.StackProps {
  environment: string;
  table: dynamodb.Table;
  eventBus: events.EventBus;
  noteProcessingQueue: sqs.Queue;
  httpApi: apigatewayv2.HttpApi;
  allowedOrigin: string;
}

export class NotesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NotesStackProps) {
    super(scope, id, props);

    const { environment, table, eventBus, noteProcessingQueue, httpApi, allowedOrigin } = props;

    // Common Lambda configuration
    const lambdaEnvironment = {
      TABLE_NAME: table.tableName,
      EVENT_BUS_NAME: eventBus.eventBusName,
      ENVIRONMENT: environment,
      ALLOWED_ORIGIN: allowedOrigin,
    };

    const lambdaProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: lambdaEnvironment,
      logRetention: logs.RetentionDays.ONE_WEEK,
    };

    // Publish Note Lambda (HTTP POST /notes)
    const publishNoteFunction = new NodejsFunction(this, 'PublishNoteFunction', {
      ...lambdaProps,
      functionName: `${environment}-notes-publish`,
      entry: '../services/notes/src/handlers/publish-note.ts',
      handler: 'handler',
      description: 'Publish note event to EventBridge',
    });

    // Save Note Lambda (triggered by SQS)
    const saveNoteFunction = new NodejsFunction(this, 'SaveNoteFunction', {
      ...lambdaProps,
      functionName: `${environment}-notes-save`,
      entry: '../services/notes/src/handlers/save-note.ts',
      handler: 'handler',
      description: 'Save note to DynamoDB from SQS',
      timeout: cdk.Duration.seconds(30),
    });

    // Get Notes Lambda (HTTP GET /notes)
    const getNotesFunction = new NodejsFunction(this, 'GetNotesFunction', {
      ...lambdaProps,
      functionName: `${environment}-notes-get`,
      entry: '../services/notes/src/handlers/get-notes.ts',
      handler: 'handler',
      description: 'Get user notes from DynamoDB',
    });

    // Get Public Notes Lambda (HTTP GET /notes/public)
    const getPublicNotesFunction = new NodejsFunction(this, 'GetPublicNotesFunction', {
      ...lambdaProps,
      functionName: `${environment}-notes-get-public`,
      entry: '../services/notes/src/handlers/get-public-notes.ts',
      handler: 'handler',
      description: 'Get all public notes from DynamoDB',
    });

    // Update Note Lambda (HTTP PUT /notes/{noteId})
    const updateNoteFunction = new NodejsFunction(this, 'UpdateNoteFunction', {
      ...lambdaProps,
      functionName: `${environment}-notes-update`,
      entry: '../services/notes/src/handlers/update-note.ts',
      handler: 'handler',
      description: 'Update note in DynamoDB',
    });

    // Delete Note Lambda (HTTP DELETE /notes/{noteId})
    const deleteNoteFunction = new NodejsFunction(this, 'DeleteNoteFunction', {
      ...lambdaProps,
      functionName: `${environment}-notes-delete`,
      entry: '../services/notes/src/handlers/delete-note.ts',
      handler: 'handler',
      description: 'Delete note from DynamoDB',
    });

    // Grant permissions
    eventBus.grantPutEventsTo(publishNoteFunction);
    eventBus.grantPutEventsTo(saveNoteFunction);
    eventBus.grantPutEventsTo(updateNoteFunction);
    eventBus.grantPutEventsTo(deleteNoteFunction);

    table.grantReadWriteData(saveNoteFunction);
    table.grantReadData(getNotesFunction);
    table.grantReadData(getPublicNotesFunction);
    table.grantReadWriteData(updateNoteFunction);
    table.grantReadWriteData(deleteNoteFunction);

    // Add SQS event source to save note function
    saveNoteFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(noteProcessingQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      })
    );

    // Add HTTP API routes
    httpApi.addRoutes({
      path: '/notes',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'PublishNoteIntegration',
        publishNoteFunction
      ),
    });

    httpApi.addRoutes({
      path: '/notes',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'GetNotesIntegration',
        getNotesFunction
      ),
    });

    httpApi.addRoutes({
      path: '/notes/public',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'GetPublicNotesIntegration',
        getPublicNotesFunction
      ),
    });

    httpApi.addRoutes({
      path: '/notes/{noteId}',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'UpdateNoteIntegration',
        updateNoteFunction
      ),
    });

    httpApi.addRoutes({
      path: '/notes/{noteId}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        'DeleteNoteIntegration',
        deleteNoteFunction
      ),
    });

    // Outputs
    new cdk.CfnOutput(this, 'PublishNoteFunctionName', {
      value: publishNoteFunction.functionName,
      description: 'Publish Note Lambda Function Name',
    });

    new cdk.CfnOutput(this, 'SaveNoteFunctionName', {
      value: saveNoteFunction.functionName,
      description: 'Save Note Lambda Function Name',
    });
  }
}
