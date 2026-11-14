import { describe, expect, it } from 'vitest'

import { findUncoveredFlows, traceFlow } from './flows.ts'
import { fixtureMap } from './test-fixtures.ts'

const map = fixtureMap('adonis')
const APP = 'apps/api/app'
const ARCHITECTURES = `${APP}/architectures/controllers/architectures-controller.ts#ArchitecturesController`
const PROJECTS = `${APP}/projects/controllers/projects-controller.ts#ProjectsController`

describe('findUncoveredFlows', () => {
  it('follows calls from every entry point, largest flows first', () => {
    const flows = findUncoveredFlows(map, [])
    expect(flows[0]).toEqual({
      entry: `${ARCHITECTURES}.update`,
      entryKind: 'route',
      nodes: [
        `${ARCHITECTURES}.update`,
        `${APP}/architectures/serializers/architecture-serializer.ts#serializeArchitectureDetail`,
        `${APP}/architectures/services/owned-architecture.ts#findOwnedArchitecture`,
        `${APP}/projects/services/owned-project.ts#findOwnedProject`,
        `${APP}/architectures/serializers/architecture-serializer.ts#serializeArchitecture`,
        `${APP}/shared/authorization/assert-owner.ts#assertOwner`,
      ],
      calls: [
        {
          from: `${ARCHITECTURES}.update`,
          to: `${APP}/architectures/serializers/architecture-serializer.ts#serializeArchitectureDetail`,
        },
        {
          from: `${ARCHITECTURES}.update`,
          to: `${APP}/architectures/services/owned-architecture.ts#findOwnedArchitecture`,
        },
        {
          from: `${ARCHITECTURES}.update`,
          to: `${APP}/projects/services/owned-project.ts#findOwnedProject`,
        },
        {
          from: `${APP}/architectures/serializers/architecture-serializer.ts#serializeArchitectureDetail`,
          to: `${APP}/architectures/serializers/architecture-serializer.ts#serializeArchitecture`,
        },
        {
          from: `${APP}/architectures/services/owned-architecture.ts#findOwnedArchitecture`,
          to: `${APP}/shared/authorization/assert-owner.ts#assertOwner`,
        },
        {
          from: `${APP}/projects/services/owned-project.ts#findOwnedProject`,
          to: `${APP}/shared/authorization/assert-owner.ts#assertOwner`,
        },
      ],
      folders: [
        `${APP}/architectures/controllers`,
        `${APP}/architectures/serializers`,
        `${APP}/architectures/services`,
        `${APP}/projects/services`,
        `${APP}/shared/authorization`,
      ],
      depth: 2,
    })
    expect(flows.map((flow) => flow.nodes.length)).toEqual(
      [...flows.map((flow) => flow.nodes.length)].sort((a, b) => b - a),
    )
    // The job and every route with a known call; the command calls nothing the map knows.
    expect(flows).toHaveLength(12)
    expect(flows.map((flow) => flow.entry)).toContain(
      `${APP}/jobs/refresh-skills_job.ts#RefreshSkillsJob.process`,
    )
  })

  it('leaves out flows that touch a linked class, file or symbol, never a folder', () => {
    const all = findUncoveredFlows(map, [])
    const withoutArchitectures = findUncoveredFlows(map, [ARCHITECTURES, `${APP}/architectures/`])
    expect(withoutArchitectures.some((flow) => flow.entry.startsWith(ARCHITECTURES))).toBe(false)
    expect(withoutArchitectures.length).toBe(all.length - 5)

    // Every project route that checks ownership goes through owned-project.ts.
    const linked = [`${APP}/projects/services/owned-project.ts`]
    expect(
      findUncoveredFlows(map, linked)
        .filter((flow) => flow.entry.startsWith(PROJECTS))
        .map((flow) => flow.entry),
    ).toEqual([`${PROJECTS}.index`, `${PROJECTS}.store`])
  })

  it('stops at the given depth and drops flows under the minimum size', () => {
    const shallow = findUncoveredFlows(map, [], { depth: 1, minSize: 4 })
    expect(shallow.map((flow) => [flow.entry, flow.nodes.length, flow.depth])).toEqual([
      [`${ARCHITECTURES}.update`, 4, 1],
    ])
  })
})

describe('traceFlow', () => {
  it('traces one entry point', () => {
    expect(traceFlow(map, `${PROJECTS}.show`).nodes).toEqual([
      `${PROJECTS}.show`,
      `${APP}/projects/serializers/project-serializer.ts#serializeProject`,
      `${APP}/projects/services/owned-project.ts#findOwnedProject`,
      `${APP}/shared/authorization/assert-owner.ts#assertOwner`,
    ])
  })
})
