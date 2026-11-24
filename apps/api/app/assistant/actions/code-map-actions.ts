import { createHash } from 'node:crypto'
import {
  type CodeMap as CodeMapValue,
  diagramElementNames,
  type MatchableDiagram,
  missingCodeKeys,
} from '@coreloom-uml/codemap'
import { AssistantToolKind } from '@coreloom-uml/llm'
import { z } from 'zod'
import {
  ASSISTANT_READ_LIST_MAX,
  type AssistantAction,
  countOf,
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
} from '#app/assistant/constants/assistant'
import {
  CODE_MAP_LIMITS,
  CodeMapStatus,
  DiagramCodeLinkStatus,
} from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import CodeMapSuggestion from '#app/code-maps/models/code-map-suggestion'
import type DiagramCodeLink from '#app/code-maps/models/diagram-code-link'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import { extractionConfigured } from '#app/code-maps/services/code-map-extraction'
import { readCodeMapFile } from '#app/code-maps/services/code-map-storage'
import { deleteCodeMap } from '#app/code-maps/services/code-map-writes'
import { codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import {
  diagramLinks,
  duplicateLink,
  findMatchableDiagram,
  linkPair,
  matchStoredDiagram,
  replaceDiagramLinks,
} from '#app/code-maps/services/diagram-code-links'
import {
  GITHUB_IMPORT_REFUSALS,
  GithubImportRefusal,
  importGithubRepository,
  stopFollowing,
} from '#app/code-maps/services/github-import'
import { isValidBranch, parseGithubRepository } from '#app/code-maps/services/github-repository'
import { findOwnedCodeMap } from '#app/code-maps/services/owned-code-map'
import { CodeReviewResolution } from '#app/code-reviews/constants/code-review'
import CodeReviewFinding from '#app/code-reviews/models/code-review-finding'
import { deleteCodeReview, resolveFinding } from '#app/code-reviews/services/code-review-writes'
import { findOwnedCodeReview, findOwnedFinding } from '#app/code-reviews/services/owned-code-review'
import type Diagram from '#app/diagrams/models/diagram'
import { githubAppConfig } from '#app/github/services/github-app-config'
import { findGrant } from '#app/github/services/github-grants'
import { getCodeConformance } from '#app/mcp/services/mcp-code-conformance'
import { findOwnedProject } from '#app/projects/services/owned-project'
import type User from '#app/users/models/user'

/*
 * Code maps and conformance reviews, all behind `code-maps`. Nothing here calls a model, clones
 * or calls GitHub: an import only queues the existing job once the owner accepted it. Starting a
 * review, drawing from code and uploading a map are left to their screens.
 */

/** Every code action is offered only while the code map routes answer. */
const available = (user: User) => codeMapsEnabled(user)

/** Findings, links or elements a read answers per diagram. */
const READ_ITEMS_MAX = 50
const READ_LINKS_MAX = 200
/** Places in the code one element's candidates name, in a read. */
const READ_CANDIDATES_MAX = 10
/** Characters of a finding's comment kept as its action's subject. */
const FINDING_SUBJECT_MAX_LENGTH = 500

const NOT_GITHUB =
  'Not a GitHub repository: give https://github.com/<owner>/<name>, with no user name, token, port, query or deeper path.'
const NOT_A_BRANCH =
  'Not a branch name: letters, digits, `.`, `_`, `-` and `/` only, not starting with `-`, `/` or `.`.'
const MAP_NOT_READY = 'This code map is not ready: it is still being read, or reading it failed.'

async function projectName(projectId: number, user: User) {
  return (await findOwnedProject(projectId, user))?.name ?? TARGET_NOT_FOUND
}

/** A short name for a map: its repository and commit, or its creation date. */
function mapLabel(codeMap: CodeMap): string {
  const commit = codeMap.commitSha ? ` @ ${codeMap.commitSha.slice(0, 7)}` : ''
  return `${codeMap.repositoryUrl ?? (codeMap.createdAt.toISODate() as string)}${commit}`
}

/** The map and one diagram of its project, both the caller's, else null. */
async function linkTarget(codeMapId: number, diagramId: number, user: User) {
  const codeMap = await findOwnedCodeMap(codeMapId, user)
  const diagram = codeMap && (await findMatchableDiagram(diagramId, codeMap, user))
  return codeMap && diagram ? { codeMap, diagram } : null
}

const isReady = (codeMap: CodeMap): codeMap is CodeMap & { storageKey: string } =>
  codeMap.status === CodeMapStatus.Ready && codeMap.storageKey !== null

/** A short fingerprint of a diagram's links: links changed by hand since make the card stale. */
function linksFingerprint(links: readonly DiagramCodeLink[]): string {
  const rows = links.map((link) => [link.elementId, link.codeKey, link.status])
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16)
}

type LinkRef = { elementId: string; codeKey: string }
const pairs = (links: readonly LinkRef[]) =>
  links.map((link) => `${link.elementId} → ${link.codeKey}`).join(', ')

/** Why the links named cannot be added or removed on the diagram as it is now, or null. */
function linksProblem(
  input: { add?: LinkRef[]; remove?: LinkRef[] },
  diagram: Diagram,
  map: CodeMapValue,
  current: readonly DiagramCodeLink[],
): string | null {
  const add = input.add ?? []
  const remove = input.remove ?? []
  const names = diagram.content
    ? diagramElementNames(diagram.content as MatchableDiagram)
    : new Map<string, string>()
  const ghosts = add.filter((link) => !names.has(link.elementId))
  if (ghosts.length > 0) return `${pairs(ghosts)}: not an element of this diagram.`
  const missing = missingCodeKeys(
    map,
    add.map((link) => link.codeKey),
  )
  if (missing.length > 0) return `${missing.join(', ')}: not in this code map.`
  const existing = new Set(current.map(linkPair))
  const removed = new Set(remove.map(linkPair))
  const absent = remove.filter((link) => !existing.has(linkPair(link)))
  if (absent.length > 0) return `${pairs(absent)}: no such link to remove.`
  const taken = add.filter((link) => existing.has(linkPair(link)) && !removed.has(linkPair(link)))
  if (taken.length > 0) return `${pairs(taken)}: already linked.`
  if (current.length - remove.length + add.length > CODE_MAP_LIMITS.linksPerDiagram)
    return `A diagram holds at most ${String(CODE_MAP_LIMITS.linksPerDiagram)} links.`
  return null
}

/** The repository and branch a project follows, as `[url, branch]`; null when it follows none. */
async function followedNow(projectId: number): Promise<string | null> {
  const follow = await GithubCodeMapFollow.findBy('projectId', projectId)
  return follow ? JSON.stringify([follow.repositoryUrl, follow.branch]) : null
}

const linkRef = () =>
  z.object({
    elementId: z.string().min(1).max(CODE_MAP_LIMITS.elementId),
    codeKey: z.string().min(1).max(CODE_MAP_LIMITS.codeKey),
  })

export const CODE_MAP_ACTIONS: readonly AssistantAction[] = [
  readAction({
    name: 'list_code_maps',
    description:
      "Lists the code maps of one of the owner's projects, newest first (id, status, repository, branch, commit, counts, date), and the GitHub repository the project follows on each push, if any. A map holds names and paths only, never code.",
    input: z.object({ projectId: idInput() }),
    kind: AssistantToolKind.Read,
    available,
    async read({ projectId }, user) {
      const project = await findOwnedProject(projectId, user)
      if (!project) return { error: NOT_FOUND_SENTENCE }
      const [codeMaps, follow] = await Promise.all([
        CodeMap.query()
          .where('projectId', project.id)
          .orderBy('createdAt', 'desc')
          .orderBy('id', 'desc')
          .limit(ASSISTANT_READ_LIST_MAX),
        GithubCodeMapFollow.findBy('projectId', project.id),
      ])
      return {
        follows: follow ? { repositoryUrl: follow.repositoryUrl, branch: follow.branch } : null,
        codeMaps: codeMaps.map((codeMap) => ({
          id: codeMap.id,
          status: codeMap.status,
          source: codeMap.source,
          repositoryUrl: codeMap.repositoryUrl,
          branch: codeMap.branch,
          commitSha: codeMap.commitSha,
          nodeCount: codeMap.nodeCount,
          edgeCount: codeMap.edgeCount,
          createdAt: codeMap.createdAt.toISO(),
        })),
      }
    },
  }),
  readAction({
    name: 'read_code_conformance',
    description:
      "How the diagrams of one of the owner's projects match its code: for each diagram, the open findings of the newest conformance review (with their ids, for resolve_review_finding) and the findings of the deterministic match against the project's newest ready code map, each with its level and sentence. To start a new conformance review, send the owner to the Code tab of the project: a review is never started from here.",
    input: z.object({ projectId: idInput() }),
    kind: AssistantToolKind.Read,
    available,
    async read({ projectId }, user) {
      const project = await findOwnedProject(projectId, user)
      if (!project) return { error: NOT_FOUND_SENTENCE }
      const conformance = await getCodeConformance(project, user)
      if (!conformance) return { error: NOT_FOUND_SENTENCE }
      return {
        ...conformance,
        diagramsTotal: conformance.diagrams.length,
        diagrams: conformance.diagrams.slice(0, ASSISTANT_READ_LIST_MAX).map((diagram) => ({
          ...diagram,
          review: diagram.review && {
            ...diagram.review,
            findings: diagram.review.findings.slice(0, READ_ITEMS_MAX),
          },
          codeMatch: diagram.codeMatch && {
            ...diagram.codeMatch,
            findings: diagram.codeMatch.findings.slice(0, READ_ITEMS_MAX),
          },
        })),
      }
    },
  }),
  readAction({
    name: 'list_diagram_code_links',
    description:
      "The links the owner decided between the elements of one diagram and places in the code (elementId, codeKey, status), and, when the map is ready, what the match proposes for each element (its candidate code keys). The diagram must be in the map's project.",
    input: z.object({ codeMapId: idInput(), diagramId: idInput() }),
    kind: AssistantToolKind.Read,
    available,
    async read({ codeMapId, diagramId }, user) {
      const target = await linkTarget(codeMapId, diagramId, user)
      if (!target) return { error: NOT_FOUND_SENTENCE }
      const { codeMap, diagram } = target
      const links = await diagramLinks(diagram)
      const match = isReady(codeMap)
        ? matchStoredDiagram(diagram, await readCodeMapFile(codeMap.storageKey), links)
        : null
      const names = diagram.content
        ? diagramElementNames(diagram.content as MatchableDiagram)
        : new Map<string, string>()
      return {
        diagram: { id: diagram.id, title: diagram.title, kind: diagram.kind },
        linksTotal: links.length,
        links: links.slice(0, READ_LINKS_MAX).map(({ elementId, codeKey, status }) => ({
          elementId,
          codeKey,
          status,
        })),
        elements: match
          ? match.elements.slice(0, READ_LINKS_MAX).map((element) => ({
              elementId: element.elementId,
              name: names.get(element.elementId) ?? element.elementId,
              status: element.status,
              candidates: element.candidates
                .slice(0, READ_CANDIDATES_MAX)
                .map((candidate) => candidate.codeKey),
            }))
          : null,
        ...(match ? {} : { note: MAP_NOT_READY }),
      }
    },
  }),
  writeAction({
    name: 'import_code_map_from_github',
    description:
      "Proposes to map a github.com repository into one of the owner's projects: once accepted, the server reads it in the background (its default branch unless one is given). `follow: true` also reads it again on each push (it needs the GitHub App on that repository), `follow: false` stops following; left out, the follow is unchanged. Give the repository only as the owner wrote it: never a user name or token in the address.",
    input: z.object({
      projectId: idInput(),
      // Stored as the route stores it: `https://github.com/<owner>/<name>`, nothing else.
      url: z
        .string()
        .trim()
        .max(CODE_MAP_LIMITS.repositoryUrl)
        .overwrite((value) => parseGithubRepository(value)?.url ?? value),
      // In the schema, so a stored input is checked again when it is accepted.
      branch: z
        .string()
        .trim()
        .min(1)
        .max(CODE_MAP_LIMITS.branch)
        .refine(isValidBranch, { message: NOT_A_BRANCH })
        .optional(),
      follow: z.boolean().optional(),
    }),
    kind: AssistantToolKind.Write,
    available,
    problem({ url, branch }) {
      if (!parseGithubRepository(url)) return NOT_GITHUB
      if (branch !== undefined && !isValidBranch(branch)) return NOT_A_BRANCH
      return null
    },
    subject: ({ projectId }, user) => projectName(projectId, user),
    // A project keeps its newest maps only: one more may push the oldest out.
    destructive: (_before, impact) => (impact[ActionImpact.DroppedCodeMaps] ?? 0) > 0,
    async impact({ projectId }) {
      const held = await countOf(CodeMap.query().where('projectId', projectId))
      return { [ActionImpact.DroppedCodeMaps]: held - CODE_MAP_LIMITS.perProject + 1 }
    },
    // What the project follows now, when the import changes it: shown on the card.
    before: ({ projectId, follow }) =>
      follow === undefined ? Promise.resolve(null) : followedNow(projectId),
    async currentProblem({ url, follow }, user) {
      if (!extractionConfigured()) return GITHUB_IMPORT_REFUSALS[GithubImportRefusal.Off]
      if (follow === true && !((await githubAppConfig()) && (await findGrant(user.id, url))))
        return GITHUB_IMPORT_REFUSALS[GithubImportRefusal.FollowRefused]
      return null
    },
    async apply(input, user, client) {
      const project = await findOwnedProject(input.projectId, user)
      if (!project) return { failure: ActionFailure.NotFound }
      const outcome = await importGithubRepository(project, user, input, client)
      if ('refused' in outcome)
        return { failure: ActionFailure.Conflict, message: GITHUB_IMPORT_REFUSALS[outcome.refused] }
      // The job reads the new map: it is queued once the map is committed.
      return { kind: AssistantTargetKind.Project, id: project.id, afterCommit: outcome.queue }
    },
  }),
  writeAction({
    name: 'delete_code_map',
    description:
      "Proposes to delete one of the owner's code maps, with its file and the diagrams proposed for it. The diagrams' links to the code stay. It cannot be undone: propose it only when the owner clearly asked for this deletion.",
    input: z.object({ codeMapId: idInput() }),
    kind: AssistantToolKind.Write,
    available,
    destructive: true,
    async subject({ codeMapId }, user) {
      const codeMap = await findOwnedCodeMap(codeMapId, user)
      return codeMap ? mapLabel(codeMap) : TARGET_NOT_FOUND
    },
    async impact({ codeMapId }) {
      return {
        [ActionImpact.Suggestions]: await countOf(
          CodeMapSuggestion.query().where('codeMapId', codeMapId),
        ),
      }
    },
    async apply({ codeMapId }, user, client) {
      const codeMap = await findOwnedCodeMap(codeMapId, user)
      if (!codeMap) return { failure: ActionFailure.NotFound }
      return { deleted: true, afterCommit: await deleteCodeMap(codeMap, client) }
    },
  }),
  writeAction({
    name: 'stop_following_repository',
    description:
      "Proposes that one of the owner's projects stops reading its GitHub repository again on each push. Its maps stay.",
    input: z.object({ projectId: idInput() }),
    kind: AssistantToolKind.Write,
    available,
    subject: ({ projectId }, user) => projectName(projectId, user),
    async currentProblem({ projectId }) {
      return (await GithubCodeMapFollow.findBy('projectId', projectId))
        ? null
        : 'This project follows no GitHub repository.'
    },
    // The repository and branch followed, as `[url, branch]`: shown on the card.
    before: ({ projectId }) => followedNow(projectId),
    async apply({ projectId }, user, client) {
      const project = await findOwnedProject(projectId, user)
      if (!project || !(await stopFollowing(project, client)))
        return { failure: ActionFailure.NotFound }
      return { kind: AssistantTargetKind.Project, id: project.id }
    },
  }),
  writeAction({
    name: 'set_diagram_code_links',
    description:
      "Proposes to add and remove links between elements of one of the owner's diagrams and places in the code of a map of the same project (a node key, or a folder key ending with `/`). Only the links named change: name each with the exact elementId and codeKey that list_diagram_code_links answers. An added link is `confirmed` unless a status is given (`ignored`: never propose this place again).",
    input: z
      .object({
        codeMapId: idInput(),
        diagramId: idInput(),
        add: z
          .array(
            linkRef().extend({
              status: z.enum(DiagramCodeLinkStatus).default(DiagramCodeLinkStatus.Confirmed),
            }),
          )
          .max(CODE_MAP_LIMITS.linksPerDiagram)
          .optional(),
        remove: z.array(linkRef()).max(CODE_MAP_LIMITS.linksPerDiagram).optional(),
      })
      // In the schema, so a stored input is checked again when it is accepted.
      .superRefine(({ add = [], remove = [] }, context) => {
        const twice = duplicateLink(add) ?? duplicateLink(remove)
        if (twice) context.addIssue({ code: 'custom', message: `${pairs([twice])}: listed twice.` })
      }),
    kind: AssistantToolKind.Write,
    available,
    problem({ add = [], remove = [] }) {
      return add.length + remove.length === 0 ? 'Name at least one link to add or remove.' : null
    },
    async subject({ codeMapId, diagramId }, user) {
      return (await linkTarget(codeMapId, diagramId, user))?.diagram.title ?? TARGET_NOT_FOUND
    },
    async currentProblem(input, user) {
      const target = await linkTarget(input.codeMapId, input.diagramId, user)
      if (!target) return null
      if (!isReady(target.codeMap)) return MAP_NOT_READY
      const map = await readCodeMapFile(target.codeMap.storageKey)
      return linksProblem(input, target.diagram, map, await diagramLinks(target.diagram))
    },
    async before({ codeMapId, diagramId }, user) {
      const target = await linkTarget(codeMapId, diagramId, user)
      return target ? linksFingerprint(await diagramLinks(target.diagram)) : null
    },
    async apply({ codeMapId, diagramId, add = [], remove = [] }, user, client) {
      const target = await linkTarget(codeMapId, diagramId, user)
      if (!target) return { failure: ActionFailure.NotFound }
      // The set the route replaces whole, read and locked in this transaction: only the links
      // named change.
      const current = await diagramLinks(target.diagram, client).forUpdate()
      const removed = new Set(remove.map(linkPair))
      const kept = current
        .filter((link) => !removed.has(linkPair(link)))
        .map(({ elementId, codeKey, status }) => ({ elementId, codeKey, status }))
      await replaceDiagramLinks(target.diagram, [...kept, ...add], client)
      return { kind: AssistantTargetKind.Project, id: target.codeMap.projectId }
    },
  }),
  writeAction({
    name: 'resolve_review_finding',
    description:
      'Proposes to mark a finding of a conformance review `done` (the diagram or the code was fixed), `dismissed` (not worth acting on) or `open` again. Take its id from read_code_conformance.',
    input: z.object({ findingId: idInput(), resolution: z.enum(CodeReviewResolution) }),
    kind: AssistantToolKind.Write,
    available,
    async subject({ findingId }, user) {
      const finding = await findOwnedFinding(findingId, user)
      // Enough to recognise it: the conversation keeps this, not the review's whole comment.
      return finding ? finding.comment.slice(0, FINDING_SUBJECT_MAX_LENGTH) : TARGET_NOT_FOUND
    },
    async currentProblem({ findingId, resolution }) {
      const finding = await CodeReviewFinding.find(findingId)
      return finding?.resolution === resolution ? `This finding is already ${resolution}.` : null
    },
    async before({ findingId }) {
      return (await CodeReviewFinding.find(findingId))?.resolution ?? null
    },
    async apply({ findingId, resolution }, user, client) {
      const finding = await findOwnedFinding(findingId, user)
      if (!finding) return { failure: ActionFailure.NotFound }
      await resolveFinding(finding, resolution, client)
      return { kind: AssistantTargetKind.Project, id: finding.review.projectId }
    },
  }),
  writeAction({
    name: 'delete_code_review',
    description:
      "Proposes to delete one of the owner's conformance reviews with all its findings. It cannot be undone: propose it only when the owner clearly asked for this deletion.",
    input: z.object({ codeReviewId: idInput() }),
    kind: AssistantToolKind.Write,
    available,
    destructive: true,
    async subject({ codeReviewId }, user) {
      const review = await findOwnedCodeReview(codeReviewId, user)
      if (!review) return TARGET_NOT_FOUND
      const count = review.diagrams.length
      return `${review.createdAt.toISODate() as string} · ${String(count)} ${count === 1 ? 'diagram' : 'diagrams'}`
    },
    async impact({ codeReviewId }) {
      return {
        [ActionImpact.Findings]: await countOf(
          CodeReviewFinding.query().where('codeReviewId', codeReviewId),
        ),
      }
    },
    async apply({ codeReviewId }, user, client) {
      const review = await findOwnedCodeReview(codeReviewId, user)
      if (!review) return { failure: ActionFailure.NotFound }
      await deleteCodeReview(review, client)
      return { deleted: true }
    },
  }),
]
