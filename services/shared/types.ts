import { z } from 'zod';
import { APIGatewayProxyResult } from 'aws-lambda';

/**
 * Response body type for handler functions
 * Can be any JSON-serializable value
 */
export type ResponseBody = Record<string, any> | any[];

/**
 * Handler response type
 * Contains statusCode and body (pre-serialization)
 */
export interface HandlerResponse {
  statusCode: number;
  body: ResponseBody;
  headers?: Record<string, string>;
}

/**
 * Configuration for CORS headers
 */
export interface CorsConfig {
  allowedOrigin: string;
  allowedHeaders?: string;
  allowedMethods?: string;
}

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  message: string;
  errors?: Array<{
    path: string[];
    message: string;
  }>;
}
