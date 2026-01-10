# Shared Lambda Utilities

This directory contains shared utilities and patterns used across multiple Lambda services in this project.

## Files

### `lambda-factory.ts`
Provides curried factory functions for creating type-safe Lambda handlers with built-in:
- Environment variable validation (Zod)
- Event structure validation
- Request body validation (for POST/PUT)
- CORS header management
- Standardized error handling and responses

**Available Factories:**
- `createGetHandler` - For GET requests
- `createPostHandler` - For POST requests
- `createPutHandler` - For PUT requests
- `createDeleteHandler` - For DELETE requests

### `types.ts`
Shared TypeScript types and interfaces:
- `HandlerResponse` - Standard response structure
- `ErrorResponse` - Error response format
- `ResponseBody` - Response body types
- `CorsConfig` - CORS configuration

### `dynamodb-client.ts`
DynamoDB client utilities with:
- Singleton client pattern for connection reuse
- `getDocClient()` - Get shared DynamoDB document client
- `withValidation()` - Higher-order function for adding Zod validation to DB operations
- Re-exports of common DynamoDB commands

## Usage Pattern

Each service should:
1. Import these shared utilities
2. Create service-specific schemas in `lib/schemas.ts`
3. Compose pre-configured handlers in `lib/handler-factories.ts`
4. Implement business logic in `handlers/`

See `services/auth` and `services/notes` for examples.
