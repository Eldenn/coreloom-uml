import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import type { DiagramFormat, DiagramKind } from '#app/diagrams/constants/diagram'
import type { DiagramContent } from '#app/diagrams/models/diagram'

/** One view as a milestone keeps it; `diagramId` is the view it was, which may be gone since. */
export type MilestoneDiagram = {
  diagramId: number
  title: string
  kind: DiagramKind
  format: DiagramFormat
  content: DiagramContent | null
  position: number
}

/** A named state of an architecture: its views as they were when the owner kept it. */
export default class Milestone extends BaseModel {
  static table = 'architecture_milestones'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare architectureId: number

  @column()
  declare userId: number

  @column()
  declare name: string

  /** In display order. Not selected by the list, which reads `diagramCount`. */
  @column({ prepare: (value: MilestoneDiagram[]) => JSON.stringify(value) })
  declare diagrams: MilestoneDiagram[]

  @column()
  declare diagramCount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
