import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { verifyToken } from '../utils/jwt';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME!;
const SECRET_ARN = process.env.SECRET_ARN!;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN!;

/**
 * Get User Lambda handler
 * Retrieves user data (requires JWT authentication)
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
  };

  try {
    // Extract token from Authorization header
    const authHeader = event.headers.Authorization || event.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Missing or invalid authorization header' }),
      };
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = await verifyToken(token, SECRET_ARN);

    if (!decoded) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Invalid or expired token' }),
      };
    }

    // Get user data from database
    const getCommand = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `USER#${decoded.username}`,
        sk: 'PROFILE',
      },
    });

    const result = await docClient.send(getCommand);

    if (!result.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User not found' }),
      };
    }

    // Remove sensitive data
    const { passwordHash, ...userData } = result.Item;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(userData),
    };
  } catch (error) {
    console.error('Get user error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
