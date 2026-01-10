import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyPassword } from '../utils/crypto';
import { generateToken } from '../utils/jwt';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME!;
const SECRET_ARN = process.env.SECRET_ARN!;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN!;

/**
 * Login Lambda handler
 * Authenticates user and returns JWT token
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Missing request body' }),
      };
    }

    const { username, password } = JSON.parse(event.body);

    // Validate input
    if (!username || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Username and password are required' }),
      };
    }

    // Get user from database
    const getCommand = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `USER#${username}`,
        sk: 'PROFILE',
      },
    });

    const result = await docClient.send(getCommand);

    if (!result.Item) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Invalid username or password' }),
      };
    }

    // Verify password
    const isValid = await verifyPassword(password, result.Item.passwordHash);

    if (!isValid) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Invalid username or password' }),
      };
    }

    // Generate JWT token
    const token = await generateToken(username, SECRET_ARN);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Login successful',
        token,
        username,
      }),
    };
  } catch (error) {
    console.error('Login error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
