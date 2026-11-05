import { Handle, type Node, type NodeProps, Position, useConnection } from '@xyflow/react'

import type { DiagramNode } from '@/lib/uml-graph'
import { cn } from '@/lib/utils'

/** `connectable`: the node shows a dot to drag a new line from. */
interface NodeData extends Record<string, unknown> {
  node: DiagramNode
  connectable?: boolean
}
type ActorNodeType = Node<NodeData, 'actor'>
type EllipseNodeType = Node<NodeData, 'ellipse'>
type DecisionNodeType = Node<NodeData, 'decision'>

/**
 * The ends React Flow needs to draw an edge; the line itself picks the sides. When the node is
 * connectable, a dot at the bottom starts a new line, and while one is being drawn the whole node
 * is a place to drop it.
 */
function Ends({ connectable = false }: { connectable?: boolean | undefined }) {
  const connecting = useConnection((c) => c.inProgress)
  if (!connectable) {
    return (
      <>
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={false}
          className="!opacity-0"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={false}
          className="!opacity-0"
        />
      </>
    )
  }
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        isConnectableStart={false}
        className={cn(
          '!opacity-0',
          connecting && '!inset-0 !size-full !transform-none !rounded-[inherit] !border-0',
        )}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !border-2 !border-background !bg-primary opacity-0 transition-opacity duration-fast [.react-flow__node.selected_&]:opacity-100 [.react-flow__node:focus-visible_&]:opacity-100 [.react-flow__node:hover_&]:opacity-100"
      />
    </>
  )
}

/** A stick figure with its name under it. */
function ActorNode({ data }: NodeProps<ActorNodeType>) {
  return (
    <>
      <Ends connectable={data.connectable} />
      <div className="flex size-full flex-col items-center">
        <svg
          aria-hidden
          viewBox="0 0 32 52"
          className="h-[52px] w-8 shrink-0 fill-none stroke-foreground"
          strokeWidth={1.5}
          strokeLinecap="round"
        >
          <circle cx="16" cy="8" r="6.5" className="fill-card" />
          <path d="M16 15 V34 M3 22 H29 M16 34 L5 50 M16 34 L27 50" />
        </svg>
        <p className="mt-1.5 max-w-full truncate px-1 text-center text-[12.5px] leading-5 font-semibold text-foreground">
          {data.node.title}
        </p>
      </div>
    </>
  )
}

/** A use case: its name in an ellipse. */
function EllipseNode({ data }: NodeProps<EllipseNodeType>) {
  return (
    <>
      <Ends connectable={data.connectable} />
      <div className="grid size-full place-items-center rounded-[50%] border border-border-strong bg-card px-5 text-center text-[12.5px] leading-[18px] font-semibold text-card-foreground">
        <p className="line-clamp-3">{data.node.title}</p>
      </div>
    </>
  )
}

/** A decision or merge that asks something: the question inside a diamond. */
function DecisionNode({ data }: NodeProps<DecisionNodeType>) {
  return (
    <>
      <Ends connectable={data.connectable} />
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        <path
          d="M50 1 L99 50 L50 99 L1 50 Z"
          className="fill-card stroke-border-strong"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p className="relative grid size-full place-items-center px-7 text-center text-[12px] leading-[17px] font-semibold text-card-foreground">
        <span className="line-clamp-2">{data.node.title}</span>
      </p>
    </>
  )
}

export { ActorNode, DecisionNode, EllipseNode, Ends }
