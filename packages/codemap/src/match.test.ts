import type { UmlSpec } from '@coreloom-uml/uml'
import { describe, expect, it } from 'vitest'

import { linkedCodeKeys, matchDiagram } from './match.ts'
import { fixtureMap } from './test-fixtures.ts'

const map = fixtureMap('adonis')
const APP = 'apps/api/app'
const PROJECTS_CONTROLLER = `${APP}/projects/controllers/projects-controller.ts#ProjectsController`
const ARCHITECTURES_CONTROLLER = `${APP}/architectures/controllers/architectures-controller.ts#ArchitecturesController`

describe('matchDiagram: package diagrams', () => {
  const diagram: UmlSpec = {
    kind: 'package',
    elements: [
      { id: 'app', kind: 'package', label: 'apps/api/app' },
      { id: 'architectures', kind: 'package', label: 'architectures', parent: 'app' },
      { id: 'projects', kind: 'package', label: 'projects', parent: 'app' },
      { id: 'shared', kind: 'package', label: 'shared', parent: 'app' },
      { id: 'controllers', kind: 'package', label: 'controllers' },
      { id: 'billing', kind: 'package', label: 'billing', parent: 'app' },
      { id: 'project', kind: 'class', label: 'Project', parent: 'projects' },
    ],
    relations: [
      { from: 'architectures', to: 'projects' },
      { from: 'projects', to: 'architectures' },
      { from: 'shared', to: 'projects' },
    ],
  }

  it('reads a package name as a folder, under its parent’s folder', () => {
    const { elements } = matchDiagram(diagram, map)
    expect(elements).toEqual([
      {
        elementId: 'app',
        status: 'suggested',
        candidates: [{ codeKey: 'apps/api/app/', reason: 'folder-path' }],
      },
      {
        elementId: 'architectures',
        status: 'suggested',
        candidates: [{ codeKey: `${APP}/architectures/`, reason: 'folder-path' }],
      },
      {
        elementId: 'projects',
        status: 'suggested',
        candidates: [{ codeKey: `${APP}/projects/`, reason: 'folder-path' }],
      },
      {
        elementId: 'shared',
        status: 'suggested',
        candidates: [{ codeKey: `${APP}/shared/`, reason: 'folder-path' }],
      },
      {
        // Not a path from the root: every folder of that name, to choose from.
        elementId: 'controllers',
        status: 'suggested',
        candidates: [
          { codeKey: `${APP}/architectures/controllers/`, reason: 'folder-name' },
          { codeKey: `${APP}/projects/controllers/`, reason: 'folder-name' },
        ],
      },
      { elementId: 'billing', status: 'missing', candidates: [] },
      {
        elementId: 'project',
        status: 'suggested',
        candidates: [
          { codeKey: `${APP}/projects/models/project.ts#Project`, reason: 'class-name' },
        ],
      },
    ])
  })

  it('checks drawn dependencies against the code and reports the undrawn ones', () => {
    const { relations, findings } = matchDiagram(diagram, map)
    expect(relations.map(({ from, to, status }) => `${from} ${to} ${status}`)).toEqual([
      'architectures projects found',
      'projects architectures found',
      'shared projects missing',
    ])
    expect(relations[0]?.evidence[0]).toEqual({
      from: `${APP}/architectures/controllers/architectures-controller.ts`,
      to: `${APP}/projects/services/owned-project.ts`,
    })
    expect(findings).toEqual([
      { kind: 'missing-in-code', elementId: 'billing' },
      { kind: 'relation-not-in-code', from: 'shared', to: 'projects' },
      {
        kind: 'dependency-not-drawn',
        from: 'architectures',
        to: 'shared',
        count: 3,
        evidence: [
          {
            from: `${APP}/architectures/services/owned-architecture.ts`,
            to: `${APP}/shared/authorization/assert-owner.ts`,
          },
          {
            from: `${APP}/architectures/services/owned-architecture.ts`,
            to: `${APP}/shared/authorization/assert-owner.ts#assertOwner`,
          },
          {
            from: `${APP}/architectures/services/owned-architecture.ts#findOwnedArchitecture`,
            to: `${APP}/shared/authorization/assert-owner.ts#assertOwner`,
          },
        ],
      },
      expect.objectContaining({ kind: 'dependency-not-drawn', from: 'projects', to: 'shared' }),
    ])
  })

  it('keeps the user’s decisions: confirmed links win, ignored ones are not proposed again', () => {
    const { elements, findings } = matchDiagram(diagram, map, [
      { elementId: 'controllers', codeKey: `${APP}/projects/controllers/`, status: 'ignored' },
      { elementId: 'billing', codeKey: `${APP}/skills/`, status: 'confirmed' },
      { elementId: 'shared', codeKey: `${APP}/billing/`, status: 'confirmed' },
    ])
    expect(elements.find((element) => element.elementId === 'controllers')?.candidates).toEqual([
      { codeKey: `${APP}/architectures/controllers/`, reason: 'folder-name' },
    ])
    expect(elements.find((element) => element.elementId === 'billing')).toEqual({
      elementId: 'billing',
      status: 'confirmed',
      candidates: [{ codeKey: `${APP}/skills/`, reason: 'confirmed' }],
    })
    // A confirmed link whose code is gone is reported, and proposals take over.
    expect(findings).toContainEqual({
      kind: 'stale-link',
      elementId: 'shared',
      codeKey: `${APP}/billing/`,
    })
    expect(elements.find((element) => element.elementId === 'shared')?.status).toBe('suggested')
  })
})

describe('matchDiagram: class diagrams', () => {
  it('matches classes by name and checks relations against the code', () => {
    const diagram: UmlSpec = {
      kind: 'class',
      classes: [
        { id: 'Architecture' },
        { id: 'project', label: 'Project', namespace: 'projects.models' },
        { id: 'BaseModel' },
      ],
      relations: [
        { from: 'Architecture', to: 'BaseModel', kind: 'inheritance' },
        { from: 'Architecture', to: 'project', kind: 'association' },
        { from: 'project', to: 'Architecture', kind: 'inheritance' },
      ],
    }
    const result = matchDiagram(diagram, map)
    expect(result.elements.map((element) => [element.elementId, element.status])).toEqual([
      ['Architecture', 'suggested'],
      ['project', 'suggested'],
      ['BaseModel', 'missing'],
    ])
    expect(result.relations.map(({ from, to, status }) => `${from} ${to} ${status}`)).toEqual([
      'Architecture BaseModel unresolved',
      'Architecture project found',
      'project Architecture missing',
    ])
    expect(result.findings).toEqual([
      { kind: 'missing-in-code', elementId: 'BaseModel' },
      { kind: 'relation-not-in-code', from: 'project', to: 'Architecture' },
    ])
  })

  it('reports typed references between drawn classes that no relation shows, both ways', () => {
    const diagram: UmlSpec = {
      kind: 'class',
      classes: [{ id: 'Architecture' }, { id: 'Project' }],
      relations: [],
    }
    expect(matchDiagram(diagram, map).findings).toEqual([
      {
        kind: 'dependency-not-drawn',
        from: 'Architecture',
        to: 'Project',
        count: 1,
        evidence: [
          {
            from: `${APP}/architectures/models/architecture.ts#Architecture`,
            to: `${APP}/projects/models/project.ts#Project`,
          },
        ],
      },
      expect.objectContaining({
        kind: 'dependency-not-drawn',
        from: 'Project',
        to: 'Architecture',
      }),
    ])
  })
})

describe('matchDiagram: sequence diagrams', () => {
  it('matches participants by class or file name and messages by calls', () => {
    const diagram: UmlSpec = {
      kind: 'sequence',
      participants: [
        { id: 'user', kind: 'actor' },
        { id: 'controller', label: 'ProjectsController' },
        { id: 'owned', label: 'owned-project' },
      ],
      steps: [
        { type: 'message', from: 'user', to: 'controller', text: 'GET /projects/1', arrow: 'sync' },
        {
          type: 'block',
          kind: 'opt',
          sections: [
            {
              label: 'found',
              steps: [
                {
                  type: 'message',
                  from: 'controller',
                  to: 'owned',
                  text: 'findOwnedProject',
                  arrow: 'sync',
                },
              ],
            },
          ],
        },
        { type: 'message', from: 'owned', to: 'controller', text: 'project', arrow: 'reply' },
      ],
    }
    const result = matchDiagram(diagram, map)
    expect(result.elements).toEqual([
      {
        elementId: 'controller',
        status: 'suggested',
        candidates: [{ codeKey: PROJECTS_CONTROLLER, reason: 'class-name' }],
      },
      {
        elementId: 'owned',
        status: 'suggested',
        candidates: [{ codeKey: `${APP}/projects/services/owned-project.ts`, reason: 'file-name' }],
      },
    ])
    expect(result.relations).toEqual([
      {
        from: 'controller',
        to: 'owned',
        label: 'findOwnedProject',
        status: 'found',
        evidence: [
          {
            from: `${PROJECTS_CONTROLLER}.destroy`,
            to: `${APP}/projects/services/owned-project.ts#findOwnedProject`,
          },
          {
            from: `${PROJECTS_CONTROLLER}.show`,
            to: `${APP}/projects/services/owned-project.ts#findOwnedProject`,
          },
          {
            from: `${PROJECTS_CONTROLLER}.update`,
            to: `${APP}/projects/services/owned-project.ts#findOwnedProject`,
          },
        ],
      },
      { from: 'owned', to: 'controller', label: 'project', status: 'missing', evidence: [] },
    ])
  })
})

describe('matchDiagram: other diagrams', () => {
  it('matches C4 containers to application folders and skips people', () => {
    const diagram: UmlSpec = {
      kind: 'c4',
      level: 'container',
      elements: [
        { id: 'user', kind: 'person', label: 'User' },
        { id: 'api', kind: 'container', label: 'api' },
      ],
      relations: [{ from: 'user', to: 'api' }],
    }
    const result = matchDiagram(diagram, map)
    expect(result.elements).toEqual([
      {
        elementId: 'api',
        status: 'suggested',
        candidates: [{ codeKey: 'apps/api/', reason: 'folder-path' }],
      },
    ])
    expect(result.relations).toEqual([])
  })

  it('has nothing to match in a state diagram', () => {
    const diagram: UmlSpec = {
      kind: 'state',
      states: [{ id: 'Draft' }],
      transitions: [],
    }
    expect(matchDiagram(diagram, map)).toEqual({ elements: [], relations: [], findings: [] })
  })
})

describe('linkedCodeKeys', () => {
  it('keeps confirmed links and single proposals', () => {
    const diagram: UmlSpec = {
      kind: 'class',
      classes: [{ id: 'ArchitecturesController' }, { id: 'Missing' }],
      relations: [],
    }
    expect(linkedCodeKeys([matchDiagram(diagram, map)])).toEqual([ARCHITECTURES_CONTROLLER])
  })
})
