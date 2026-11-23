import type { UmlSpec } from '@coreloom-uml/uml'
import { test } from '@japa/runner'
import { DesignFindingKind, reviewDesign } from '#app/decisions/services/design-review'

const view: UmlSpec = {
  kind: 'sequence',
  participants: [{ id: 'C', label: 'Client' }, { id: 'API' }],
  steps: [{ type: 'message', from: 'C', to: 'API', arrow: 'sync', text: 'pay()' }],
}

const decision = (
  id: number,
  status: 'proposed' | 'accepted' | 'superseded',
  parts: { diagramId: number; type: 'element' | 'step'; label: string }[],
) => ({ id, title: `Decision ${id}`, status, requirementIds: [], diagramIds: [7], parts })

test.group('reviewDesign - parts of views', () => {
  test('finds a decision still standing that names a part its view no longer has', ({ assert }) => {
    const findings = reviewDesign(
      [],
      [
        decision(1, 'accepted', [
          { diagramId: 7, type: 'element', label: 'Client' },
          { diagramId: 7, type: 'step', label: 'Client -> API: pay()' },
        ]),
        decision(2, 'proposed', [{ diagramId: 7, type: 'step', label: 'Client -> API: login()' }]),
        // A part of a view gone, or of a view with no content, is not there either.
        decision(3, 'accepted', [{ diagramId: 9, type: 'element', label: 'Client' }]),
        decision(4, 'accepted', [{ diagramId: 8, type: 'element', label: 'Client' }]),
        // The same element is no step.
        decision(5, 'accepted', [{ diagramId: 7, type: 'step', label: 'Client' }]),
        // A superseded decision is not looked at: it no longer says anything of the views.
        decision(6, 'superseded', [{ diagramId: 7, type: 'element', label: 'Nobody' }]),
      ],
      new Map([
        [7, view],
        [8, null],
      ]),
    )
    assert.deepEqual(
      findings.filter((finding) => finding.kind === DesignFindingKind.StalePart),
      [2, 3, 4, 5].map((id) => ({
        kind: DesignFindingKind.StalePart,
        requirementId: null,
        decisionId: id,
        subject: `Decision ${id}`,
      })),
    )
  })

  test('a decision without parts is never stale', ({ assert }) => {
    const findings = reviewDesign(
      [],
      [{ id: 1, title: 'Old', status: 'accepted', requirementIds: [], diagramIds: [7] }],
    )
    assert.deepEqual(findings, [])
  })
})
