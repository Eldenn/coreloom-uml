/**
 * Named HTTP status codes.
 *
 * AdonisJS does not expose a public HTTP status enum, so this is the project's
 * single source of named status constants. Use these instead of hard-coding
 * numeric status values anywhere in the app.
 *
 * Extend this enum as new statuses are needed.
 */
export enum HttpStatus {
  // 2xx Success
  Ok = 200,
  Created = 201,
  Accepted = 202,
  NoContent = 204,

  // 3xx Redirection
  MovedPermanently = 301,
  Found = 302,
  NotModified = 304,

  // 4xx Client error
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  Conflict = 409,
  Gone = 410,
  UnprocessableEntity = 422,
  TooManyRequests = 429,

  // 5xx Server error
  InternalServerError = 500,
  NotImplemented = 501,
  BadGateway = 502,
  ServiceUnavailable = 503,
}
