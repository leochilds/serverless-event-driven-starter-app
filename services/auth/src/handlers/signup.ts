import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { hashPassword } from '../utils/crypto';
import { createPostHandler } from '../lib/lambda-factory';
import { authEnvSchema, postEventSchema, signupBodySchema } from '../lib/schemas';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Signup Lambda handler
 * Creates a new user account with hashed password
 * 
 * Uses functional composition with curried handler factory
 */
export const handler = createPostHandler(authEnvSchema)(postEventSchema)(signupBodySchema)(
  async (event, env, body) => {
    const { username, password } = body;

    // Check if user already exists
    const checkCommand = new GetCommand({
      TableName: env.TABLE_NAME,
      Key: {
        pk: `USER#${username}`,
        sk: 'PROFILE',
      },
    });

    const existingUser = await docClient.send(checkCommand);

    if (existingUser.Item) {
      return {
        statusCode: 409,
        body: { message: 'User already exists' },
      };
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user record
    const putCommand = new PutCommand({
      TableName: env.TABLE_NAME,
      Item: {
        pk: `USER#${username}`,
        sk: 'PROFILE',
        username,
        passwordHash,
        createdAt: new Date().toISOString(),
      },
    });

    await docClient.send(putCommand);

    return {
      statusCode: 201,
      body: {
        message: 'User created successfully',
        username,
      },
    };
  }
);
