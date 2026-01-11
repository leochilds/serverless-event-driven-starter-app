import { EventBridgeEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.CONNECTIONS_TABLE_NAME!;
const WEBSOCKET_API_ENDPOINT = process.env.WEBSOCKET_API_ENDPOINT!;
const WEBSOCKET_STAGE = process.env.WEBSOCKET_STAGE!;

interface NoteEvent {
  eventType: 'note-saved' | 'note-failed' | 'note-updated' | 'note-deleted';
  noteId: string;
  username: string;
  content?: string;
  isPublic?: boolean;
  error?: string;
  savedAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  timestamp: string;
}

/**
 * WebSocket Notify Handler
 * Sends note events to connected WebSocket clients
 * Triggered by EventBridge events (note-saved, note-failed, note-updated, note-deleted)
 */
export const handler = async (event: EventBridgeEvent<string, NoteEvent>) => {
  console.log('Notify event:', JSON.stringify(event, null, 2));

  const noteEvent = event.detail;
  const username = noteEvent.username;
  const isPublic = noteEvent.isPublic || false;

  try {
    let connections: any[] = [];

    if (isPublic && (noteEvent.eventType === 'note-saved' || noteEvent.eventType === 'note-updated' || noteEvent.eventType === 'note-deleted')) {
      // For public notes, get ALL active connections to broadcast to everyone
      console.log('Broadcasting public note event to all connected users');
      
      // Query all CONNECTION# records (these represent all active connections)
      const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
      const scanResult = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'begins_with(pk, :prefix)',
          ExpressionAttributeValues: {
            ':prefix': 'CONNECTION#',
          },
        })
      );
      
      connections = scanResult.Items || [];
    } else {
      // For private notes or failures, only notify the note author
      console.log(`Notifying user ${username} about their note`);
      
      const queryResult = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${username}`,
            ':sk': 'CONNECTION#',
          },
        })
      );
      
      connections = queryResult.Items || [];
    }

    if (connections.length === 0) {
      console.log(`No active connections found`);
      return;
    }

    console.log(`Found ${connections.length} connection(s) to notify`);

    // Create API Gateway Management client
    // Convert wss:// to https:// for management API
    const endpoint = `${WEBSOCKET_API_ENDPOINT.replace('wss://', 'https://')}/${WEBSOCKET_STAGE}`;
    const apiGatewayClient = new ApiGatewayManagementApiClient({
      endpoint: endpoint,
    });

    // Send message to each connection
    const sendPromises = connections.map(async (connection) => {
      const connectionId = connection.connectionId;

      try {
        await apiGatewayClient.send(
          new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: Buffer.from(JSON.stringify(noteEvent)),
          })
        );

        console.log(`Message sent to connection ${connectionId}`);
      } catch (error) {
        if (error instanceof GoneException) {
          // Connection is stale, remove it from DynamoDB
          console.log(`Connection ${connectionId} is gone, cleaning up`);
          
          const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
          
          // Delete both records
          await docClient.send(
            new DeleteCommand({
              TableName: TABLE_NAME,
              Key: {
                pk: `CONNECTION#${connectionId}`,
                sk: 'META',
              },
            })
          );

          await docClient.send(
            new DeleteCommand({
              TableName: TABLE_NAME,
              Key: {
                pk: `USER#${username}`,
                sk: `CONNECTION#${connectionId}`,
              },
            })
          );
        } else {
          console.error(`Error sending to connection ${connectionId}:`, error);
          throw error;
        }
      }
    });

    await Promise.allSettled(sendPromises);

    console.log('Notifications sent successfully');
  } catch (error) {
    console.error('Error in notify handler:', error);
    throw error;
  }
};
