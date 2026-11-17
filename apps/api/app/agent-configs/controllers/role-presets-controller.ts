import type { HttpContext } from '@adonisjs/core/http'
import {
  AGENCY_AGENTS_COMMIT,
  AGENCY_AGENTS_REPOSITORY,
  READ_ONLY_PRESETS,
  ROLE_PRESETS,
} from '@coreloom-uml/catalog'
import { AGENT_ROLES_NOT_FOUND, agentRolesEnabled } from '#app/agent-configs/services/roles-flag'
import type { RolePresetOutput } from '#app/agent-configs/validators/agent-configs-output'

const SOURCE = { repository: AGENCY_AGENTS_REPOSITORY, commit: AGENCY_AGENTS_COMMIT } as const

/** Without their missions: with them the list weighs about 1 MB. */
const PRESETS: RolePresetOutput[] = ROLE_PRESETS.map(({ slug, name, description }) => ({
  slug,
  name,
  description,
  readOnly: READ_ONLY_PRESETS.has(slug),
  source: SOURCE,
}))

/** The catalog's ready-made roles, at the server's version. */
export default class RolePresetsController {
  async index({ auth, response }: HttpContext) {
    if (!(await agentRolesEnabled(auth.getUserOrFail()))) {
      return response.notFound(AGENT_ROLES_NOT_FOUND)
    }
    return response.ok({ presets: PRESETS })
  }
}
