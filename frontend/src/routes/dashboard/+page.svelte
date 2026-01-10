<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { NotesWebSocket } from '$lib/websocket';
  
  const API_URL = 'https://api.leochilds.uk';
  const WS_URL = 'wss://ws.leochilds.uk/production';
  
  let loading = true;
  let error = '';
  let userData = null;
  let token = '';
  let username = '';
  
  // Notes state
  let notes = [];
  let publicNotes = [];
  let noteContent = '';
  let isPublic = false;
  let submitting = false;
  let noteError = '';
  let noteSuccess = '';
  
  // WebSocket state
  let wsClient = null;
  let wsStatus = 'disconnected';
  let wsError = '';

  onMount(() => {
    // Check if user is logged in
    token = localStorage.getItem('token') || '';
    username = localStorage.getItem('username') || '';
    
    if (!token) {
      goto('/login');
      return;
    }

    fetchUserData();
    fetchNotes();
    fetchPublicNotes();
    connectWebSocket();
  });

  onDestroy(() => {
    if (wsClient) {
      wsClient.disconnect();
    }
  });

  async function fetchUserData() {
    loading = true;
    error = '';

    try {
      const response = await fetch(`${API_URL}/auth/user`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch user data');
      }

      userData = data;
    } catch (err) {
      error = err.message;
      if (err.message.includes('Invalid') || err.message.includes('expired')) {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        goto('/login');
      }
    } finally {
      loading = false;
    }
  }

  async function fetchNotes() {
    try {
      const response = await fetch(`${API_URL}/notes`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (response.ok) {
        notes = data.notes || [];
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  }

  async function fetchPublicNotes() {
    try {
      const response = await fetch(`${API_URL}/notes/public`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (response.ok) {
        publicNotes = data.notes || [];
      }
    } catch (err) {
      console.error('Error fetching public notes:', err);
    }
  }

  async function connectWebSocket() {
    if (!token) return;

    try {
      wsClient = new NotesWebSocket(WS_URL, token);
      
      // Update status as it changes
      const statusInterval = setInterval(() => {
        if (wsClient) {
          wsStatus = wsClient.getStatus();
        }
      }, 500);

      // Register event handler
      wsClient.onNoteEvent((event) => {
        console.log('Note event received:', event);

        if (event.eventType === 'note-saved') {
          noteSuccess = `Note saved successfully!`;
          setTimeout(() => noteSuccess = '', 3000);
          
          // Refresh notes
          fetchNotes();
          if (event.isPublic) {
            fetchPublicNotes();
          }
        } else if (event.eventType === 'note-failed') {
          noteError = `Failed to save note: ${event.error}`;
          setTimeout(() => noteError = '', 5000);
        } else if (event.eventType === 'note-updated') {
          noteSuccess = 'Note updated!';
          setTimeout(() => noteSuccess = '', 3000);
          fetchNotes();
        } else if (event.eventType === 'note-deleted') {
          noteSuccess = 'Note deleted!';
          setTimeout(() => noteSuccess = '', 3000);
          fetchNotes();
          fetchPublicNotes();
        }
      });

      await wsClient.connect();
      wsStatus = 'connected';
    } catch (err) {
      console.error('WebSocket connection error:', err);
      wsError = 'Failed to connect to real-time updates';
      wsStatus = 'error';
    }
  }

  async function createNote() {
    if (!noteContent.trim()) {
      noteError = 'Please enter some content';
      return;
    }

    submitting = true;
    noteError = '';
    noteSuccess = '';

    try {
      const response = await fetch(`${API_URL}/notes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: noteContent,
          isPublic: isPublic,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create note');
      }

      // Clear form
      noteContent = '';
      isPublic = false;
      
      // Show pending message
      noteSuccess = 'Note submitted! Processing...';
    } catch (err) {
      noteError = err.message;
    } finally {
      submitting = false;
    }
  }

  async function deleteNote(noteId) {
    if (!confirm('Are you sure you want to delete this note?')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/notes/${noteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete note');
      }

      // Note will be removed via WebSocket event
    } catch (err) {
      noteError = err.message;
    }
  }

  function handleLogout() {
    if (wsClient) {
      wsClient.disconnect();
    }
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    goto('/login');
  }

  function getStatusColor(status) {
    switch (status) {
      case 'connected': return 'green';
      case 'connecting': return 'orange';
      case 'disconnected': return 'gray';
      case 'error': return 'red';
      default: return 'gray';
    }
  }
</script>

<div class="dashboard">
  <h1>Dashboard</h1>

  {#if loading}
    <p>Loading user data...</p>
  {:else if error}
    <div class="error">{error}</div>
  {:else if userData}
    <div class="user-info">
      <h2>Welcome, {username}!</h2>
      
      <div class="ws-status">
        <span class="status-indicator" style="background-color: {getStatusColor(wsStatus)}"></span>
        Real-time: {wsStatus}
        {#if wsError}
          <span class="ws-error">({wsError})</span>
        {/if}
      </div>

      <button on:click={handleLogout} class="logout-btn">Logout</button>
    </div>

    <hr />

    <div class="notes-section">
      <h2>Create Note (Event-Driven Pattern)</h2>
      
      <div class="create-note">
        <textarea
          bind:value={noteContent}
          placeholder="Write your note here..."
          rows="4"
          disabled={submitting}
        ></textarea>

        <div class="note-controls">
          <label>
            <input type="checkbox" bind:checked={isPublic} disabled={submitting} />
            Make this note public
          </label>

          <button on:click={createNote} disabled={submitting || !noteContent.trim()}>
            {submitting ? 'Submitting...' : 'Create Note'}
          </button>
        </div>

        {#if noteError}
          <div class="error">{noteError}</div>
        {/if}

        {#if noteSuccess}
          <div class="success">{noteSuccess}</div>
        {/if}

        <div class="info-box">
          <strong>Event-Driven Flow:</strong> Your note is published to EventBridge → SQS → Lambda saves to DynamoDB → 
          WebSocket notification sent in real-time!
        </div>
      </div>

      <hr />

      <h2>Your Notes ({notes.length})</h2>
      <div class="notes-list">
        {#if notes.length === 0}
          <p class="empty">No notes yet. Create one above!</p>
        {:else}
          {#each notes as note}
            <div class="note-card">
              <div class="note-header">
                <span class="note-visibility">
                  {note.isPublic ? '🌍 Public' : '🔒 Private'}
                </span>
                <span class="note-status">
                  {note.status === 'saved' ? '✓ Saved' : '⏳ Pending'}
                </span>
              </div>
              <p class="note-content">{note.content}</p>
              <div class="note-footer">
                <small>Created: {new Date(note.createdAt).toLocaleString()}</small>
                <button on:click={() => deleteNote(note.noteId)} class="delete-btn">Delete</button>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <hr />

      <h2>Public Notes Feed ({publicNotes.length})</h2>
      <div class="notes-list">
        {#if publicNotes.length === 0}
          <p class="empty">No public notes yet.</p>
        {:else}
          {#each publicNotes as note}
            <div class="note-card public">
              <div class="note-header">
                <span class="note-author">By: {note.username}</span>
              </div>
              <p class="note-content">{note.content}</p>
              <div class="note-footer">
                <small>Created: {new Date(note.createdAt).toLocaleString()}</small>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .dashboard {
    max-width: 900px;
    margin: 0 auto;
    padding: 20px;
  }

  .user-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
  }

  .ws-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #666;
  }

  .status-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }

  .ws-error {
    color: red;
    font-size: 12px;
  }

  .logout-btn {
    padding: 8px 16px;
    background: #dc3545;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .logout-btn:hover {
    background: #c82333;
  }

  .create-note {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
  }

  textarea {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: inherit;
    font-size: 14px;
    margin-bottom: 10px;
  }

  .note-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .note-controls label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .note-controls button {
    padding: 10px 20px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .note-controls button:hover:not(:disabled) {
    background: #0056b3;
  }

  .note-controls button:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }

  .info-box {
    margin-top: 15px;
    padding: 12px;
    background: #e7f3ff;
    border-left: 4px solid #007bff;
    border-radius: 4px;
    font-size: 13px;
    line-height: 1.5;
  }

  .notes-list {
    display: grid;
    gap: 15px;
  }

  .note-card {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 15px;
  }

  .note-card.public {
    border-left: 4px solid #28a745;
  }

  .note-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    font-size: 12px;
  }

  .note-visibility {
    padding: 4px 8px;
    background: #e9ecef;
    border-radius: 4px;
  }

  .note-status {
    color: #28a745;
  }

  .note-author {
    font-weight: bold;
    color: #007bff;
  }

  .note-content {
    margin: 10px 0;
    line-height: 1.6;
  }

  .note-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 10px;
    border-top: 1px solid #e9ecef;
  }

  .delete-btn {
    padding: 4px 12px;
    background: #dc3545;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  .delete-btn:hover {
    background: #c82333;
  }

  .empty {
    text-align: center;
    color: #6c757d;
    font-style: italic;
    padding: 40px 20px;
  }

  .error {
    color: #dc3545;
    background: #f8d7da;
    padding: 10px;
    border-radius: 4px;
    margin: 10px 0;
  }

  .success {
    color: #155724;
    background: #d4edda;
    padding: 10px;
    border-radius: 4px;
    margin: 10px 0;
  }

  hr {
    margin: 30px 0;
    border: none;
    border-top: 1px solid #dee2e6;
  }
</style>
