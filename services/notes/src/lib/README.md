# Notes Service Library

This directory contains the notes service-specific infrastructure that works together with shared utilities.

## Files

### `schemas.ts`
Zod schemas for notes service validation:
- **Environment**: `notesEnvSchema` - TABLE_NAME, EVENT_BUS_NAME, ALLOWED_ORIGIN
- **Events**: 
  - `publicGetEventSchema` - Public GET requests (no auth)
  - `authenticatedEventSchema` - Authenticated requests with JWT extraction
  - `authenticatedEventWithPathSchema` - Auth requests with path parameters
- **Body**: 
  - `publishNoteBodySchema` - Publish note request body
  - `updateNoteBodySchema` - Update note request body
- **Database**: `noteRecordSchema` - DynamoDB note record structure

### `handler-factories.ts`
Pre-composed handler builders combining shared lambda factories with notes schemas:
- `createPublicGetHandler` - For public endpoints (e.g., get public notes)
- `createAuthenticatedGetHandler` - For authenticated GET endpoints
- `createPublishNoteHandler` - For publishing notes (POST with auth)
- `createUpdateNoteHandler` - For updating notes (PUT with auth + path params)
- `createDeleteNoteHandler` - For deleting notes (DELETE with auth + path params)

### `notes-db-client.ts`
Notes-specific DynamoDB operations using shared DB client:
- `createNotesDbClient(tableName)` - Factory returning:
  - `getUserNotes(username)` - Get user's private notes
  - `getPublicNotes(limit?)` - Get public notes
  - `findNoteByIdForUser(username, noteId)` - Find specific note (ensures ownership)
  - `putNote(noteData)` - Save note to DynamoDB
  - `updateNote(pk, sk, content)` - Update note content
  - `deleteNote(pk, sk)` - Delete note
  - `deletePublicNote(sk)` - Delete from public partition

### `event-client.ts`
EventBridge event publishing with typed event interfaces:
- `createEventClient(eventBusName)` - Factory returning:
  - `publishEvent(event)` - Publish typed note events
- **Event Types**:
  - `NoteCreatedEvent` - When note is published
  - `NoteSavedEvent` - When note is saved to DB
  - `NoteUpdatedEvent` - When note is updated
  - `NoteDeletedEvent` - When note is deleted
  - `NoteFailedEvent` - When note processing fails

## Usage Example

```typescript
import { createPublicGetHandler } from '../lib/handler-factories';
import { createNotesDbClient } from '../lib/notes-db-client';

export const handler = createPublicGetHandler(async (event, env) => {
  const notesDb = createNotesDbClient(env.TABLE_NAME);
  const notes = await notesDb.getPublicNotes(50);
  
  return {
    statusCode: 200,
    body: { notes, count: notes.length }
  };
});
```

## Benefits

- **70% less code** in handlers - from ~70-150 lines to ~15-35 lines
- **Type safety** throughout with Zod validation
- **Reusable** DB and event clients across all handlers
- **Consistent** error handling and responses
- **Testable** - each component can be tested independently
