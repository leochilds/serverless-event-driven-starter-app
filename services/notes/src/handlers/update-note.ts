import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const eventBridgeClient = new EventBridgeClient({});

const TABLE_NAME = process.env.TABLE_NAME!;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME!;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN!;

/**
 * Update Note Handler
 * Updates a note's content
 * Publishes note-updated event
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  console.log('Update note event:', JSON.stringify(event, null, 2));

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };

  try {
    // Extract JWT token
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized: No token provided' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const username = payload.username;

    if (!username) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized: Invalid token' }),
      };
    }

    // Get noteId from path parameters
    const noteId = event.pathParameters?.noteId;
    if (!noteId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid request: noteId is required' }),
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { content } = body;

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid request: content is required' }),
      };
    }

    // First, get the note to check ownership and if it's public
    // We need to search in both user's private notes and public notes
    let noteData: any = null;
    let pk: string;
    let sk: string | undefined;

    // Try private note first
    const privateResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: `USER#${username}`,
          sk: `NOTE#*`, // We need to scan for this
        },
      })
    );

    // Since we can't do a wildcard get, we need to query
    const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
    
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        FilterExpression: 'noteId = :noteId',
        ExpressionAttributeValues: {
          ':pk': `USER#${username}`,
          ':sk': 'NOTE#',
          ':noteId': noteId,
        },
      })
    );

    if (queryResult.Items && queryResult.Items.length > 0) {
      noteData = queryResult.Items[0];
      pk = `USER#${username}`;
      sk = noteData.sk;
    } else {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Note not found or you do not have permission to update it' }),
      };
    }

    // Update the note
    const updatedAt = new Date().toISOString();

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk, sk },
        UpdateExpression: 'SET content = :content, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':content': content.trim(),
          ':updatedAt': updatedAt,
        },
      })
    );

    // Publish note-updated event
    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'notes.service',
            DetailType: 'note-updated',
            Detail: JSON.stringify({
              eventType: 'note-updated',
              noteId,
              username,
              content: content.trim(),
              updatedAt,
              timestamp: updatedAt,
            }),
            EventBusName: EVENT_BUS_NAME,
          },
        ],
      })
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Note updated successfully',
        noteId,
        content: content.trim(),
        updatedAt,
      }),
    };
  } catch (error) {
    console.error('Error in update note handler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
