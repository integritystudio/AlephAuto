/**
 * Shared HTTP status code constants.
 * GENERATED from shared/constants/http-status.yaml by scripts/generate-http-status-constants.ts.
 * Do not edit manually.
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];
