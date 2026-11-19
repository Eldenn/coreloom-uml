import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import {
  ARCHITECTURE_COPY_SUFFIX,
  ARCHITECTURE_TITLE_MAX_LENGTH,
} from '#app/architectures/constants/limits'
import { ArchitectureVisibility } from '#app/architectures/constants/visibility'
import Architecture from '#app/architectures/models/architecture'
import { DEFAULT_DIAGRAM, type DiagramKind } from '#app/diagrams/constants/diagram'
import { findOwnedProject } from '#app/projects/services/owned-project'
import type User from '#app/users/models/user'

/*
 * The writes of the architectures routes, shared with the assistant's accepted actions, which run
 * them inside their own transaction (`client`).
 */

export type CreateArchitectureFields = {
  projectId?: number | null
  title: string
  description?: string | null
  diagram?: { title?: string; kind: DiagramKind }
}

/**
 * Creates an architecture of `user` with one empty diagram (RM-11), in `projectId` when given:
 * `null` when that project is not the caller's (the route answers 404).
 */
export async function createArchitecture(
  user: User,
  { projectId, title, description, diagram }: CreateArchitectureFields,
  client?: TransactionClientContract,
): Promise<Architecture | null> {
  const project = projectId ? await findOwnedProject(projectId, user) : null
  if (projectId && !project) return null

  return (client ?? db).transaction(async (trx) => {
    const created = await Architecture.create(
      {
        userId: user.id,
        projectId: project?.id ?? null,
        title,
        description: description ?? null,
        visibility: ArchitectureVisibility.Private,
      },
      { client: trx },
    )
    await created.related('diagrams').create({
      title: diagram?.title ?? DEFAULT_DIAGRAM.title,
      kind: diagram?.kind ?? DEFAULT_DIAGRAM.kind,
      content: null,
      position: 0,
    })
    await created.load('diagrams')
    return created
  })
}

export type UpdateArchitectureFields = {
  projectId?: number | null
  title?: string
  description?: string | null
}

/**
 * Changes an owned architecture; omitted fields are left as is, `projectId` moves it (null takes
 * it out of its project). False when the target project is not the caller's: nothing is saved.
 */
export async function updateArchitecture(
  architecture: Architecture,
  user: User,
  { projectId, title, description }: UpdateArchitectureFields,
  client?: TransactionClientContract,
): Promise<boolean> {
  if (projectId !== undefined && projectId !== architecture.projectId) {
    if (projectId !== null && !(await findOwnedProject(projectId, user))) return false
    architecture.projectId = projectId
  }
  if (title !== undefined) architecture.title = title
  if (description !== undefined) architecture.description = description
  if (client) architecture.useTransaction(client)
  await architecture.save()
  return true
}

/**
 * RM-19: a copy of an owned architecture (diagrams preloaded) holding the same diagrams, in the
 * same project, private, with no link and no code.
 */
export function duplicateArchitecture(
  source: Architecture,
  user: User,
  client?: TransactionClientContract,
): Promise<Architecture> {
  const title = `${source.title.slice(0, ARCHITECTURE_TITLE_MAX_LENGTH - ARCHITECTURE_COPY_SUFFIX.length)}${ARCHITECTURE_COPY_SUFFIX}`

  return (client ?? db).transaction(async (trx) => {
    const created = await Architecture.create(
      {
        userId: user.id,
        projectId: source.projectId,
        title,
        description: source.description,
        visibility: ArchitectureVisibility.Private,
      },
      { client: trx },
    )
    await created.related('diagrams').createMany(
      source.diagrams.map((diagram) => ({
        title: diagram.title,
        kind: diagram.kind,
        format: diagram.format,
        content: diagram.content,
        position: diagram.position,
      })),
    )
    await created.load('diagrams', (diagrams) => diagrams.orderBy('position', 'asc'))
    return created
  })
}
