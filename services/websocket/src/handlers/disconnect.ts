import { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.CONNECTIONS_TABLE_NAME!;

/**
 * WebSocket Disconnect Handler
 * Removes connection information from DynamoDB when client disconnects
 */
export const handler = async (event: APIGatewayProxyWebsocketEventV2) => {
  console.log('Disconnect event:', JSON.stringify(event, null, 2));

  const connectionId = event.requestContext.connectionId;

  try {
    // Get connection details first to find username
    const getResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: `CONNECTION#${connectionId}`,
          sk: 'META',
        },
      })
    );

    const username = getResult.Item?.username;

    // Delete connection record
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: `CONNECTION#${connectionId}`,
          sk: 'META',
        },
      })
    );

    // Delete user -> connection mapping
    if (username) {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: `USER#${username}`,
            sk: `CONNECTION#${connectionId}`,
          },
        })
      );
    }

    console.log(`Connection ${connectionId} disconnected for user ${username || 'unknown'}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Disconnected' }),
    };
  } catch (error) {
    console.error('Error in disconnect handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
