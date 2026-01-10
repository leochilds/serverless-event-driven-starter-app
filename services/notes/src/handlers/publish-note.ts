import { createPublishNoteHandler } from '../lib/handler-factories';
import { createEventClient } from '../lib/event-client';

/**
 * Publish Note Handler
 * Receives HTTP POST request with note data
 * Publishes note-created event to EventBridge
 * Returns immediately (async pattern)
 * 
 * Uses functional composition with curried handler factory and event client
 */
export const handler = createPublishNoteHandler(async (event, env, body) => {
  // Create event client
  const eventClient = createEventClient(env.EVENT_BUS_NAME);

  // Generate note ID
  const noteId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = new Date().toISOString();

  // Publish event to EventBridge
  await eventClient.publishEvent({
    eventType: 'note-created',
    noteId,
    username: event.username, // Extracted from JWT by schema
    content: body.content,
    isPublic: body.isPublic,
    timestamp,
  });

  console.log(`Note event published: ${noteId}`);

  // Return immediately - don't wait for processing
  return {
    statusCode: 202, // Accepted
    body: {
      message: 'Note submitted for processing',
      noteId,
      status: 'pending',
    },
  };
});
