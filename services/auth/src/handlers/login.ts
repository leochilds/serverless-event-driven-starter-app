import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyPassword } from '../utils/crypto';
import { generateToken } from '../utils/jwt';
import { createPostHandler } from '../lib/lambda-factory';
import { authEnvSchema, postEventSchema, loginBodySchema } from '../lib/schemas';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Login Lambda handler
 * Authenticates user and returns JWT token
 * 
 * Uses functional composition with curried handler factory
 */
export const handler = createPostHandler(authEnvSchema)(postEventSchema)(loginBodySchema)(
  async (event, env, body) => {
    const { username, password } = body;

    // Get user from database
    const getCommand = new GetCommand({
      TableName: env.TABLE_NAME,
      Key: {
        pk: `USER#${username}`,
        sk: 'PROFILE',
      },
    });

    const result = await docClient.send(getCommand);

    if (!result.Item) {
      return {
        statusCode: 401,
        body: { message: 'Invalid username or password' },
      };
    }

    // Verify password
    const isValid = await verifyPassword(password, result.Item.passwordHash);

    if (!isValid) {
      return {
        statusCode: 401,
        body: { message: 'Invalid username or password' },
      };
    }

    // Generate JWT token
    const token = await generateToken(username, env.SECRET_ARN);

    return {
      statusCode: 200,
      body: {
        message: 'Login successful',
        token,
        username,
      },
    };
  }
);
