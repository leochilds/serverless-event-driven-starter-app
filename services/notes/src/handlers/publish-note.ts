import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const eventBridgeClient = new EventBridgeClient({});

const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME!;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN!;

/**
 * Publish Note Handler
 * Receives HTTP POST request with note data
 * Publishes note-created event to EventBridge
 * Returns immediately (async pattern)
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  console.log('Publish note event:', JSON.stringify(event, null, 2));

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
    
    // Decode JWT to get username (basic decode without verification for demo)
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const username = payload.username;

    if (!username) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized: Invalid token' }),
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { content, isPublic } = body;

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid request: content is required' }),
      };
    }

    // Generate note ID
    const noteId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();

    // Publish event to EventBridge
    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'notes.service',
            DetailType: 'note-created',
            Detail: JSON.stringify({
              eventType: 'note-created',
              noteId,
              username,
              content: content.trim(),
              isPublic: isPublic === true,
              timestamp,
            }),
            EventBusName: EVENT_BUS_NAME,
          },
        ],
      })
    );

    console.log(`Note event published: ${noteId}`);

    // Return immediately - don't wait for processing
    return {
      statusCode: 202, // Accepted
      headers,
      body: JSON.stringify({
        message: 'Note submitted for processing',
        noteId,
        status: 'pending',
      }),
    };
  } catch (error) {
    console.error('Error in publish note handler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
