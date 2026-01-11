import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

/**
 * Create EventBridge client
 * Singleton pattern to reuse the same client instance
 */
let eventBridgeClientInstance: EventBridgeClient | null = null;

function getEventBridgeClient(): EventBridgeClient {
  if (!eventBridgeClientInstance) {
    eventBridgeClientInstance = new EventBridgeClient({});
  }
  return eventBridgeClientInstance;
}

/**
 * Event types for notes service
 */
export type NoteEventType = 'note-created' | 'note-saved' | 'note-updated' | 'note-deleted' | 'note-failed';

/**
 * Base event structure
 */
interface BaseNoteEvent {
  eventType: NoteEventType;
  noteId: string;
  username: string;
  timestamp: string;
}

/**
 * Note created event
 */
export interface NoteCreatedEvent extends BaseNoteEvent {
  eventType: 'note-created';
  content: string;
  isPublic: boolean;
}

/**
 * Note saved event
 */
export interface NoteSavedEvent extends BaseNoteEvent {
  eventType: 'note-saved';
  content: string;
  isPublic: boolean;
  savedAt: string;
}

/**
 * Note updated event
 */
export interface NoteUpdatedEvent extends BaseNoteEvent {
  eventType: 'note-updated';
  content: string;
  isPublic?: boolean;
  updatedAt: string;
}

/**
 * Note deleted event
 */
export interface NoteDeletedEvent extends BaseNoteEvent {
  eventType: 'note-deleted';
  isPublic?: boolean;
  deletedAt: string;
}

/**
 * Note failed event
 */
export interface NoteFailedEvent extends BaseNoteEvent {
  eventType: 'note-failed';
  error: string;
}

/**
 * Union type for all note events
 */
export type NoteEvent = NoteCreatedEvent | NoteSavedEvent | NoteUpdatedEvent | NoteDeletedEvent | NoteFailedEvent;

/**
 * Event client interface
 */
export interface EventClient {
  publishEvent: (event: NoteEvent) => Promise<void>;
}

/**
 * Create an Event client for a specific event bus
 * Uses functional composition to build specialized event operations
 * 
 * @param eventBusName - The EventBridge event bus name
 * @returns A client with event publishing operations
 * 
 * @example
 * ```typescript
 * const eventClient = createEventClient('my-event-bus');
 * await eventClient.publishEvent({
 *   eventType: 'note-created',
 *   noteId: '123',
 *   username: 'john',
 *   content: 'Hello',
 *   isPublic: true,
 *   timestamp: new Date().toISOString()
 * });
 * ```
 */
export function createEventClient(eventBusName: string): EventClient {
  const client = getEventBridgeClient();

  return {
    /**
     * Publish an event to EventBridge
     */
    async publishEvent(event: NoteEvent): Promise<void> {
      await client.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'notes.service',
              DetailType: event.eventType,
              Detail: JSON.stringify(event),
              EventBusName: eventBusName,
            },
          ],
        })
      );
    },
  };
}
