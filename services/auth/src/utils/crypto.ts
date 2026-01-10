import { randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

/**
 * Hash a password using scrypt with a random salt
 * @param password - Plain text password
 * @returns Hashed password in format: salt:hash (both base64 encoded)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  
  return `${salt.toString('base64')}:${derivedKey.toString('base64')}`;
}

/**
 * Verify a password against a stored hash
 * @param password - Plain text password to verify
 * @param storedHash - Stored hash in format: salt:hash
 * @returns True if password matches, false otherwise
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [saltStr, hashStr] = storedHash.split(':');
  const salt = Buffer.from(saltStr, 'base64');
  const storedDerivedKey = Buffer.from(hashStr, 'base64');
  
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  
  return derivedKey.equals(storedDerivedKey);
}
