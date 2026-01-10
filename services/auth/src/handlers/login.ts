import { verifyPassword } from '../utils/crypto';
import { generateToken } from '../utils/jwt';
import { createAuthHandler } from '../lib/composition-examples';
import { createUserDbClient, withValidation } from '../lib/db-client';
import { userRecordSchema } from '../lib/schemas';

/**
 * Login Lambda handler
 * Authenticates user and returns JWT token
 * 
 * Uses functional composition with curried handler factory and shared DB client
 */
export const handler = createAuthHandler(async (event, env, body) => {
  const { username, password } = body;
  
  // Create user DB client with validation for this table
  const baseUserDb = createUserDbClient(env.TABLE_NAME);
  const userDb = withValidation(userRecordSchema, baseUserDb);

  // Get validated user from database
  const user = await userDb.getValidatedUser(username);

  if (!user) {
    return {
      statusCode: 401,
      body: { message: 'Invalid username or password' },
    };
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash);

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
});

