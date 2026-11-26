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
   * Where the short-lived private folders a launch of the `claude` binary borrows are made
   * (`withClaudeFolder`): the subscriptions themselves are in the database. `claude:import` also
   * reads here the account folders from before (`<user id>`) to move them in. The tests always
   * get a folder of their own, whatever `CLAUDE_CODE_HOME` says: the import they run removes every
   * account folder whose account is not in the test database, which would remove the development
   * server's.
   */
  claudeCodeHome: app.inTest
    ? app.makePath('tmp/claude-test')
    : (env.get('CLAUDE_CODE_HOME') ?? app.makePath('tmp/claude')),
}

export default llmConfig
