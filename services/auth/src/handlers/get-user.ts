import { verifyToken } from '../utils/jwt';
import { createGetHandler } from '../lib/lambda-factory';
import { authEnvSchema, authenticatedGetEventSchema } from '../lib/schemas';
import { createUserDbClient } from '../lib/db-client';

/**
 * Get User Lambda handler
 * Retrieves user data (requires JWT authentication)
 * 
 * Uses functional composition with curried handler factory and shared DB client
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

    // Create user DB client for this table
    const userDb = createUserDbClient(env.TABLE_NAME);

    // Get user data from database
    const result = await userDb.getUser(decoded.username);

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
