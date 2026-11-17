import type { HttpContext } from '@adonisjs/core/http'
import { RULE_PACKS } from '@coreloom-uml/catalog'
import { serializeRulePack } from '#app/agent-configs/serializers/agent-config-serializer'
import type { RulePackOutput } from '#app/agent-configs/validators/agent-configs-output'

const PACKS: RulePackOutput[] = RULE_PACKS.map(serializeRulePack)

/**
 * The catalog's rule packs, at the server's version: the web app never imports them. Every pack
 * is open to every configuration.
 */
export default class RulePacksController {
  async index({ response }: HttpContext) {
    return response.ok({ packs: PACKS })
  }
}
