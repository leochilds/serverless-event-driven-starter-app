<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  
  const API_URL = 'https://api.leochilds.uk';
  
  let loading = true;
  let error = '';
  let userData: any = null;
  let token = '';
  let username = '';

  onMount(() => {
    // Check if user is logged in
    token = localStorage.getItem('token') || '';
    username = localStorage.getItem('username') || '';
    
    if (!token) {
      goto('/login');
      return;
    }

    fetchUserData();
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
    } catch (err: any) {
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

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    goto('/login');
  }
</script>

<h1>Dashboard</h1>

{#if loading}
  <p>Loading user data...</p>
{:else if error}
  <div class="error">{error}</div>
{:else if userData}
  <div class="user-info">
    <h2>Welcome, {username}!</h2>
    <p>Your account information:</p>
    <pre>{JSON.stringify(userData, null, 2)}</pre>
  </div>
  
  <button on:click={handleLogout} style="margin-top: 20px;">
    Logout
  </button>
{/if}
