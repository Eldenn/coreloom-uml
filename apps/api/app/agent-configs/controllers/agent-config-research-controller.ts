import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { LlmCallError, LlmFailureReason, researchWeb } from '@coreloom-uml/llm'
import {
  AGENT_CONFIG_NOT_FOUND,
  findOwnedAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { agentResearchInput } from '#app/agent-configs/validators/agent-configs-input'
import type {
  AgentResearchOutput,
  AgentResearchProgressOutput,
} from '#app/agent-configs/validators/agent-configs-output'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import {
  ProviderKind,
  SUBSCRIPTION_NOT_FOUND,
} from '#app/llm-connections/constants/llm-connections'
import {
  RESEARCH_BUSY,
  RESEARCH_NEEDS_TOOLS,
  RESEARCH_NOT_FOUND,
  researchTimeLeft,
} from '#app/research/constants/research'
import { researchConfig } from '#app/research/services/research-config'
import { acquireResearch, releaseResearch } from '#app/research/services/research-lock'
import { readProgress, trackProgress } from '#app/research/services/research-progress'
import ResearchSandbox, { type OpenSandbox } from '#app/research/services/research-sandbox'

/**
 * `POST /agent-configs/:id/research`: the user's own model reads the web pages a request names,
 * through tools that run in an E2B sandbox, and answers what it found with the pages it read.
 * Nothing is stored: the screen sends the findings to `POST …/imports` (`origin: 'research'`),
 * whose proposals the owner accepts one by one. Behind the `web-research` flag and
 * `E2B_API_KEY` (404 without either). Session only.
 *
 * Two levels of trust, kept apart: this call has tools and reads untrusted pages, so the model
 * gets the request and nothing of the configuration; the import that follows reads the
 * configuration and has no tool. The key (or the connected subscription) never reaches the
 * sandbox, and the request, the pages and the findings are never logged: counts only. While it
 * runs, the addresses read and the commands run are kept in Redis for `show`, and removed at
 * the end (`research-progress.ts`).
 *
 * The whole call fits in `RESEARCH_REQUEST_BUDGET_MS`, under what the production proxy allows:
 * the sandbox's start and end have their own short timeouts, the loop gets what is left
 * (`researchTimeLeft`) and its tools stop with it. An account runs one research at a time.
 */
export default class AgentConfigResearchController {
  async store({ params, request, auth, response }: HttpContext) {
    const started = performance.now()
    const user = auth.getUserOrFail()
    const sandboxConfig = researchConfig()
    if (!sandboxConfig || !(await isFeatureEnabled(FeatureFlagKey.WebResearch, user))) {
      return response.notFound(RESEARCH_NOT_FOUND)
    }
    const config = await findOwnedAgentConfig(params.id, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    const { provider, apiKey, request: asked } = await request.validateUsing(agentResearchInput)
    // The ChatGPT subscription is not known to carry a tool call from one step to the next. The
    // Claude one works: its binary has no tool, and names ours one step at a time.
    if (provider.kind === ProviderKind.OpenAICodex) {
      return response.unprocessableEntity(RESEARCH_NEEDS_TOOLS)
    }
    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)

    const log = { agentConfigId: config.id, kind: provider.kind, model: provider.model }
    const elapsed = () => Math.round(performance.now() - started)
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'agent web research failed')
      return response.badGateway(llmFailure(built.reason))
    }

    if (!(await acquireResearch(user.id))) return response.conflict(RESEARCH_BUSY)
    let sandbox: OpenSandbox | null = null
    let progress: ReturnType<typeof trackProgress> | null = null
    try {
      sandbox = await (await app.container.make(ResearchSandbox)).open(sandboxConfig)
      progress = trackProgress(user.id, sandbox.tools)
      // What the sandbox took to start comes off the model's time, not on top of the budget.
      const timeoutMs = researchTimeLeft(elapsed())
      if (timeoutMs === null) throw new LlmCallError(LlmFailureReason.Timeout)
      const result: AgentResearchOutput = await researchWeb(
        built.model,
        { request: asked, tools: progress.tools },
        { timeoutMs },
      )
      logger.info(
        {
          ...log,
          durationMs: elapsed(),
          sources: result.sources.length,
          length: result.findings.length,
        },
        'agent web research',
      )
      return response.ok(result)
    } catch (error) {
      if (!(error instanceof LlmCallError)) throw error
      logger.warn(
        { ...log, durationMs: elapsed(), reason: error.reason },
        'agent web research failed',
      )
      return response.badGateway(llmFailure(error.reason))
    } finally {
      await sandbox?.close()
      await progress?.clear()
      await releaseResearch(user.id)
    }
  }

  /**
   * `GET /agent-configs/:id/research`: what the account's running research has done so far (the
   * addresses read and the commands run, never their results), for the screen to show while the
   * `POST` is pending. Empty when none runs: the steps go with the research.
   */
  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!researchConfig() || !(await isFeatureEnabled(FeatureFlagKey.WebResearch, user))) {
      return response.notFound(RESEARCH_NOT_FOUND)
    }
    const config = await findOwnedAgentConfig(params.id, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)
    const output: AgentResearchProgressOutput = { steps: await readProgress(user.id) }
    return response.ok(output)
  }
}
