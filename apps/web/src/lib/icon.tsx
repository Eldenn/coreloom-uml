import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'

/** A Lucide icon component (`HomeIcon`) or an element (`<HomeIcon />`): elements also cross the
 *  server → client boundary in Next.js, components don't. */
type IconLike = LucideIcon | React.ReactElement

function renderIcon(icon: IconLike | undefined): React.ReactNode {
  if (!icon) return null
  // A component (function, forwardRef or memo, like Lucide's icons) is rendered here. Anything
  // else is already a node: an element, or what a server component's element became on the way to
  // the client (React dedupes repeated elements into lazy references).
  const kind = (icon as { $$typeof?: symbol }).$$typeof
  if (
    typeof icon === 'function' ||
    kind === Symbol.for('react.forward_ref') ||
    kind === Symbol.for('react.memo')
  ) {
    const Icon = icon as LucideIcon
    return <Icon />
  }
  return icon as React.ReactNode
}

export { type IconLike, renderIcon }
