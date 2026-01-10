<script lang="ts">
  import { goto } from '$app/navigation';
  
  const API_URL = 'https://api.leochilds.uk';
  
  let username = '';
  let password = '';
  let loading = false;
  let error = '';

  async function handleLogin() {
    error = '';
    loading = true;

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Store token in localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);

      // Redirect to dashboard
      goto('/dashboard');
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<h1>Login</h1>

<form on:submit|preventDefault={handleLogin}>
  <div class="form-group">
    <label for="username">Username</label>
    <input
      type="text"
      id="username"
      bind:value={username}
      required
      disabled={loading}
    />
  </div>

  <div class="form-group">
    <label for="password">Password</label>
    <input
      type="password"
      id="password"
      bind:value={password}
      required
      disabled={loading}
    />
  </div>

  <button type="submit" disabled={loading}>
    {loading ? 'Logging in...' : 'Login'}
  </button>
</form>

{#if error}
  <div class="error">{error}</div>
{/if}

<p style="margin-top: 20px;">
  Don't have an account? <a href="/signup">Sign up here</a>
</p>
