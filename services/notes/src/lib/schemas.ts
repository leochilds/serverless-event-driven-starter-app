import { z } from 'zod';

/**
 * Notes service environment schema
 * Validates required environment variables
 */
export const notesEnvSchema = z.object({
  TABLE_NAME: z.string(),
  EVENT_BUS_NAME: z.string(),
  ALLOWED_ORIGIN: z.string(),
});

/**
 * Standard event schema for public GET requests (no authentication)
 */
export const publicGetEventSchema = z.object({
  headers: z.record(z.string(), z.string()),
});

/**
 * Event schema for authenticated requests
 * Normalizes headers to lowercase and validates Bearer token
 */
export const authenticatedEventSchema = z.object({
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
}).transform((event) => {
  // Extract username from JWT token (basic decode for demo)
  const token = event.headers.authorization.substring(7); // Remove 'Bearer '
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  
  return {
    ...event,
    username: payload.username as string,
    token,
  };
});

/**
 * Event schema for authenticated requests with path parameters
 */
export const authenticatedEventWithPathSchema = authenticatedEventSchema.and(
  z.object({
    pathParameters: z.object({
      noteId: z.string(),
    }).nullable(),
  })
).refine(
  (event) => event.pathParameters?.noteId,
  { message: 'Missing noteId in path parameters' }
);

/**
 * Body schema for publishing a note
 */
export const publishNoteBodySchema = z.object({
  content: z.string().min(1, 'Content is required').trim(),
  isPublic: z.boolean().optional().default(false),
});

/**
 * Body schema for updating a note
 */
export const updateNoteBodySchema = z.object({
  content: z.string().min(1, 'Content is required').trim(),
});

/**
 * Note record schema for database validation
 */
export const noteRecordSchema = z.object({
  pk: z.string(),
  sk: z.string(),
  noteId: z.string(),
  username: z.string(),
  content: z.string(),
  isPublic: z.boolean(),
  status: z.string(),
  createdAt: z.string(),
  savedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
