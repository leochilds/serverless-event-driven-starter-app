import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { z, ZodSchema } from 'zod';

/**
 * Create a DynamoDB document client
 * Singleton pattern to reuse the same client instance
 */
let docClientInstance: DynamoDBDocumentClient | null = null;

export function getDocClient(): DynamoDBDocumentClient {
  if (!docClientInstance) {
    const client = new DynamoDBClient({});
    docClientInstance = DynamoDBDocumentClient.from(client);
  }
  return docClientInstance;
}

/**
 * Higher-order function to add schema validation to DB operations
 * This is an example of functional composition - wrapping operations with additional behavior
 * 
 * @param schema - Zod schema to validate returned records
 * @param operation - The base database operation
 * @returns A function with validation applied
 * 
 * @example
 * ```typescript
 * const userSchema = z.object({
 *   username: z.string(),
 *   passwordHash: z.string(),
 *   createdAt: z.string()
 * });
 * 
 * const getValidatedUser = withValidation(userSchema, async (username) => {
 *   const result = await docClient.send(new GetCommand({...}));
 *   return result.Item;
 * });
 * ```
 */
export function withValidation<T extends ZodSchema, TArgs extends any[], TReturn>(
  schema: T,
  operation: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<z.infer<T> | null> {
  return async (...args: TArgs): Promise<z.infer<T> | null> => {
    const result = await operation(...args);
    if (!result) {
      return null;
    }
    return schema.parse(result);
  };
}

/**
 * Export DynamoDB command types for reuse
 */
export { GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand };
