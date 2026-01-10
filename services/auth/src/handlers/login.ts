import { verifyPassword } from '../utils/crypto';
import { generateToken } from '../utils/jwt';
import { createAuthHandler } from '../lib/composition-examples';
import { createUserDbClient } from '../lib/db-client';

/**
 * Login Lambda handler
 * Authenticates user and returns JWT token
 * 
 * Uses functional composition with curried handler factory and shared DB client
 */
export const handler = createAuthHandler(async (event, env, body) => {
  const { username, password } = body;
  
  // Create user DB client for this table
  const userDb = createUserDbClient(env.TABLE_NAME);

  // Get user from database
  const result = await userDb.getUser(username);

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
});

