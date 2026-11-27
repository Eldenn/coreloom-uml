import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Anthropic's skills (github.com/anthropics/skills) become a trusted repository of every install,
 * read through its marketplace.json. Like any trusted repository the admin may switch it off or
 * remove it; an install that already trusts it keeps its row.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(
      `INSERT INTO skill_sources (kind, owner, repo, path, enabled, created_at, updated_at)
        VALUES ('github', 'anthropics', 'skills', NULL, true, now(), now())
        ON CONFLICT DO NOTHING`,
    )
  }

  async down() {
    this.schema.raw(
      `DELETE FROM skill_sources
        WHERE kind = 'github' AND owner = 'anthropics' AND repo = 'skills' AND path IS NULL`,
    )
  }
}
