import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.TABLE_NAME!;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN!;

/**
 * Get Public Notes Handler
 * Returns all public notes (no authentication required)
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  console.log('Get public notes event:', JSON.stringify(event, null, 2));

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };

  try {
    // Query public notes from DynamoDB
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: {
          ':pk': 'PUBLIC#NOTES',
          ':sk': 'NOTE#',
        },
        ScanIndexForward: false, // Sort by newest first
        Limit: 50, // Limit to 50 most recent public notes
      })
    );

    const notes = (result.Items || []).map((item) => ({
      noteId: item.noteId,
      username: item.username,
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
    console.error('Error in get public notes handler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
