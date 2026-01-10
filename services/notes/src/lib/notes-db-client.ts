import { getDocClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@shared/dynamodb-client';

/**
 * Note record structure in DynamoDB
 */
export interface NoteRecord {
  pk: string;
  sk: string;
  noteId: string;
  username: string;
  content: string;
  isPublic: boolean;
  status: string;
  createdAt: string;
  savedAt?: string;
  updatedAt?: string;
}

/**
 * Notes DB client interface
 */
export interface NotesDbClient {
  getUserNotes: (username: string) => Promise<NoteRecord[]>;
  getPublicNotes: (limit?: number) => Promise<NoteRecord[]>;
  findNoteByIdForUser: (username: string, noteId: string) => Promise<NoteRecord | null>;
  putNote: (noteData: NoteRecord) => Promise<void>;
  updateNote: (pk: string, sk: string, content: string) => Promise<void>;
  deleteNote: (pk: string, sk: string) => Promise<void>;
  deletePublicNote: (sk: string) => Promise<void>;
}

/**
 * Create a Notes DB client for a specific table
 * Uses functional composition to build specialized database operations
 * 
 * @param tableName - The DynamoDB table name
 * @returns A client with notes-specific database operations
 * 
 * @example
 * ```typescript
 * const notesDb = createNotesDbClient('my-table');
 * const notes = await notesDb.getUserNotes('john_doe');
 * ```
 */
export function createNotesDbClient(tableName: string): NotesDbClient {
  const docClient = getDocClient();

  return {
    /**
     * Get all notes for a specific user (private notes)
     */
    async getUserNotes(username: string): Promise<NoteRecord[]> {
      const result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${username}`,
            ':sk': 'NOTE#',
          },
          ScanIndexForward: false, // Sort by newest first
        })
      );

      return (result.Items || []) as NoteRecord[];
    },

    /**
     * Get public notes
     */
    async getPublicNotes(limit: number = 50): Promise<NoteRecord[]> {
      const result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
          ExpressionAttributeValues: {
            ':pk': 'PUBLIC#NOTES',
            ':sk': 'NOTE#',
          },
          ScanIndexForward: false, // Sort by newest first
          Limit: limit,
        })
      );

      return (result.Items || []) as NoteRecord[];
    },

    /**
     * Find a specific note by ID for a user
     */
    async findNoteByIdForUser(username: string, noteId: string): Promise<NoteRecord | null> {
      const result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
          FilterExpression: 'noteId = :noteId',
          ExpressionAttributeValues: {
            ':pk': `USER#${username}`,
            ':sk': 'NOTE#',
            ':noteId': noteId,
          },
        })
      );

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      return result.Items[0] as NoteRecord;
    },

    /**
     * Put/save a note record
     */
    async putNote(noteData: NoteRecord): Promise<void> {
      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: noteData,
        })
      );
    },

    /**
     * Update a note's content
     */
    async updateNote(pk: string, sk: string, content: string): Promise<void> {
      const updatedAt = new Date().toISOString();
      
      await docClient.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { pk, sk },
          UpdateExpression: 'SET content = :content, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':content': content,
            ':updatedAt': updatedAt,
          },
        })
      );
    },

    /**
     * Delete a note
     */
    async deleteNote(pk: string, sk: string): Promise<void> {
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { pk, sk },
        })
      );
    },

    /**
     * Delete a public note
     */
    async deletePublicNote(sk: string): Promise<void> {
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            pk: 'PUBLIC#NOTES',
            sk,
          },
        })
      );
    },
  };
}
