import { z, ZodError, ZodSchema } from 'zod';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ErrorResponse, HandlerResponse } from './types';

/**
 * Build standardized CORS headers from validated environment
 */
function buildCorsHeaders(allowedOrigin: string, methods: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': methods,
  };
}

/**
 * Format Zod validation errors into a user-friendly structure
 */
function formatZodError(error: ZodError<any>): ErrorResponse {
  return {
    message: 'Validation failed',
    errors: error.issues.map((err) => ({
      path: err.path.map(String),
      message: err.message,
    })),
  };
}

/**
 * Create a standardized error response
 */
function createErrorResponse(
  statusCode: number,
  message: string,
  headers: Record<string, string>,
  errors?: ErrorResponse['errors']
): APIGatewayProxyResult {
  const body: ErrorResponse = { message };
  if (errors) {
    body.errors = errors;
  }
  
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

/**
 * Create a standardized success response
 */
function createSuccessResponse(
  response: HandlerResponse,
  headers: Record<string, string>
): APIGatewayProxyResult {
  return {
    statusCode: response.statusCode,
    headers: { ...headers, ...response.headers },
    body: JSON.stringify(response.body),
  };
}

/**
 * Base environment schema - required for all handlers
 * Ensures ALLOWED_ORIGIN is present for CORS headers
 */
const baseEnvSchema = z.object({
  ALLOWED_ORIGIN: z.string(),
});

/**
 * Create a POST HTTP API Lambda handler with proper currying
 * 
 * @example
 * ```typescript
 * export const handler = createPostHandler(envSchema)(eventSchema)(bodySchema)(
 *   async (event, env, body) => {
 *     return { statusCode: 201, body: { message: 'Created' } };
 *   }
 * );
 * 
 * // Or with composition
 * const withAuthEnv = createPostHandler(authEnvSchema);
 * const withAuthEnvAndEvent = withAuthEnv(standardEventSchema);
 * 
 * export const signup = withAuthEnvAndEvent(signupBodySchema)(signupHandler);
 * export const login = withAuthEnvAndEvent(loginBodySchema)(loginHandler);
 * ```
 */
export function createPostHandler<TEnvSchema extends ZodSchema>(
  envSchema: TEnvSchema
) {
  return <TEventSchema extends ZodSchema>(eventSchema: TEventSchema) => {
    return <TBodySchema extends ZodSchema>(bodySchema: TBodySchema) => {
      return (
        handler: (
          event: z.infer<TEventSchema>,
          env: z.infer<TEnvSchema> & z.infer<typeof baseEnvSchema>,
          body: z.infer<TBodySchema>
        ) => Promise<HandlerResponse>
      ) => {
        return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
          try {
            // 1. Validate environment variables FIRST
            // Merge base schema (ALLOWED_ORIGIN) with user schema
            const combinedSchema = baseEnvSchema.and(envSchema);
            let env: z.infer<typeof combinedSchema>;
            try {
              env = combinedSchema.parse(process.env);
            } catch (error) {
              if (error instanceof ZodError) {
                console.error('Environment validation failed:', error.issues);
                // Use fallback headers for env validation errors
                const fallbackHeaders = buildCorsHeaders('*', 'POST,OPTIONS');
                return createErrorResponse(
                  500,
                  'Server configuration error',
                  fallbackHeaders,
                  formatZodError(error).errors
                );
              }
              throw error;
            }

            // 2. Now we have validated env with ALLOWED_ORIGIN, build CORS headers
            const corsHeaders = buildCorsHeaders(env.ALLOWED_ORIGIN, 'POST,OPTIONS');

            // 3. Validate event structure
            let validatedEvent: z.infer<TEventSchema>;
            try {
              validatedEvent = eventSchema.parse(event);
            } catch (error) {
              if (error instanceof ZodError) {
                return createErrorResponse(
                  400,
                  'Invalid request',
                  corsHeaders,
                  formatZodError(error).errors
                );
              }
              throw error;
            }

            // 4. Parse and validate request body
            if (!event.body) {
              return createErrorResponse(400, 'Missing request body', corsHeaders);
            }

            let parsedBody: any;
            try {
              parsedBody = JSON.parse(event.body);
            } catch {
              return createErrorResponse(400, 'Invalid JSON in request body', corsHeaders);
            }

            // Validate body against schema
            let validatedBody: z.infer<TBodySchema>;
            try {
              validatedBody = bodySchema.parse(parsedBody);
            } catch (error) {
              if (error instanceof ZodError) {
                return createErrorResponse(
                  400,
                  'Invalid request body',
                  corsHeaders,
                  formatZodError(error).errors
                );
              }
              throw error;
            }

            // 5. Execute handler with all validated inputs
            const response = await handler(validatedEvent, env, validatedBody);
            return createSuccessResponse(response, corsHeaders);
          } catch (error) {
            // Catch any unexpected errors
            console.error('Handler error:', error);
            const fallbackHeaders = buildCorsHeaders('*', 'POST,OPTIONS');
            return createErrorResponse(500, 'Internal server error', fallbackHeaders);
          }
        };
      };
    };
  };
}

/**
 * Create a GET HTTP API Lambda handler with proper currying
 * 
 * @example
 * ```typescript
 * export const handler = createGetHandler(envSchema)(eventSchema)(
 *   async (event, env) => {
 *     return { statusCode: 200, body: { data: 'something' } };
 *   }
 * );
 * 
 * // Or with composition
 * const withAuthEnv = createGetHandler(authEnvSchema);
 * const withAuthEvent = withAuthEnv(authEventSchema);
 * 
 * export const me = withAuthEvent(meHandler);
 * export const profile = withAuthEvent(profileHandler);
 * ```
 */
export function createGetHandler<TEnvSchema extends ZodSchema>(
  envSchema: TEnvSchema
) {
  return <TEventSchema extends ZodSchema>(eventSchema: TEventSchema) => {
    return (
      handler: (
        event: z.infer<TEventSchema>,
        env: z.infer<TEnvSchema> & z.infer<typeof baseEnvSchema>
      ) => Promise<HandlerResponse>
    ) => {
      return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
        try {
          // 1. Validate environment variables FIRST
          // Merge base schema (ALLOWED_ORIGIN) with user schema
          const combinedSchema = baseEnvSchema.and(envSchema);
          let env: z.infer<typeof combinedSchema>;
          try {
            env = combinedSchema.parse(process.env);
          } catch (error) {
            if (error instanceof ZodError) {
              console.error('Environment validation failed:', error.issues);
              // Use fallback headers for env validation errors
              const fallbackHeaders = buildCorsHeaders('*', 'GET,OPTIONS');
              return createErrorResponse(
                500,
                'Server configuration error',
                fallbackHeaders,
                formatZodError(error).errors
              );
            }
            throw error;
          }

          // 2. Now we have validated env with ALLOWED_ORIGIN, build CORS headers
          const corsHeaders = buildCorsHeaders(env.ALLOWED_ORIGIN, 'GET,OPTIONS');

          // 3. Validate event structure
          let validatedEvent: z.infer<TEventSchema>;
          try {
            validatedEvent = eventSchema.parse(event);
          } catch (error) {
            if (error instanceof ZodError) {
              return createErrorResponse(
                400,
                'Invalid request',
                corsHeaders,
                formatZodError(error).errors
              );
            }
            throw error;
          }

          // 4. Execute handler with validated inputs
          const response = await handler(validatedEvent, env);
          return createSuccessResponse(response, corsHeaders);
        } catch (error) {
          // Catch any unexpected errors
          console.error('Handler error:', error);
          const fallbackHeaders = buildCorsHeaders('*', 'GET,OPTIONS');
          return createErrorResponse(500, 'Internal server error', fallbackHeaders);
        }
      };
    };
  };
}
