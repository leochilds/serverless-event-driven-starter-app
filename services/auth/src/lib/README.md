# Lambda Factory

A functional programming approach using **proper currying** to create type-safe, validated HTTP API Lambda handlers with standardized error handling and CORS support.

## Overview

The Lambda Factory provides two curried higher-order functions:
- `createPostHandler` - For POST endpoints that accept a request body
- `createGetHandler` - For GET endpoints without a body

Both functions use **proper currying** where each function takes exactly one parameter and returns the next function in the chain.

## Key Features

✅ **Proper Currying** - Each function takes one parameter, enabling true composition  
✅ **Type Safety** - Full TypeScript inference from Zod schemas  
✅ **Validation** - Multiple validation layers (env → event → body)  
✅ **No Hacks** - Clean validation flow (env first, then CORS headers)  
✅ **Reusability** - Create pre-configured handler builders  
✅ **DRY** - Share schemas across multiple handlers  
✅ **CORS** - Automatic CORS header management from validated environment  

## Proper Currying

```typescript
// POST Handler - 4 parameters, curried one at a time
createPostHandler(envSchema)(eventSchema)(bodySchema)(handlerFunction)

// GET Handler - 3 parameters, curried one at a time  
createGetHandler(envSchema)(eventSchema)(handlerFunction)
```

### Validation Flow (No Hacks!)

1. **Validate environment** → Get ALLOWED_ORIGIN
2. **Build CORS headers** → Use validated ALLOWED_ORIGIN
3. **Validate event** → With proper CORS headers
4. **Validate body** → (POST only)
5. **Execute handler** → With all validated inputs

No double-parsing, no fallbacks, no hacky workarounds!

## Usage

### Simple POST Handler

```typescript
import { z } from 'zod';
import { createPostHandler } from '../lib/lambda-factory';

const envSchema = z.object({
  TABLE_NAME: z.string(),
  ALLOWED_ORIGIN: z.string(),
});

const eventSchema = z.object({
  headers: z.record(z.string(), z.string()),
  body: z.string().nullable(),
});

const bodySchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
});

// Fully curried - one parameter at a time
export const handler = createPostHandler(envSchema)(eventSchema)(bodySchema)(
  async (event, env, body) => {
    // All inputs are fully typed!
    const { username, password } = body;
    
    return {
      statusCode: 201,
      body: { message: 'Created', username },
    };
  }
);
```

### Simple GET Handler

```typescript
import { z } from 'zod';
import { createGetHandler } from '../lib/lambda-factory';

const envSchema = z.object({
  TABLE_NAME: z.string(),
  SECRET_ARN: z.string(),
  ALLOWED_ORIGIN: z.string(),
});

const eventSchema = z.object({
  headers: z.record(z.string(), z.string()),
});

// Fully curried - one parameter at a time
export const handler = createGetHandler(envSchema)(eventSchema)(
  async (event, env) => {
    return { statusCode: 200, body: { data: 'something' } };
  }
);
```

## Composition & Reusability

The real power comes from **partial application** and **composition**:

### Shared Environment Schema

```typescript
// schemas.ts
export const authEnvSchema = z.object({
  TABLE_NAME: z.string(),
  SECRET_ARN: z.string(),
  ALLOWED_ORIGIN: z.string(),
});

export const postEventSchema = z.object({
  headers: z.record(z.string(), z.string()),
  body: z.string().nullable(),
});
```

### Creating Reusable Builders

```typescript
// Create a POST handler builder with shared environment
const withAuthEnv = createPostHandler(authEnvSchema);

// Further compose with shared event schema
const withAuthEnvAndEvent = withAuthEnv(postEventSchema);

// Now create multiple handlers - only specify body schema & logic!
export const signup = withAuthEnvAndEvent(signupBodySchema)(
  async (event, env, body) => {
    // Signup logic
    return { statusCode: 201, body: { message: 'User created' } };
  }
);

export const login = withAuthEnvAndEvent(loginBodySchema)(
  async (event, env, body) => {
    // Login logic
    return { statusCode: 200, body: { token: '...' } };
  }
);

export const updateProfile = withAuthEnvAndEvent(updateProfileBodySchema)(
  async (event, env, body) => {
    // Update logic
    return { statusCode: 200, body: { message: 'Updated' } };
  }
);
```

### Authenticated GET Handlers

```typescript
// Create a GET handler builder with shared environment
const withAuthGetEnv = createGetHandler(authEnvSchema);

// Compose with authenticated event schema
const withAuthenticatedGet = withAuthGetEnv(authenticatedGetEventSchema);

// Now create multiple authenticated GET handlers
export const getMe = withAuthenticatedGet(
  async (event, env) => {
    // Get user logic
    return { statusCode: 200, body: { user: '...' } };
  }
);

export const getProfile = withAuthenticatedGet(
  async (event, env) => {
    // Get profile logic
    return { statusCode: 200, body: { profile: '...' } };
  }
);

export const getSettings = withAuthenticatedGet(
  async (event, env) => {
    // Get settings logic
    return { statusCode: 200, body: { settings: '...' } };
  }
);
```

## Real-World Example

Here's how the actual handlers are implemented:

```typescript
// signup.ts
import { createPostHandler } from '../lib/lambda-factory';
import { authEnvSchema, postEventSchema, signupBodySchema } from '../lib/schemas';

export const handler = createPostHandler(authEnvSchema)(postEventSchema)(signupBodySchema)(
  async (event, env, body) => {
    // Business logic only - no boilerplate!
    const { username, password } = body;
    
    // Check if user exists, hash password, create user...
    
    return {
      statusCode: 201,
      body: { message: 'User created successfully', username },
    };
  }
);
```

```typescript
// login.ts - shares authEnvSchema and postEventSchema!
import { createPostHandler } from '../lib/lambda-factory';
import { authEnvSchema, postEventSchema, loginBodySchema } from '../lib/schemas';

export const handler = createPostHandler(authEnvSchema)(postEventSchema)(loginBodySchema)(
  async (event, env, body) => {
    const { username, password } = body;
    
    // Verify credentials, generate token...
    
    return {
      statusCode: 200,
      body: { message: 'Login successful', token, username },
    };
  }
);
```

```typescript
// get-user.ts - uses GET handler
import { createGetHandler } from '../lib/lambda-factory';
import { authEnvSchema, authenticatedGetEventSchema } from '../lib/schemas';

export const handler = createGetHandler(authEnvSchema)(authenticatedGetEventSchema)(
  async (event, env) => {
    const token = event.headers.authorization.substring(7);
    
    // Verify token, get user...
    
    return {
      statusCode: 200,
      body: userData,
    };
  }
);
```

## Benefits of Proper Currying

### Before (Config Object Approach)
```typescript
// ❌ Takes a config object - not true currying
createPostHandler({
  envSchema,
  eventSchema,
  bodySchema,
  handler: async (event, env, body) => { ... }
})

// Can't compose or partially apply
// Have to specify everything every time
// No reusability
```

### After (Proper Currying)
```typescript
// ✅ True currying - one parameter at a time
createPostHandler(envSchema)(eventSchema)(bodySchema)(handler)

// ✅ Can partially apply
const withEnv = createPostHandler(envSchema);
const withEnvAndEvent = withEnv(eventSchema);

// ✅ Reuse across handlers
export const handler1 = withEnvAndEvent(body1Schema)(logic1);
export const handler2 = withEnvAndEvent(body2Schema)(logic2);
```

## Schema Examples

### Common Schemas (shared across handlers)

```typescript
// Shared environment schema
export const authEnvSchema = z.object({
  TABLE_NAME: z.string(),
  SECRET_ARN: z.string(),
  ALLOWED_ORIGIN: z.string(),
});

// Shared POST event schema
export const postEventSchema = z.object({
  headers: z.record(z.string(), z.string()),
  body: z.string().nullable(),
});

// Shared authenticated GET event schema
export const authenticatedGetEventSchema = z.object({
  headers: z.record(z.string(), z.string()).transform((headers) => {
    // Normalize to lowercase
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
  }).refine(
    (headers) => headers.authorization?.startsWith('Bearer '),
    'Missing or invalid authorization header'
  ),
});
```

### Handler-Specific Body Schemas

```typescript
// Each handler can have its own body schema
export const signupBodySchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const loginBodySchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileBodySchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
});
```

## Error Handling

### Validation Errors (400)

```json
{
  "message": "Validation failed",
  "errors": [
    {
      "path": ["username"],
      "message": "Username must be at least 3 characters"
    }
  ]
}
```

### Configuration Errors (500)

```json
{
  "message": "Server configuration error",
  "errors": [
    {
      "path": ["TABLE_NAME"],
      "message": "Required"
    }
  ]
}
```

### Runtime Errors (500)

```json
{
  "message": "Internal server error"
}
```

## Comparison

### Traditional Approach (~80 lines)
```typescript
export async function handler(event: APIGatewayProxyEvent) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN!,
    // ...
  };

  try {
    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing body' }) };
    }
    
    const { username, password } = JSON.parse(event.body);
    
    if (!username || !password) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid' }) };
    }
    
    // Business logic...
    
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'Success' }) };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Error' }) };
  }
}
```

### Curried Factory Approach (~20 lines)
```typescript
export const handler = createPostHandler(authEnvSchema)(postEventSchema)(bodySchema)(
  async (event, env, body) => {
    // Business logic only!
    return { statusCode: 200, body: { message: 'Success' } };
  }
);
```

## Benefits

1. **True Composition** - Partial application creates reusable builders
2. **Schema Sharing** - Define once, use everywhere
3. **Type Safety** - Full inference from schemas
4. **No Boilerplate** - ~75% code reduction
5. **Clean Validation** - Proper flow (env → CORS → event → body)
6. **Consistency** - All handlers follow same pattern
7. **Maintainability** - Update schema once, affects all handlers

## Testing

The curried approach makes testing even easier:

```typescript
// Test the factory at each level
const withEnv = createPostHandler(testEnvSchema);
const withEnvAndEvent = withEnv(testEventSchema);
const withAll = withEnvAndEvent(testBodySchema);

// Test just the business logic
const testLogic = async (event, env, body) => {
  return { statusCode: 200, body: { success: true } };
};

const handler = withAll(testLogic);
```

## Advanced Patterns

### Multiple Environment Configurations

```typescript
// Different environments for different handler groups
const withAuthEnv = createPostHandler(authEnvSchema);
const withPublicEnv = createPostHandler(publicEnvSchema);
const withAdminEnv = createPostHandler(adminEnvSchema);

// Each creates its own family of handlers
export const signup = withPublicEnv(eventSchema)(bodySchema)(signupLogic);
export const login = withAuthEnv(eventSchema)(bodySchema)(loginLogic);
export const deleteUser = withAdminEnv(eventSchema)(bodySchema)(deleteLogic);
```

### Pipeline Composition

```typescript
// Create a pipeline of transformations
const authPostHandler = createPostHandler(authEnvSchema);
const withStandardEvent = authPostHandler(postEventSchema);

// Now create a family of handlers
const authHandlers = {
  signup: withStandardEvent(signupBodySchema),
  login: withStandardEvent(loginBodySchema),
  updateProfile: withStandardEvent(updateProfileBodySchema),
};

// Export handlers
export const signup = authHandlers.signup(signupLogic);
export const login = authHandlers.login(loginLogic);
export const updateProfile = authHandlers.updateProfile(updateProfileLogic);
```

This is **true functional composition** in action!
