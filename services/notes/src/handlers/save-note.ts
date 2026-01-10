import { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const eventBridgeClient = new EventBridgeClient({});

const TABLE_NAME = process.env.TABLE_NAME!;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME!;

interface NoteCreatedEvent {
  eventType: 'note-created';
  noteId: string;
  username: string;
  content: string;
  isPublic: boolean;
  timestamp: string;
}

/**
 * Save Note Handler
 * Triggered by SQS queue receiving note-created events
 * Saves note to DynamoDB
 * Publishes note-saved or note-failed event
 */
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  console.log('Save note event:', JSON.stringify(event, null, 2));

  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    try {
      // Parse EventBridge event from SQS message
      const eventBridgeEvent = JSON.parse(record.body);
      const noteEvent: NoteCreatedEvent = JSON.parse(eventBridgeEvent.detail);

      console.log('Processing note:', noteEvent.noteId);

      const { noteId, username, content, isPublic, timestamp } = noteEvent;

      // Save to DynamoDB
      const savedAt = new Date().toISOString();

      if (isPublic) {
        // Save public note
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              pk: 'PUBLIC#NOTES',
              sk: `NOTE#${timestamp}#${noteId}`,
              noteId,
              username,
              content,
              isPublic: true,
              status: 'saved',
              createdAt: timestamp,
              savedAt,
            },
          })
        );
      } else {
        // Save private note
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              pk: `USER#${username}`,
              sk: `NOTE#${timestamp}#${noteId}`,
              noteId,
              username,
              content,
              isPublic: false,
              status: 'saved',
              createdAt: timestamp,
              savedAt,
            },
          })
        );
      }

      console.log(`Note saved: ${noteId}`);

      // Publish note-saved event
      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'notes.service',
              DetailType: 'note-saved',
              Detail: JSON.stringify({
                eventType: 'note-saved',
                noteId,
                username,
                content,
                isPublic,
                savedAt,
                timestamp: savedAt,
              }),
              EventBusName: EVENT_BUS_NAME,
            },
          ],
        })
      );

      console.log(`Note-saved event published: ${noteId}`);
    } catch (error) {
      console.error('Error processing note:', error);

      // Try to publish note-failed event
      try {
        const eventBridgeEvent = JSON.parse(record.body);
        const noteEvent: NoteCreatedEvent = JSON.parse(eventBridgeEvent.detail);

        await eventBridgeClient.send(
          new PutEventsCommand({
            Entries: [
              {
                Source: 'notes.service',
                DetailType: 'note-failed',
                Detail: JSON.stringify({
                  eventType: 'note-failed',
                  noteId: noteEvent.noteId,
                  username: noteEvent.username,
                  error: error instanceof Error ? error.message : 'Unknown error',
                  timestamp: new Date().toISOString(),
                }),
                EventBusName: EVENT_BUS_NAME,
              },
            ],
          })
        );
      } catch (publishError) {
        console.error('Error publishing note-failed event:', publishError);
      }

      // Add to batch item failures for retry
      batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  return {
    batchItemFailures,
  };
};
