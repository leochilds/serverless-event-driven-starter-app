import { createDeleteNoteHandler } from '../lib/handler-factories';
import { createNotesDbClient } from '../lib/notes-db-client';
import { createEventClient } from '../lib/event-client';

/**
 * Delete Note Handler
 * Deletes a note
 * Publishes note-deleted event
 * 
 * Uses functional composition with curried handler factory
 */
export const handler = createDeleteNoteHandler(async (event, env) => {
  const noteId = event.pathParameters!.noteId;
  
  // Create clients
  const notesDb = createNotesDbClient(env.TABLE_NAME);
  const eventClient = createEventClient(env.EVENT_BUS_NAME);

  // Find the note to delete (ensures ownership)
  const noteData = await notesDb.findNoteByIdForUser(event.username, noteId);

  if (!noteData) {
    return {
      statusCode: 404,
      body: { message: 'Note not found or you do not have permission to delete it' },
    };
  }

  const pk = `USER#${event.username}`;
  const sk = noteData.sk;
  const isPublic = noteData.isPublic;

  // Delete the note from user's private notes
  await notesDb.deleteNote(pk, sk);

  // If it was a public note, also delete from public notes
  if (isPublic) {
    await notesDb.deletePublicNote(sk);
  }

  // Publish note-deleted event
  const deletedAt = new Date().toISOString();
  await eventClient.publishEvent({
    eventType: 'note-deleted',
    noteId,
    username: event.username,
    deletedAt,
    timestamp: deletedAt,
  });

  return {
    statusCode: 200,
    body: {
      message: 'Note deleted successfully',
      noteId,
      deletedAt,
    },
  };
});
