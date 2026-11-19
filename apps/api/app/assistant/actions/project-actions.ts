import { AssistantToolKind } from '@coreloom-uml/llm'
import { z } from 'zod'
import {
  ASSISTANT_READ_LIST_MAX,
  type AssistantAction,
  idInput,
  readAction,
  TARGET_NOT_FOUND,
  writeAction,
} from '#app/assistant/actions/action'
import { ActionFailure, AssistantTargetKind } from '#app/assistant/constants/assistant'
import { PROJECT_NAME_MAX_LENGTH } from '#app/projects/constants/limits'
import Project from '#app/projects/models/project'
import { findOwnedProject } from '#app/projects/services/owned-project'
import { createProject, updateProject } from '#app/projects/services/project-writes'

/** As `createProjectInput`'s `name`. */
const nameInput = () => z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH)

export const PROJECT_ACTIONS: readonly AssistantAction[] = [
  readAction({
    name: 'list_projects',
    description:
      "Lists the owner's projects, newest first: id, name, how many architectures each holds and whether it has agent conventions.",
    input: z.object({}),
    kind: AssistantToolKind.Read,
    async read(_input, user) {
      const projects = await Project.query()
        .where('userId', user.id)
        .withCount('architectures')
        .withCount('agentConfig', (query) => query.as('agent_configs_count'))
        .orderBy('updatedAt', 'desc')
        .orderBy('id', 'desc')
        .limit(ASSISTANT_READ_LIST_MAX)
      return projects.map((project) => ({
        id: project.id,
        name: project.name,
        architectures: Number(project.$extras.architectures_count),
        hasAgentConventions: Number(project.$extras.agent_configs_count) > 0,
      }))
    },
  }),
  writeAction({
    name: 'create_project',
    description: 'Proposes to create a project with this name.',
    input: z.object({ name: nameInput() }),
    kind: AssistantToolKind.Write,
    subject: async () => null,
    async apply({ name }, user, client) {
      const project = await createProject(user, { name }, client)
      return { kind: AssistantTargetKind.Project, id: project.id }
    },
  }),
  writeAction({
    name: 'rename_project',
    description: "Proposes to rename one of the owner's projects.",
    input: z.object({ projectId: idInput(), name: nameInput() }),
    kind: AssistantToolKind.Write,
    async subject({ projectId }, user) {
      return (await findOwnedProject(projectId, user))?.name ?? TARGET_NOT_FOUND
    },
    async apply({ projectId, name }, user, client) {
      const project = await findOwnedProject(projectId, user)
      if (!project) return { failure: ActionFailure.NotFound }
      await updateProject(project, { name }, client)
      return { kind: AssistantTargetKind.Project, id: project.id }
    },
  }),
]
