import { hashPassword } from '../utils/crypto';
import { createAuthHandler } from '../lib/handler-factories';
import { createUserDbClient } from '../lib/db-client';

/**
 * Signup Lambda handler
 * Creates a new user account with hashed password
 * 
 * Uses functional composition with curried handler factory and shared DB client
 */
export const handler = createAuthHandler(async (event, env, body) => {
  const { username, password } = body;
  
  // Create user DB client for this table
  const userDb = createUserDbClient(env.TABLE_NAME);

  // Check if user already exists
  const existingUser = await userDb.getUser(username);

  if (existingUser.Item) {
    return {
      statusCode: 409,
      body: { message: 'User already exists' },
    };
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user record
  await userDb.putUser({
    pk: `USER#${username}`,
    sk: 'PROFILE',
    username,
    passwordHash,
    createdAt: new Date().toISOString(),
  });

  return {
    statusCode: 201,
    body: {
      message: 'User created successfully',
      username,
    },
  };
});
