import { defineConfig } from '@adonisjs/core/bodyparser'

/**
 * Bodyparser configuration. Controls how incoming request bodies are parsed
 * for the form, JSON and raw content types.
 */
export default defineConfig({
  /**
   * HTTP methods for which the body is parsed.
   */
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * URL-encoded form parser.
   */
  form: {
    convertEmptyStringsToNull: true,
    types: ['application/x-www-form-urlencoded'],
  },

  /**
   * JSON parser.
   */
  json: {
    // A diagram's content may be up to 1 MB (see DIAGRAM_CONTENT_MAX_BYTES).
    limit: '2mb',
    convertEmptyStringsToNull: true,
    types: ['application/json', 'application/json-patch+json', 'application/vnd.api+json'],
  },

  /**
   * Raw text parser. The body is exposed as a string and left unparsed.
   */
  raw: {
    types: ['text/*'],
  },
})
