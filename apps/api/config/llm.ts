import app from '@adonisjs/core/services/app'
import { parseAllowedOrigins } from '@coreloom-uml/llm'
import env from '#start/env'

/**
 * LLM calls made with the user's own key (rule proposals, connection test). Parsed at boot: a
 * malformed `LLM_ALLOWED_BASE_URLS` entry stops the server instead of allowing nothing.
 */
const llmConfig = {
  /** Origins an `ollama` or `openai-compatible` provider may call. */
  allowedOrigins: parseAllowedOrigins(env.get('LLM_ALLOWED_BASE_URLS')),
  /**
   * Where the `claude` binary keeps each account's Claude credentials, one folder per user id
   * (`CLAUDE_CONFIG_DIR`). A persistent volume in production: losing it signs everyone out.
   */
  claudeCodeHome: env.get('CLAUDE_CODE_HOME') ?? app.makePath('tmp/claude'),
}

export default llmConfig
