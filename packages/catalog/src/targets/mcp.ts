// What the "live access" recommendations share. They only say how to register the MCP server
// of a Coreloom UML instance in a tool; the renderer never writes a tool's MCP settings.

/** The name the server is registered under in a tool. */
export const MCP_SERVER_NAME = 'coreloom-uml'
/** A placeholder: the renderer does not know the instance's address. */
export const MCP_SERVER_URL = 'https://<your-coreloom-uml-api>/mcp'
/** The environment variable the CLI already reads the account API key from. */
export const MCP_KEY_ENV = 'CORELOOM_UML_API_KEY'

const INTRO = `AGENTS.md is a copy made when it was generated. If the MCP server is enabled on your Coreloom UML instance, your coding tool can read the current diagrams and conventions instead. Create an API key with the \`read\` ability on your account page, put it in \`${MCP_KEY_ENV}\`, and replace the address below with your instance's API.`

/** The recommendation of one tool: the shared introduction, then its own way to register. */
export function mcpRecommendation(how: string, language: string, snippet: string) {
  return {
    title: 'Live access through MCP',
    body: `${INTRO} ${how}\n\n\`\`\`${language}\n${snippet}\n\`\`\``,
  }
}

/** The JSON of a tool whose settings file holds an `mcpServers` object. */
export function mcpServersJson(server: Record<string, unknown>): string {
  return JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: server } }, null, 2)
}
