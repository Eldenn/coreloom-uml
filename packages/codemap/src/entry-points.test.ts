import { describe, expect, it } from 'vitest'

import type { CodeMap } from './code-map.ts'
import { detectEntryPoints } from './entry-points.ts'
import { fixtureMap } from './test-fixtures.ts'

function entries(map: CodeMap) {
  return map.nodes.filter((node) => node.entry).map((node) => `${node.entry} ${node.key}`)
}

function tiny(nodes: CodeMap['nodes'], edges: CodeMap['edges'] = []): CodeMap {
  return {
    header: {
      version: 1,
      extractor: { name: 'test', version: '1' },
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
    nodes,
    edges,
  }
}

describe('detectEntryPoints', () => {
  it('finds AdonisJS routes, jobs and commands in this repository', () => {
    const app = 'apps/api/app'
    expect(entries(fixtureMap('adonis'))).toEqual([
      `route ${app}/architectures/controllers/architectures-controller.ts#ArchitecturesController.destroy`,
      `route ${app}/architectures/controllers/architectures-controller.ts#ArchitecturesController.index`,
      `route ${app}/architectures/controllers/architectures-controller.ts#ArchitecturesController.show`,
      `route ${app}/architectures/controllers/architectures-controller.ts#ArchitecturesController.store`,
      `route ${app}/architectures/controllers/architectures-controller.ts#ArchitecturesController.update`,
      `route ${app}/architectures/controllers/duplicate-architecture-controller.ts#DuplicateArchitectureController.handle`,
      `job ${app}/jobs/refresh-skills_job.ts#RefreshSkillsJob.process`,
      `route ${app}/projects/controllers/projects-controller.ts#ProjectsController.destroy`,
      `route ${app}/projects/controllers/projects-controller.ts#ProjectsController.index`,
      `route ${app}/projects/controllers/projects-controller.ts#ProjectsController.show`,
      `route ${app}/projects/controllers/projects-controller.ts#ProjectsController.store`,
      `route ${app}/projects/controllers/projects-controller.ts#ProjectsController.update`,
      'command apps/api/commands/skills-refresh.ts#SkillsRefresh.run',
    ])
  })

  it('finds Express handlers, NestJS routes, a BullMQ worker, a job and a command', () => {
    // fixtures/frameworks/src, read by graphify.
    expect(entries(fixtureMap('frameworks'))).toEqual([
      'command src/commands/sync-users.ts#SyncUsers.run',
      'route src/routes/orders.ts#createOrder',
      'route src/routes/orders.ts#listOrders',
      'job src/send-mail_job.ts#SendMailJob.process',
      'route src/users/users.controller.ts#UsersController.create',
      'route src/users/users.controller.ts#UsersController.findAll',
      'job src/worker.ts#worker',
    ])
  })

  it('reads decorators, and skips constructors, private methods and tests', () => {
    const map = tiny(
      [
        { key: 'a.ts#A', name: 'A', kind: 'class', path: 'a.ts', annotations: ['Command'] },
        { key: 'a.ts#A.run', name: 'A.run', kind: 'method', path: 'a.ts' },
        {
          key: 'a.ts#onOrder',
          name: 'onOrder',
          kind: 'function',
          path: 'a.ts',
          annotations: ['OnEvent'],
        },
        {
          key: 'a.ts#nightly',
          name: 'nightly',
          kind: 'function',
          path: 'a.ts',
          annotations: ['Cron'],
        },
        {
          key: 'a.ts#list',
          name: 'list',
          kind: 'function',
          path: 'a.ts',
          annotations: ['GetMapping'],
        },
        {
          key: 'tests/a.spec.ts#get',
          name: 'get',
          kind: 'function',
          path: 'tests/a.spec.ts',
          annotations: ['Get'],
        },
        { key: 'app/listeners/l.ts#L', name: 'L', kind: 'class', path: 'app/listeners/l.ts' },
        {
          key: 'app/listeners/l.ts#L.constructor',
          name: 'L.constructor',
          kind: 'method',
          path: 'app/listeners/l.ts',
        },
        {
          key: 'app/listeners/l.ts#L.#secret',
          name: 'L.#secret',
          kind: 'method',
          path: 'app/listeners/l.ts',
        },
        {
          key: 'app/listeners/l.ts#L.handle',
          name: 'L.handle',
          kind: 'method',
          path: 'app/listeners/l.ts',
        },
      ],
      [
        { from: 'a.ts#A', to: 'a.ts#A.run', kind: 'contains', confidence: 'extracted' },
        {
          from: 'app/listeners/l.ts#L',
          to: 'app/listeners/l.ts#L.handle',
          kind: 'contains',
          confidence: 'extracted',
        },
      ],
    )
    expect(entries(detectEntryPoints(map))).toEqual([
      'command a.ts#A.run',
      'handler a.ts#onOrder',
      'job a.ts#nightly',
      'route a.ts#list',
      'handler app/listeners/l.ts#L.handle',
    ])
  })

  it('clears entry points that no rule finds any more', () => {
    const map = tiny([{ key: 'a.ts#f', name: 'f', kind: 'function', path: 'a.ts', entry: 'route' }])
    expect(detectEntryPoints(map).nodes[0]).toEqual({
      key: 'a.ts#f',
      name: 'f',
      kind: 'function',
      path: 'a.ts',
    })
  })
})
