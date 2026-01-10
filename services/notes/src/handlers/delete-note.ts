import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const eventBridgeClient = new EventBridgeClient({});

const TABLE_NAME = process.env.TABLE_NAME!;
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME!;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN!;

/**
 * Delete Note Handler
 * Deletes a note
 * Publishes note-deleted event
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  console.log('Delete note event:', JSON.stringify(event, null, 2));

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

    // Find the note to delete
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

    if (!queryResult.Items || queryResult.Items.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Note not found or you do not have permission to delete it' }),
      };
    }

    const noteData = queryResult.Items[0];
    const pk = `USER#${username}`;
    const sk = noteData.sk;
    const isPublic = noteData.isPublic;

    // Delete the note from user's private notes
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { pk, sk },
      })
    );

    // If it was a public note, also delete from public notes
    if (isPublic) {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: 'PUBLIC#NOTES',
            sk: sk.replace(`USER#${username}`, 'NOTE'),
          },
        })
      );
    }

    // Publish note-deleted event
    const deletedAt = new Date().toISOString();
    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'notes.service',
            DetailType: 'note-deleted',
            Detail: JSON.stringify({
              eventType: 'note-deleted',
              noteId,
              username,
              deletedAt,
              timestamp: deletedAt,
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
        message: 'Note deleted successfully',
        noteId,
        deletedAt,
      }),
    };
  } catch (error) {
    console.error('Error in delete note handler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
