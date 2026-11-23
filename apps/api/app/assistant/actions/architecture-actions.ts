import { AssistantToolKind } from '@coreloom-uml/llm'
import { withoutLayout } from '@coreloom-uml/uml'
import { z } from 'zod'
import { ARCHITECTURE_TITLE_MAX_LENGTH } from '#app/architectures/constants/limits'
import {
  ARCHITECTURE_VISIBILITIES,
  ArchitectureVisibility,
} from '#app/architectures/constants/visibility'
import Architecture from '#app/architectures/models/architecture'
import {
  createArchitecture,
  deleteArchitecture,
  duplicateArchitecture,
  updateArchitecture,
} from '#app/architectures/services/architecture-writes'
import { findOwnedArchitecture } from '#app/architectures/services/owned-architecture'
import {
  ASSISTANT_READ_LIST_MAX,
  type AssistantAction,
  idInput,
  NOT_FOUND_SENTENCE,
  readAction,
  TARGET_NOT_FOUND,
  writeAction,
} from '#app/assistant/actions/action'
import {
  ActionFailure,
  ActionImpact,
  AssistantTargetKind,
  READ_VIEWS_MAX_CHARS,
} from '#app/assistant/constants/assistant'
import Diagram from '#app/diagrams/models/diagram'
import { findOwnedProject } from '#app/projects/services/owned-project'
import {
  NOT_PROTECTED_MESSAGE,
  regenerateAccessCode,
  regenerateShareLink,
  setVisibility,
} from '#app/sharing/services/sharing'
import type User from '#app/users/models/user'

const architectureId = z.object({ architectureId: idInput() })

/** As `createArchitectureInput`'s `title`. */
const titleInput = () => z.string().trim().min(1).max(ARCHITECTURE_TITLE_MAX_LENGTH)

export const ARCHITECTURE_ACTIONS: readonly AssistantAction[] = [
  readAction({
    name: 'list_architectures',
    description:
      "Lists the owner's architectures, newest first, in one project when projectId is given: id, title, project id (null outside any project), who can open it (visibility: private, public with the link, protected by the link and an access code) and their views (diagrams) by id, title and kind.",
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
        // Never the share token or the access code.
        visibility: architecture.visibility,
        views: architecture.diagrams.map((diagram) => ({
          id: diagram.id,
          title: diagram.title,
          kind: diagram.kind,
        })),
      }))
    },
  }),
  readAction({
    name: 'read_views',
    description:
      "Reads the views (diagrams) of one of the owner's architectures as compact JSON: each view's id, kind, title and content. All of them, or only diagramIds. Views that do not fit are listed in leftOut by id and title: read them in another call with diagramIds.",
    input: z.object({
      architectureId: idInput(),
      diagramIds: z.array(idInput()).max(ASSISTANT_READ_LIST_MAX).optional(),
    }),
    kind: AssistantToolKind.Read,
    async read({ architectureId, diagramIds }, user) {
      const architecture = await findOwnedArchitecture(architectureId, user, { withDiagrams: true })
      if (!architecture) return NOT_FOUND_SENTENCE
      const wanted = architecture.diagrams.filter(
        (diagram) => !diagramIds || diagramIds.includes(diagram.id),
      )
      const views: { id: number; kind: string; title: string; content: unknown }[] = []
      const leftOut: { id: number; title: string }[] = []
      let room = READ_VIEWS_MAX_CHARS
      for (const diagram of wanted) {
        const content = diagram.content ? withoutLayout(diagram.content) : null
        const cost = JSON.stringify(content).length
        if (cost > room) {
          leftOut.push({ id: diagram.id, title: diagram.title })
          continue
        }
        room -= cost
        views.push({ id: diagram.id, kind: diagram.kind, title: diagram.title, content })
      }
      return { architecture: architecture.title, views, leftOut }
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
  writeAction({
    name: 'delete_architecture',
    description:
      "Proposes to delete one of the owner's architectures with its views; its share link stops working. It cannot be undone: propose it only when the owner clearly asked for this deletion.",
    input: architectureId,
    kind: AssistantToolKind.Write,
    destructive: true,
    subject: ({ architectureId }, user) => architectureTitle(architectureId, user),
    async impact({ architectureId }, user) {
      const architecture = await findOwnedArchitecture(architectureId, user)
      if (!architecture) return {}
      const [diagrams] = await Diagram.query()
        .where('architectureId', architecture.id)
        .count('* as total')
      return { [ActionImpact.Diagrams]: Number(diagrams.$extras.total) }
    },
    async apply({ architectureId }, user, client) {
      const architecture = await findOwnedArchitecture(architectureId, user)
      if (!architecture) return { failure: ActionFailure.NotFound }
      await deleteArchitecture(architecture, client)
      return { deleted: true }
    },
  }),
  writeAction({
    name: 'set_architecture_sharing',
    description:
      "Proposes to change who can open one of the owner's architectures: private (the owner only), public (anyone with its share link) or protected (the link and an access code). The owner reads the link and the code on the architecture's sharing screen; you never see them.",
    input: z.object({
      architectureId: idInput(),
      visibility: z.enum(ARCHITECTURE_VISIBILITIES),
    }),
    kind: AssistantToolKind.Write,
    // Leaving `protected` drops the access code: everyone who entered it loses access for good.
    destructive: (before) => before === ArchitectureVisibility.Protected,
    subject: ({ architectureId }, user) => architectureTitle(architectureId, user),
    async currentProblem({ architectureId, visibility }, user) {
      const current = await currentVisibility(architectureId, user)
      return current === visibility ? `This architecture is already ${visibility}.` : null
    },
    before: ({ architectureId }, user) => currentVisibility(architectureId, user),
    async apply({ architectureId, visibility }, user, client) {
      const architecture = await findOwnedArchitecture(architectureId, user)
      if (!architecture) return { failure: ActionFailure.NotFound }
      await setVisibility(architecture, visibility, client)
      return { kind: AssistantTargetKind.Architecture, id: architecture.id }
    },
  }),
  writeAction({
    name: 'regenerate_share_link',
    description:
      "Proposes to replace the share link of one of the owner's architectures: the old link stops working for everyone who has it. It cannot be undone: propose it only when the owner clearly asked for it. You never see the link.",
    input: architectureId,
    kind: AssistantToolKind.Write,
    destructive: true,
    subject: ({ architectureId }, user) => architectureTitle(architectureId, user),
    async apply({ architectureId }, user, client) {
      const architecture = await findOwnedArchitecture(architectureId, user)
      if (!architecture) return { failure: ActionFailure.NotFound }
      await regenerateShareLink(architecture, client)
      return { kind: AssistantTargetKind.Architecture, id: architecture.id }
    },
  }),
  writeAction({
    name: 'regenerate_access_code',
    description:
      "Proposes to replace the access code of one of the owner's protected architectures: everyone who entered the old code loses access. It cannot be undone: propose it only when the owner clearly asked for it. You never see the code.",
    input: architectureId,
    kind: AssistantToolKind.Write,
    destructive: true,
    subject: ({ architectureId }, user) => architectureTitle(architectureId, user),
    async currentProblem({ architectureId }, user) {
      const current = await currentVisibility(architectureId, user)
      return current === ArchitectureVisibility.Protected ? null : NOT_PROTECTED_MESSAGE
    },
    async apply({ architectureId }, user, client) {
      const architecture = await findOwnedArchitecture(architectureId, user)
      if (!architecture) return { failure: ActionFailure.NotFound }
      if (!(await regenerateAccessCode(architecture, client)))
        return { failure: ActionFailure.Conflict, message: NOT_PROTECTED_MESSAGE }
      return { kind: AssistantTargetKind.Architecture, id: architecture.id }
    },
  }),
]

async function architectureTitle(architectureId: number, user: User) {
  return (await findOwnedArchitecture(architectureId, user))?.title ?? TARGET_NOT_FOUND
}

async function currentVisibility(architectureId: number, user: User) {
  return (await findOwnedArchitecture(architectureId, user))?.visibility ?? null
}
