import { verifyToken } from '../utils/jwt';
import { createGetHandler } from '@shared/lambda-factory';
import { authEnvSchema, authenticatedGetEventSchema, userRecordSchema } from '../lib/schemas';
import { createUserDbClient, withValidation } from '../lib/db-client';

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

    // Create user DB client with validation for this table
    const baseUserDb = createUserDbClient(env.TABLE_NAME);
    const userDb = withValidation(userRecordSchema, baseUserDb);

    // Get validated user data from database
    const user = await userDb.getValidatedUser(decoded.username);

    if (!user) {
      return {
        statusCode: 404,
        body: { message: 'User not found' },
      };
    }

    // Remove sensitive data
    const { passwordHash, ...userData } = user;

    return {
      statusCode: 200,
      body: userData,
    };
  }
);
