/**
 * WebSocket Client for Real-time Note Notifications
 * Handles connection, reconnection, and event listening
 */

type NoteEvent = {
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
};

type EventCallback = (event: NoteEvent) => void;

export class NotesWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private callbacks: EventCallback[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private reconnectTimer: number | null = null;
  private isIntentionallyClosed = false;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isIntentionallyClosed = false;

      try {
        // Add token as query parameter
        const wsUrl = `${this.url}?token=${encodeURIComponent(this.token)}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const noteEvent: NoteEvent = JSON.parse(event.data);
            console.log('WebSocket message received:', noteEvent);
            this.callbacks.forEach((callback) => callback(noteEvent));
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          this.ws = null;

          // Attempt to reconnect if not intentionally closed
          if (!this.isIntentionallyClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = window.setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Register a callback for note events
   */
  onNoteEvent(callback: EventCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Remove a callback
   */
  offNoteEvent(callback: EventCallback): void {
    this.callbacks = this.callbacks.filter((cb) => cb !== callback);
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isIntentionallyClosed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.callbacks = [];
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection status
   */
  getStatus(): string {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'closed';
      default:
        return 'unknown';
    }
  }
}
