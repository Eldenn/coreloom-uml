import { type UmlPart, type UmlSpec, umlParts } from '@coreloom-uml/uml'
import { expect, test } from 'vitest'

import { graphTarget, sequenceTarget } from '@/components/ui/uml-diagram-labels'
import { en, fr } from '@/lib/i18n'
import { stepIds } from '@/lib/uml-edit-sequence'
import { type DiagramNode, toDiagramGraph } from '@/lib/uml-graph'

// `umlParts` (packages/uml) mirrors what the drawing names on a right-click, which the assistant
// gets as `pointed` parts: both must name every part of a view the same way.

type Roles = typeof en.diagram.roles

/** Every part the drawing can name, through the registry's own functions. */
function drawnParts(diagram: UmlSpec, roles: Roles): UmlPart[] {
  const parts: UmlPart[] = []
  if (diagram.kind === 'sequence') {
    const ids = [...diagram.participants.map((p) => p.id), ...stepIds(diagram.steps)]
    for (const id of ids) {
      const part = sequenceTarget(diagram, id)
      if (part) parts.push({ type: part.type, label: part.label })
    }
  } else {
    const graph = toDiagramGraph(diagram)
    if (!graph) throw new Error('no graph')
    const role = (node: DiagramNode) => roles[node.role]
    const hits = [
      ...graph.nodes.flatMap((node) => [
        { node: node.id },
        ...(node.compartments?.flat() ?? []).map((_, member) => ({ node: node.id, member })),
      ]),
      ...graph.edges.map((edge) => ({ edge: edge.id })),
    ]
    for (const hit of hits) {
      const part = graphTarget(graph, hit, role)
      if (part) parts.push({ type: part.type, label: part.label })
    }
  }
  const keys = new Set<string>()
  return parts.filter(
    ({ type, label }) => !keys.has(`${type}\n${label}`) && keys.add(`${type}\n${label}`),
  )
}

const DIAGRAMS: UmlSpec[] = [
  {
    kind: 'class',
    classes: [
      {
        id: 'Order',
        namespace: 'shop',
        generic: 'T',
        attributes: [{ text: 'id: string', visibility: 'private' }],
        methods: [{ text: 'pay(amount)', static: true }],
      },
      { id: 'Payment', label: 'Payment\n record' },
    ],
    relations: [
      { from: 'Order', to: 'Payment', kind: 'composition', label: 'pays' },
      { from: 'Payment', to: 'Order', kind: 'dependency' },
    ],
    notes: [{ text: 'Paid once', for: 'Order' }, { text: '' }],
  },
  {
    kind: 'state',
    states: [
      { id: 'Idle', description: 'waiting' },
      { id: 'Busy' },
      { id: 'Fetch', parent: 'Busy', label: '', description: 'fetching' },
      { id: 'Log', parent: 'Busy', region: 1 },
      { id: 'pick', kind: 'choice' },
      { id: 'split', kind: 'fork' },
    ],
    transitions: [
      { from: '[*]', to: 'Idle' },
      { from: 'Idle', to: 'Busy', label: 'go\nnow' },
      { from: '[*]', to: 'Fetch', parent: 'Busy' },
      { from: '[*]', to: 'Log', parent: 'Busy' },
      { from: 'Busy', to: 'pick' },
      { from: 'pick', to: '[*]' },
    ],
    notes: [{ text: 'idle note', for: 'Idle' }],
  },
  {
    kind: 'er',
    entities: [
      { id: 'User', attributes: [{ name: 'id', type: 'uuid', keys: ['PK'] }] },
      { id: 'Order', label: 'Orders' },
    ],
    relations: [
      {
        from: 'User',
        to: 'Order',
        fromCardinality: 'exactlyOne',
        toCardinality: 'zeroOrMore',
        label: 'places',
      },
    ],
  },
  {
    kind: 'c4',
    level: 'container',
    boundaries: [{ id: 'b', label: 'Shop', kind: 'system' }],
    elements: [
      { id: 'u', kind: 'person', label: 'Buyer', description: 'buys' },
      { id: 'api', kind: 'container', label: 'API', technology: 'Node', boundary: 'b' },
    ],
    relations: [{ from: 'u', to: 'api', label: 'calls', technology: 'HTTPS' }],
  },
  {
    kind: 'usecase',
    elements: [
      { id: 'sys', kind: 'system', label: 'Shop' },
      { id: 'buyer', kind: 'actor' },
      { id: 'order', kind: 'usecase', label: 'Order', parent: 'sys' },
      { id: 'stock', kind: 'usecase', label: 'Check stock', parent: 'sys' },
    ],
    relations: [
      { from: 'buyer', to: 'order' },
      { from: 'order', to: 'stock', kind: 'include' },
      { from: 'stock', to: 'order', kind: 'extend', label: 'if low' },
    ],
    notes: [{ text: 'scope', for: 'sys' }],
  },
  {
    kind: 'activity',
    elements: [
      { id: 's', kind: 'start' },
      { id: 'lane', kind: 'partition' },
      { id: 'd', kind: 'decision' },
      { id: 'm', kind: 'merge', label: 'joined' },
      { id: 'pay', kind: 'action', label: 'Pay', parent: 'lane' },
      { id: 'f', kind: 'fork' },
      { id: 'e', kind: 'flowEnd' },
      { id: 'end', kind: 'end' },
    ],
    relations: [
      { from: 's', to: 'd' },
      { from: 'd', to: 'pay', label: 'paid' },
      { from: 'd', to: 'm', label: '[later]' },
      { from: 'pay', to: 'end' },
    ],
  },
  {
    kind: 'deployment',
    elements: [
      { id: 'srv', kind: 'node', label: 'Server' },
      { id: 'app', kind: 'artifact', label: 'app.jar', parent: 'srv' },
      { id: 'db', kind: 'database' },
    ],
    relations: [
      { from: 'app', to: 'db', kind: 'dependency', label: 'reads' },
      { from: 'app', to: 'srv', kind: 'deploy' },
    ],
  },
  {
    kind: 'component',
    elements: [
      { id: 'web', kind: 'component', label: 'Web' },
      { id: 'p', kind: 'port', parent: 'web' },
      { id: 'i', kind: 'interface', label: 'IOrders' },
    ],
    relations: [
      { from: 'web', to: 'i', kind: 'require' },
      { from: 'web', to: 'p', kind: 'delegate', label: 'out' },
    ],
  },
  {
    kind: 'package',
    elements: [
      { id: 'core', kind: 'package' },
      { id: 'Model', kind: 'class', parent: 'core' },
      { id: 'ui', kind: 'package', label: 'UI' },
    ],
    relations: [
      { from: 'ui', to: 'core', kind: 'import' },
      { from: 'ui', to: 'Model', kind: 'merge', label: 'once' },
    ],
  },
  {
    kind: 'sequence',
    participants: [
      { id: 'C', label: 'Client\napp' },
      { id: 'A', kind: 'actor' },
    ],
    steps: [
      { type: 'message', from: 'C', to: 'A', arrow: 'sync', text: 'login()' },
      {
        type: 'block',
        kind: 'alt',
        sections: [
          {
            label: 'ok',
            steps: [{ type: 'message', from: 'A', to: 'C', arrow: 'dottedAsync', text: '' }],
          },
          { label: 'else', steps: [{ type: 'activation', participant: 'C', active: false }] },
        ],
      },
      { type: 'note', position: 'left', participants: ['A'], text: 'hm' },
    ],
  },
]

test.each(DIAGRAMS.map((diagram) => [diagram.kind, diagram] as const))(
  'umlParts names a %s diagram as the drawing does',
  (_, diagram) => {
    expect(umlParts(diagram)).toEqual(drawnParts(diagram, en.diagram.roles))
    expect(umlParts(diagram, (role) => fr.diagram.roles[role])).toEqual(
      drawnParts(diagram, fr.diagram.roles),
    )
  },
)
