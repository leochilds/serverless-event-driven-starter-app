/**
 * Handler Factories for Auth Service
 * 
 * This file provides pre-composed handler builders that combine
 * the shared lambda factory functions with auth-specific schemas.
 * This eliminates duplication across auth handlers.
 */

import { createPostHandler, createGetHandler } from '@shared/lambda-factory';
import { authEnvSchema, postEventSchema, authenticatedGetEventSchema, authCredentialsBodySchema } from './schemas';

/**
 * Pre-composed handler factories
 */

// Create a POST handler builder with auth environment
export const withAuthEnv = createPostHandler(authEnvSchema);

// Further compose with standard POST event schema
export const withAuthEnvAndEvent = withAuthEnv(postEventSchema);

/**
 * Pre-composed auth handler for signup/login
 * Both operations use the same schema combination (authEnv + postEvent + credentials body)
 * This eliminates duplication across signup and login handlers
 */
export const createAuthHandler = withAuthEnvAndEvent(authCredentialsBodySchema);

/**
 * Pre-composed GET handler factories
 */

// Create a GET handler builder with auth environment
export const withAuthGetEnv = createGetHandler(authEnvSchema);

// Compose with authenticated event schema
export const withAuthenticatedGet = withAuthGetEnv(authenticatedGetEventSchema);

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
