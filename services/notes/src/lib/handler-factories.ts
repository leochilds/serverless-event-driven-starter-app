/**
 * Handler Factories for Notes Service
 * 
 * This file provides pre-composed handler builders that combine
 * the shared lambda factory functions with notes-specific schemas.
 * This eliminates duplication across notes handlers.
 */

import { createGetHandler, createPostHandler, createPutHandler, createDeleteHandler } from '@shared/lambda-factory';
import { 
  notesEnvSchema, 
  publicGetEventSchema, 
  authenticatedEventSchema,
  authenticatedEventWithPathSchema,
  publishNoteBodySchema,
  updateNoteBodySchema
} from './schemas';

/**
 * Pre-composed handler factories
 */

// Create handler builders with notes environment
const withNotesEnv = createGetHandler(notesEnvSchema);
const withNotesPostEnv = createPostHandler(notesEnvSchema);
const withNotesPutEnv = createPutHandler(notesEnvSchema);
const withNotesDeleteEnv = createDeleteHandler(notesEnvSchema);

/**
 * Public GET handler (no authentication required)
 * For endpoints like getting public notes
 */
export const createPublicGetHandler = withNotesEnv(publicGetEventSchema);

/**
 * Authenticated GET handler
 * For endpoints that require user authentication (e.g., get user's notes)
 */
export const createAuthenticatedGetHandler = withNotesEnv(authenticatedEventSchema);

/**
 * Publish note handler (POST with authentication)
 * Pre-configured for the publish note endpoint
 */
export const createPublishNoteHandler = withNotesPostEnv(authenticatedEventSchema)(publishNoteBodySchema);

/**
 * Update note handler (PUT with authentication and path params)
 * Pre-configured for the update note endpoint
 */
export const createUpdateNoteHandler = withNotesPutEnv(authenticatedEventWithPathSchema)(updateNoteBodySchema);

/**
 * Delete note handler (DELETE with authentication and path params)
 * Pre-configured for the delete note endpoint
 */
export const createDeleteNoteHandler = withNotesDeleteEnv(authenticatedEventWithPathSchema);

/**
 * Benefits of this approach:
 * 
 * 1. DRY - No repetition of common schemas across handlers
 * 2. Type Safety - All handlers inherit proper types from shared schemas
 * 3. Consistency - All handlers follow the same validation pattern
 * 4. Maintainability - Update schema in one place, affects all handlers
 * 5. Composition - Build complex behaviors from simple functions
 * 6. Testability - Each layer can be tested independently
 */
