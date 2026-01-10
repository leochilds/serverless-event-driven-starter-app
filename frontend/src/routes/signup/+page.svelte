<script lang="ts">
  const API_URL = 'https://api.leochilds.uk';
  
  let username = '';
  let password = '';
  let loading = false;
  let error = '';
  let success = '';

  async function handleSignup() {
    error = '';
    success = '';
    loading = true;

    try {
      const response = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Signup failed');
      }

      success = 'Account created successfully! You can now login.';
      username = '';
      password = '';
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<h1>Sign Up</h1>

<form on:submit|preventDefault={handleSignup}>
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
    {loading ? 'Creating Account...' : 'Sign Up'}
  </button>
</form>

{#if error}
  <div class="error">{error}</div>
{/if}

{#if success}
  <div class="success">{success}</div>
{/if}

<p style="margin-top: 20px;">
  Already have an account? <a href="/login">Login here</a>
</p>
