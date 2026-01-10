import { APIGatewayProxyWebsocketHandlerV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.CONNECTIONS_TABLE_NAME!;

/**
 * WebSocket Connect Handler
 * Stores connection information in DynamoDB when client connects
 * Expects JWT token in query string: ?token=<jwt>
 */
export const handler = async (event: APIGatewayProxyWebsocketEventV2) => {
  console.log('Connect event:', JSON.stringify(event, null, 2));

  const connectionId = event.requestContext.connectionId;
  const token = (event as any).queryStringParameters?.token;

  if (!token) {
    console.error('No token provided in connection');
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Unauthorized: No token provided' }),
    };
  }

  try {
    // Decode JWT to get username (basic decode without verification for demo)
    // In production, you should verify the JWT signature
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const username = payload.username;

    if (!username) {
      console.error('No username in token');
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized: Invalid token' }),
      };
    }

    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 7200; // 2 hours

    // Store connection in DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `CONNECTION#${connectionId}`,
          sk: 'META',
          connectionId,
          username,
          connectedAt: now,
          ttl,
        },
      })
    );

    // Store user -> connection mapping for easy lookup
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `USER#${username}`,
          sk: `CONNECTION#${connectionId}`,
          connectionId,
          username,
          connectedAt: now,
          ttl,
        },
      })
    );

    console.log(`Connection ${connectionId} established for user ${username}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Connected' }),
    };
  } catch (error) {
    console.error('Error in connect handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
