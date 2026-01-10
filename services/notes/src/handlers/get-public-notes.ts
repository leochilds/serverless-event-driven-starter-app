import { createPublicGetHandler } from '../lib/handler-factories';
import { createNotesDbClient } from '../lib/notes-db-client';

/**
 * Get Public Notes Handler
 * Returns all public notes (no authentication required)
 * 
 * Uses functional composition with curried handler factory and shared DB client
 */
export const handler = createPublicGetHandler(async (event, env) => {
  // Create notes DB client for this table
  const notesDb = createNotesDbClient(env.TABLE_NAME);

  // Query public notes
  const notes = await notesDb.getPublicNotes(50);

  // Map to response format
  const formattedNotes = notes.map((item) => ({
    noteId: item.noteId,
    username: item.username,
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
