import { BaseSchema } from '@adonisjs/lucid/schema'
import { DIAGRAM_FORMATS, DiagramFormat } from '#app/diagrams/constants/diagram'

export default class extends BaseSchema {
  protected tableName = 'diagrams'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('architecture_id')
        .notNullable()
        .references('id')
        .inTable('architectures')
        .onDelete('CASCADE')
      table.index('architecture_id')
      table.string('title', 120).notNullable()
      // Checked by the app (DIAGRAM_KINDS), not by a constraint: new UML kinds
      // from coreloom-ui then need no migration.
      table.string('kind', 32).notNullable()
      table
        .enu('format', [...DIAGRAM_FORMATS], { useNative: false, enumName: 'diagram_format' })
        .notNullable()
        .defaultTo(DiagramFormat.Mermaid)
      // The coreloom-ui UML JSON (layout included); null until the first save.
      table.jsonb('content').nullable()
      table.integer('position').notNullable()
      // Optimistic concurrency: a save must name the version it was based on.
      table.integer('version').notNullable().defaultTo(1)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
