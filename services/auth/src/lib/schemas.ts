import { z } from 'zod';

/**
 * Common environment schema for auth service
 * Validates required environment variables
 */
export const authEnvSchema = z.object({
  TABLE_NAME: z.string(),
  SECRET_ARN: z.string(),
  ALLOWED_ORIGIN: z.string(),
});

/**
 * Standard event schema for POST requests
 * Basic validation for headers and body
 */
export const postEventSchema = z.object({
  headers: z.record(z.string(), z.string()),
  body: z.string().nullable(),
});

/**
 * Event schema for authenticated GET requests
 * Normalizes headers to lowercase and validates Bearer token
 */
export const authenticatedGetEventSchema = z.object({
  headers: z.record(z.string(), z.string()).transform((headers): Record<string, string> => {
    // Normalize header keys to lowercase for case-insensitive access
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = value as string;
    }
    return normalized;
  }).refine(
    (headers) => headers.authorization && headers.authorization.startsWith('Bearer '),
    { message: 'Missing or invalid authorization header' }
  ),
});

/**
 * Combined body schema for authentication requests (signup and login)
 * Both operations require the same credentials structure
 */
export const authCredentialsBodySchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

// Legacy exports for backwards compatibility (if needed)
export const signupBodySchema = authCredentialsBodySchema;
export const loginBodySchema = authCredentialsBodySchema;

/**
 * User record schema for database validation
 * Validates the structure of user records retrieved from DynamoDB
 */
export const userRecordSchema = z.object({
  pk: z.string(),
  sk: z.string(),
  username: z.string(),
  passwordHash: z.string(),
  createdAt: z.string(),
});
