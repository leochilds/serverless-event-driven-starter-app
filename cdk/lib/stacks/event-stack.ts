import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';

interface EventStackProps extends cdk.StackProps {
  environment: string;
}

export class EventStack extends cdk.Stack {
  public readonly eventBus: events.EventBus;
  public readonly noteProcessingQueue: sqs.Queue;
  public readonly noteProcessingDLQ: sqs.Queue;

  constructor(scope: Construct, id: string, props: EventStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Create EventBridge Event Bus for notes events
    this.eventBus = new events.EventBus(this, 'NotesEventBus', {
      eventBusName: `${environment}-notes-event-bus`,
      description: 'Event bus for notes-related events',
    });

    // Create Dead Letter Queue for failed message processing
    this.noteProcessingDLQ = new sqs.Queue(this, 'NoteProcessingDLQ', {
      queueName: `${environment}-note-processing-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // Create SQS Queue for note processing
    this.noteProcessingQueue = new sqs.Queue(this, 'NoteProcessingQueue', {
      queueName: `${environment}-note-processing-queue`,
      visibilityTimeout: cdk.Duration.seconds(30),
      receiveMessageWaitTime: cdk.Duration.seconds(20), // Long polling
      deadLetterQueue: {
        queue: this.noteProcessingDLQ,
        maxReceiveCount: 3,
      },
    });

    // Event Rule: Route note-created events to SQS for processing
    new events.Rule(this, 'NoteCreatedRule', {
      eventBus: this.eventBus,
      ruleName: `${environment}-note-created-rule`,
      description: 'Route note-created events to processing queue',
      eventPattern: {
        detailType: ['note-created'],
        source: ['notes.service'],
      },
      targets: [new targets.SqsQueue(this.noteProcessingQueue)],
    });

    // Add tags
    cdk.Tags.of(this.eventBus).add('Environment', environment);
    cdk.Tags.of(this.noteProcessingQueue).add('Environment', environment);
    cdk.Tags.of(this.noteProcessingDLQ).add('Environment', environment);

    // Outputs
    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      description: 'Notes Event Bus Name',
      exportName: `${environment}-EventBusName`,
    });

    new cdk.CfnOutput(this, 'EventBusArn', {
      value: this.eventBus.eventBusArn,
      description: 'Notes Event Bus ARN',
      exportName: `${environment}-EventBusArn`,
    });

    new cdk.CfnOutput(this, 'ProcessingQueueUrl', {
      value: this.noteProcessingQueue.queueUrl,
      description: 'Note Processing Queue URL',
    });

    new cdk.CfnOutput(this, 'ProcessingQueueArn', {
      value: this.noteProcessingQueue.queueArn,
      description: 'Note Processing Queue ARN',
    });
  }
}
