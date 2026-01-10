import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyToken } from '../utils/jwt';
import { createGetHandler } from '../lib/lambda-factory';
import { authEnvSchema, authenticatedGetEventSchema } from '../lib/schemas';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Get User Lambda handler
 * Retrieves user data (requires JWT authentication)
 * 
 * Uses functional composition with curried handler factory
 */
export const handler = createGetHandler(authEnvSchema)(authenticatedGetEventSchema)(
  async (event, env) => {
    // Extract token from Authorization header
    const authHeader = event.headers.authorization;
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = await verifyToken(token, env.SECRET_ARN);

    if (!decoded) {
      return {
        statusCode: 401,
        body: { message: 'Invalid or expired token' },
      };
    }

    // Get user data from database
    const getCommand = new GetCommand({
      TableName: env.TABLE_NAME,
      Key: {
        pk: `USER#${decoded.username}`,
        sk: 'PROFILE',
      },
    });

    const result = await docClient.send(getCommand);

    if (!result.Item) {
      return {
        statusCode: 404,
        body: { message: 'User not found' },
      };
    }

    // Remove sensitive data
    const { passwordHash, ...userData } = result.Item;

    return {
      statusCode: 200,
      body: userData,
    };
  }
);
