import { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { createNotesDbClient } from '../lib/notes-db-client';
import { createEventClient, NoteCreatedEvent } from '../lib/event-client';

const TABLE_NAME = process.env.TABLE_NAME!;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME!;

/**
 * Save Note Handler
 * Triggered by SQS queue receiving note-created events
 * Saves note to DynamoDB
 * Publishes note-saved or note-failed event
 * 
 * Uses composition with shared DB and event clients
 */
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  console.log('Save note event:', JSON.stringify(event, null, 2));

  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
  
  // Create clients
  const notesDb = createNotesDbClient(TABLE_NAME);
  const eventClient = createEventClient(EVENT_BUS_NAME);

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
        await notesDb.putNote({
          pk: 'PUBLIC#NOTES',
          sk: `NOTE#${timestamp}#${noteId}`,
          noteId,
          username,
          content,
          isPublic: true,
          status: 'saved',
          createdAt: timestamp,
          savedAt,
        });
      } else {
        // Save private note
        await notesDb.putNote({
          pk: `USER#${username}`,
          sk: `NOTE#${timestamp}#${noteId}`,
          noteId,
          username,
          content,
          isPublic: false,
          status: 'saved',
          createdAt: timestamp,
          savedAt,
        });
      }

      console.log(`Note saved: ${noteId}`);

      // Publish note-saved event
      await eventClient.publishEvent({
        eventType: 'note-saved',
        noteId,
        username,
        content,
        isPublic,
        savedAt,
        timestamp: savedAt,
      });

      console.log(`Note-saved event published: ${noteId}`);
    } catch (error) {
      console.error('Error processing note:', error);

      // Try to publish note-failed event
      try {
        const eventBridgeEvent = JSON.parse(record.body);
        const noteEvent: NoteCreatedEvent = JSON.parse(eventBridgeEvent.detail);

        await eventClient.publishEvent({
          eventType: 'note-failed',
          noteId: noteEvent.noteId,
          username: noteEvent.username,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
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

