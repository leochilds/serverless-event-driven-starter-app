import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { hashPassword } from '../utils/crypto';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME!;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN!;

/**
 * Signup Lambda handler
 * Creates a new user account with hashed password
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

    // Check if user already exists
    const checkCommand = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `USER#${username}`,
        sk: 'PROFILE',
      },
    });

    const existingUser = await docClient.send(checkCommand);

    if (existingUser.Item) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ message: 'User already exists' }),
      };
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user record
    const putCommand = new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `USER#${username}`,
        sk: 'PROFILE',
        username,
        passwordHash,
        createdAt: new Date().toISOString(),
      },
    });

    await docClient.send(putCommand);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: 'User created successfully',
        username,
      }),
    };
  } catch (error) {
    console.error('Signup error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
