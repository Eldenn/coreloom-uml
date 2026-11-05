'use client'

// Router-agnostic links. Blocks render <AppLink href> for their navigation; by default it is a plain
// <a>. Give the app your router's link once and every block navigates client-side:
//
//   <CoreloomLinkProvider component={RouterLink}>…</CoreloomLinkProvider>
//
// Next.js: component={Link} from "next/link" works as is. TanStack Router: map `href` to `to`
// (see the starter's src/components/router-link.tsx). Hash links and other sites stay plain <a>.
import * as React from 'react'

export type LinkProps = React.ComponentProps<'a'> & { href: string }
export type LinkComponent = React.ComponentType<LinkProps>

function PlainLink(props: LinkProps) {
  // eslint-disable-next-line jsx-a11y/anchor-has-content -- content comes through props
  return <a {...props} />
}

const LinkContext = React.createContext<LinkComponent>(PlainLink)

export function CoreloomLinkProvider({
  component,
  children,
}: {
  component: LinkComponent
  children: React.ReactNode
}) {
  return <LinkContext value={component}>{children}</LinkContext>
}

/** The link component blocks use, from the nearest CoreloomLinkProvider. */
export function useLinkComponent() {
  return React.use(LinkContext)
}

/** true for "#section", "https://…", "mailto:…": those never go through the router. */
export function isExternalHref(href: string) {
  return href.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')
}

/** An <a> that navigates with the app's router when the href is in-app. Works with `asChild`. */
export function AppLink({ href, ...props }: LinkProps) {
  const Component = useLinkComponent()
  // eslint-disable-next-line jsx-a11y/anchor-has-content -- content comes through props
  if (isExternalHref(href)) return <a href={href} {...props} />
  // eslint-disable-next-line react-hooks/static-components -- the app's link component, read from context, not created here
  return <Component href={href} {...props} />
}
