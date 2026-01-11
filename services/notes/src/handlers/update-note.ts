import { createUpdateNoteHandler } from '../lib/handler-factories';
import { createNotesDbClient } from '../lib/notes-db-client';
import { createEventClient } from '../lib/event-client';

/**
 * Update Note Handler
 * Updates a note's content
 * Publishes note-updated event
 * 
 * Uses functional composition with curried handler factory
 */
export const handler = createUpdateNoteHandler(async (event, env, body) => {
  const noteId = event.pathParameters!.noteId;
  
  // Create clients
  const notesDb = createNotesDbClient(env.TABLE_NAME);
  const eventClient = createEventClient(env.EVENT_BUS_NAME);

  // Find the note to update (ensures ownership)
  const noteData = await notesDb.findNoteByIdForUser(event.username, noteId);

  if (!noteData) {
    return {
      statusCode: 404,
      body: { message: 'Note not found or you do not have permission to update it' },
    };
  }

  // Update the note
  await notesDb.updateNote(noteData.pk, noteData.sk, body.content);

  const updatedAt = new Date().toISOString();

  // Publish note-updated event
  await eventClient.publishEvent({
    eventType: 'note-updated',
    noteId,
    username: event.username,
    content: body.content,
    isPublic: noteData.isPublic,
    updatedAt,
    timestamp: updatedAt,
  });

  return {
    statusCode: 200,
    body: {
      message: 'Note updated successfully',
      noteId,
      content: body.content,
      updatedAt,
    },
  };
});
