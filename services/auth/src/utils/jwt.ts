import jwt from 'jsonwebtoken';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

let cachedSecret: string | null = null;

/**
 * Get JWT secret from AWS Secrets Manager with caching
 * @param secretArn - ARN of the secret in Secrets Manager
 * @returns JWT secret string
 */
async function getJwtSecret(secretArn: string): Promise<string> {
  if (cachedSecret) {
    return cachedSecret;
  }

  const command = new GetSecretValueCommand({
    SecretId: secretArn,
  });

  const response = await secretsClient.send(command);
  
  if (!response.SecretString) {
    throw new Error('Secret value is empty');
  }
  
  cachedSecret = response.SecretString;
  return cachedSecret;
}

/**
 * Generate a JWT token for a user
 * @param username - Username to include in token
 * @param secretArn - ARN of the JWT secret
 * @returns JWT token string
 */
export async function generateToken(
  username: string,
  secretArn: string
): Promise<string> {
  const secret = await getJwtSecret(secretArn);
  
  const token = jwt.sign(
    { username },
    secret,
    { expiresIn: '24h' }
  );
  
  return token;
}

/**
 * Verify a JWT token
 * @param token - JWT token to verify
 * @param secretArn - ARN of the JWT secret
 * @returns Decoded token payload or null if invalid
 */
export async function verifyToken(
  token: string,
  secretArn: string
): Promise<{ username: string } | null> {
  try {
    const secret = await getJwtSecret(secretArn);
    const decoded = jwt.verify(token, secret) as { username: string };
    return decoded;
  } catch (error) {
    return null;
  }
}
