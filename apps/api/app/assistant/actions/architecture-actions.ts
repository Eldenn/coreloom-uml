import { AssistantToolKind } from '@coreloom-uml/llm'
import { z } from 'zod'
import { ARCHITECTURE_TITLE_MAX_LENGTH } from '#app/architectures/constants/limits'
import Architecture from '#app/architectures/models/architecture'
import {
  createArchitecture,
  duplicateArchitecture,
  updateArchitecture,
} from '#app/architectures/services/architecture-writes'
import { findOwnedArchitecture } from '#app/architectures/services/owned-architecture'
import {
  ASSISTANT_READ_LIST_MAX,
  type AssistantAction,
  idInput,
  readAction,
  TARGET_NOT_FOUND,
  writeAction,
} from '#app/assistant/actions/action'
import { ActionFailure, AssistantTargetKind } from '#app/assistant/constants/assistant'
import { findOwnedProject } from '#app/projects/services/owned-project'

/** As `createArchitectureInput`'s `title`. */
const titleInput = () => z.string().trim().min(1).max(ARCHITECTURE_TITLE_MAX_LENGTH)

export const ARCHITECTURE_ACTIONS: readonly AssistantAction[] = [
  readAction({
    name: 'list_architectures',
    description:
      "Lists the owner's architectures, newest first, in one project when projectId is given: id, title, project id (null outside any project) and their views (diagrams) by title and kind.",
    input: z.object({ projectId: idInput().optional() }),
    kind: AssistantToolKind.Read,
    async read({ projectId }, user) {
      const query = Architecture.query()
        .where('userId', user.id)
        .preload('diagrams', (diagrams) => diagrams.orderBy('position', 'asc'))
        .orderBy('updatedAt', 'desc')
        .orderBy('id', 'desc')
        .limit(ASSISTANT_READ_LIST_MAX)
      if (projectId) query.where('projectId', projectId)
      return (await query).map((architecture) => ({
        id: architecture.id,
        title: architecture.title,
        projectId: architecture.projectId,
        views: architecture.diagrams.map((diagram) => ({
          title: diagram.title,
          kind: diagram.kind,
        })),
      }))
    },
  }),
  writeAction({
    name: 'create_architecture',
    description:
      "Proposes to create an architecture with one empty view, in one of the owner's projects when projectId is given, outside any project otherwise.",
    input: z.object({ title: titleInput(), projectId: idInput().optional() }),
    kind: AssistantToolKind.Write,
    async subject({ projectId }, user) {
      if (projectId === undefined) return null
      return (await findOwnedProject(projectId, user))?.name ?? TARGET_NOT_FOUND
    },
    async apply({ title, projectId }, user, client) {
      const architecture = await createArchitecture(user, { title, projectId }, client)
      if (!architecture) return { failure: ActionFailure.NotFound }
      return { kind: AssistantTargetKind.Architecture, id: architecture.id }
    },
  }),
  writeAction({
    name: 'rename_architecture',
    description: "Proposes to change the title of one of the owner's architectures.",
    input: z.object({ architectureId: idInput(), title: titleInput() }),
    kind: AssistantToolKind.Write,
    async subject({ architectureId }, user) {
      return (await findOwnedArchitecture(architectureId, user))?.title ?? TARGET_NOT_FOUND
    },
    async apply({ architectureId, title }, user, client) {
      const architecture = await findOwnedArchitecture(architectureId, user)
      if (!architecture) return { failure: ActionFailure.NotFound }
      await updateArchitecture(architecture, user, { title }, client)
      return { kind: AssistantTargetKind.Architecture, id: architecture.id }
    },
  }),
  writeAction({
    name: 'duplicate_architecture',
    description:
      'Proposes to copy one of the owner\'s architectures with its views, in the same project, titled with " (copy)".',
    input: z.object({ architectureId: idInput() }),
    kind: AssistantToolKind.Write,
    async subject({ architectureId }, user) {
      return (await findOwnedArchitecture(architectureId, user))?.title ?? TARGET_NOT_FOUND
    },
    async apply({ architectureId }, user, client) {
      const source = await findOwnedArchitecture(architectureId, user, { withDiagrams: true })
      if (!source) return { failure: ActionFailure.NotFound }
      const copy = await duplicateArchitecture(source, user, client)
      return { kind: AssistantTargetKind.Architecture, id: copy.id }
    },
  }),
]
