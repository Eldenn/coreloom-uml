import type { HttpContext } from '@adonisjs/core/http'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { ApiTokenAbility } from '#app/api-tokens/constants/api-token'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import { buildMcpServer } from '#app/mcp/services/mcp-server'

const MCP_NOT_FOUND = { error: { message: 'Not found' } } as const
const POST_ONLY = { error: { message: 'This MCP server only answers POST requests.' } } as const
const READ_NEEDED = {
  error: { message: `This API token does not have the "${ApiTokenAbility.Read}" ability.` },
} as const

/**
 * `/mcp`: the Model Context Protocol endpoint (Streamable HTTP, stateless, JSON answers) coding
 * agents read a project's diagrams and conventions through. API tokens only, behind `mcp-server`.
 */
export default class McpController {
  async handle({ request, response, auth }: HttpContext) {
    const user = auth.use('api').getUserOrFail()
    if (!(await isFeatureEnabled(FeatureFlagKey.McpServer, user))) {
      return response.notFound(MCP_NOT_FOUND)
    }
    // Every MCP call is a POST, so `tokenAbility` (which reads the method) cannot tell: every
    // tool reads, `read` is what the token needs.
    if (!user.currentAccessToken.allows(ApiTokenAbility.Read)) {
      return response.forbidden(READ_NEEDED)
    }
    // No stream from the server and no session to end: the protocol asks for a 405 here.
    if (request.method() !== 'POST') return response.methodNotAllowed(POST_ONLY)

    const headers = new Headers()
    for (const [name, value] of Object.entries(request.headers())) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
    }

    // One server and one transport per request: nothing is kept between two calls.
    const server = buildMcpServer(user)
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
    await server.connect(transport)
    try {
      const answer = await transport.handleRequest(
        new Request(request.completeUrl(), { method: 'POST', headers }),
        { parsedBody: request.body() },
      )
      // The protocol's own status and body, relayed as they are (not a route the web client calls).
      const contentType = answer.headers.get('content-type')
      if (contentType) response.header('content-type', contentType)
      return response.status(answer.status).send(await answer.text())
    } finally {
      await server.close()
    }
  }
}
