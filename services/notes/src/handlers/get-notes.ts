import { createAuthenticatedGetHandler } from '../lib/handler-factories';
import { createNotesDbClient } from '../lib/notes-db-client';

/**
 * Get Notes Handler
 * Returns all notes for the authenticated user (private notes only)
 * 
 * Uses functional composition with curried handler factory and shared DB client
 */
export const handler = createAuthenticatedGetHandler(async (event, env) => {
  // Create notes DB client for this table
  const notesDb = createNotesDbClient(env.TABLE_NAME);

  // Query user's notes (username is extracted from JWT by the schema)
  const notes = await notesDb.getUserNotes(event.username);

  // Map to response format
  const formattedNotes = notes.map((item) => ({
    noteId: item.noteId,
    content: item.content,
    isPublic: item.isPublic,
    status: item.status,
    createdAt: item.createdAt,
    savedAt: item.savedAt,
  }));

  return {
    statusCode: 200,
    body: {
      notes: formattedNotes,
      count: formattedNotes.length,
    },
  };
});
