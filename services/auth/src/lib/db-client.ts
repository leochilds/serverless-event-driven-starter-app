import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, GetCommandOutput } from '@aws-sdk/lib-dynamodb';
import { z, ZodSchema } from 'zod';

/**
 * User record structure in DynamoDB
 */
export interface UserRecord {
  pk: string;
  sk: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  [key: string]: any; // Allow additional fields
}

/**
 * User DB client interface
 */
export interface UserDbClient {
  getUser: (username: string) => Promise<GetCommandOutput>;
  putUser: (userData: Partial<UserRecord>) => Promise<void>;
  checkUserExists: (username: string) => Promise<boolean>;
}

/**
 * Create a DynamoDB document client
 * Singleton pattern to reuse the same client instance
 */
let docClientInstance: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!docClientInstance) {
    const client = new DynamoDBClient({});
    docClientInstance = DynamoDBDocumentClient.from(client);
  }
  return docClientInstance;
}

/**
 * Create a User DB client for a specific table
 * Uses functional composition to build specialized database operations
 * 
 * @param tableName - The DynamoDB table name
 * @returns A client with user-specific database operations
 * 
 * @example
 * ```typescript
 * const userDb = createUserDbClient('my-table');
 * const result = await userDb.getUser('john_doe');
 * ```
 */
export function createUserDbClient(tableName: string): UserDbClient {
  const docClient = getDocClient();

  return {
    /**
     * Get a user by username
     */
    async getUser(username: string): Promise<GetCommandOutput> {
      const command = new GetCommand({
        TableName: tableName,
        Key: {
          pk: `USER#${username}`,
          sk: 'PROFILE',
        },
      });

      return await docClient.send(command);
    },

    /**
     * Put/update a user record
     */
    async putUser(userData: Partial<UserRecord>): Promise<void> {
      const command = new PutCommand({
        TableName: tableName,
        Item: userData,
      });

      await docClient.send(command);
    },

    /**
     * Check if a user exists
     */
    async checkUserExists(username: string): Promise<boolean> {
      const result = await this.getUser(username);
      return !!result.Item;
    },
  };
}

/**
 * Higher-order function to add schema validation to DB client operations
 * This is an example of functional composition - wrapping a client with additional behavior
 * 
 * @param schema - Zod schema to validate returned records
 * @param client - The base user DB client
 * @returns A client with validation applied to getUser operation
 * 
 * @example
 * ```typescript
 * const userSchema = z.object({
 *   username: z.string(),
 *   passwordHash: z.string(),
 *   createdAt: z.string()
 * });
 * 
 * const baseClient = createUserDbClient('my-table');
 * const validatedClient = withValidation(userSchema, baseClient);
 * ```
 */
export function withValidation<T extends ZodSchema>(
  schema: T,
  client: UserDbClient
): UserDbClient & { getValidatedUser: (username: string) => Promise<z.infer<T> | null> } {
  return {
    ...client,
    async getValidatedUser(username: string): Promise<z.infer<T> | null> {
      const result = await client.getUser(username);
      if (!result.Item) {
        return null;
      }
      return schema.parse(result.Item);
    },
  };
}
