// Lets the Coreloom blocks (sidebar, breadcrumbs, auth links, error pages…) navigate with TanStack
// Router instead of reloading the page. Given to <CoreloomLinkProvider> in src/routes/__root.tsx.
//
// The blocks only know an `href` ("/projects?status=ready"), so this resolves it with the router:
// in-app links get client-side navigation and hover preloading; a modified click (new tab…) or
// target="_blank" is left to the browser. In your own code, use TanStack's typed <Link to> instead.
import { useRouter } from '@tanstack/react-router'
import * as React from 'react'

import type { LinkProps } from '@/lib/link'

export function RouterLink({ href, onClick, onMouseEnter, onFocus, target, ...props }: LinkProps) {
  const router = useRouter()

  // The blocks' hrefs are plain app paths ("/projects?status=ready"), so they skip the typed `to`
  // API: navigate({ href }) parses them, and the rendered href gets the basepath for new tabs.
  const target_ = { href } as unknown as Parameters<typeof router.navigate>[0]
  const base = router.basepath === '/' ? '' : router.basepath.replace(/\/$/, '')
  const preload = () => {
    // Preloading is a hint: a failure is ignored, the click still navigates.
    void router.preloadRoute(target_ as never).catch(() => undefined)
  }

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    if (target && target !== '_self') return
    event.preventDefault()
    void router.navigate(target_)
  }

  return (
    // eslint-disable-next-line jsx-a11y/anchor-has-content -- content comes through props.
    <a
      href={href.startsWith('/') ? base + href : href}
      target={target}
      onClick={handleClick}
      onMouseEnter={(event) => {
        onMouseEnter?.(event)
        preload()
      }}
      onFocus={(event) => {
        onFocus?.(event)
        preload()
      }}
      {...props}
    />
  )
}
