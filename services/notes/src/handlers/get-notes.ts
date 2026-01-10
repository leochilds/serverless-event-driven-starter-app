import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.TABLE_NAME!;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN!;

/**
 * Get Notes Handler
 * Returns all notes for the authenticated user (private notes only)
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  console.log('Get notes event:', JSON.stringify(event, null, 2));

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };

  try {
    // Extract JWT token from Authorization header
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized: No token provided' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Decode JWT to get username
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const username = payload.username;

    if (!username) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized: Invalid token' }),
      };
    }

    // Query user's notes from DynamoDB
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${username}`,
          ':sk': 'NOTE#',
        },
        ScanIndexForward: false, // Sort by newest first
      })
    );

    const notes = (result.Items || []).map((item) => ({
      noteId: item.noteId,
      content: item.content,
      isPublic: item.isPublic,
      status: item.status,
      createdAt: item.createdAt,
      savedAt: item.savedAt,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        notes,
        count: notes.length,
      }),
    };
  } catch (error) {
    console.error('Error in get notes handler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
