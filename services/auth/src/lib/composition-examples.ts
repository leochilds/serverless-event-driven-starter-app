/**
 * Composition Examples
 * 
 * This file demonstrates the power of functional composition with curried functions.
 * These examples show how to create reusable handler builders.
 */

import { createPostHandler, createGetHandler } from './lambda-factory';
import { authEnvSchema, postEventSchema, authenticatedGetEventSchema, authCredentialsBodySchema } from './schemas';

/**
 * Example 1: Creating reusable handler builders
 * 
 * By partially applying the curried functions, we can create reusable builders
 * that share common configuration.
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

// Now we can easily create multiple handlers with different body schemas
// Each handler only needs to specify its unique body schema and logic
// export const signup = withAuthEnvAndEvent(signupBodySchema)(signupLogic);
// export const login = withAuthEnvAndEvent(loginBodySchema)(loginLogic);
// export const updateProfile = withAuthEnvAndEvent(updateProfileBodySchema)(updateProfileLogic);

/**
 * Example 2: Creating reusable GET handler builders
 */

// Create a GET handler builder with auth environment
export const withAuthGetEnv = createGetHandler(authEnvSchema);

// Compose with authenticated event schema
export const withAuthenticatedGet = withAuthGetEnv(authenticatedGetEventSchema);

// Now all authenticated GET endpoints share the same configuration
// export const getMe = withAuthenticatedGet(getMeLogic);
// export const getProfile = withAuthenticatedGet(getProfileLogic);
// export const getSettings = withAuthenticatedGet(getSettingsLogic);

/**
 * Example 3: Different configurations for different handler groups
 * 
 * You might have handlers that need different environment schemas
 */

// import { publicEnvSchema, publicEventSchema } from './schemas';
// export const withPublicEnv = createPostHandler(publicEnvSchema);
// export const withPublicEnvAndEvent = withPublicEnv(publicEventSchema);
// export const contact = withPublicEnvAndEvent(contactBodySchema)(contactLogic);

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
