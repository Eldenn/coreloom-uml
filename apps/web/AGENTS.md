# Coreloom UI

This app's interface is built with Coreloom UI, a design system on shadcn/ui (React 19, Radix,
Tailwind CSS v4) installed from the `@coreloom` shadcn registry. These rules are for anyone changing
the interface, people and coding agents alike. Installed by `shadcn add @coreloom/rules`; edit them
to fit the app.

## Before writing UI

- Use a Coreloom component when one fits: search the registry (shadcn's MCP server, or
  https://eldenn.github.io/coreloom-ui/llms.txt) before building one. Install with
  `pnpm dlx shadcn@latest add @coreloom/<name>`. Components land in `@/components/ui/<name>`, block
  parts in `@/components/<name>`; import them by name (named exports only).
- Read the item's guide before using it: each registry description ends with `Guide: <url>` (when to
  use it, props, accessibility rules). Storybook has live examples:
  https://eldenn.github.io/coreloom-ui/
- Installed files are the app's own code. Change them in place when the app needs to; review
  upstream changes with `shadcn add @coreloom/<name> --diff` before `--overwrite`.

## Design rules

- **Tokens only.** Colours come from the semantic utilities: `text-foreground`,
  `text-muted-foreground`, `bg-background`, `bg-card`, `bg-secondary`, `border-border`,
  `bg-primary` / `text-primary-text` / `bg-primary-subtle`, `text-destructive`, `text-success`,
  `text-warning`. No hex values, no raw Tailwind palette (`text-gray-500`).
- `bg-primary` (cyan) is for the **one** main action per view. Other actions use the `secondary`,
  `outline` or `ghost` Button variants.
- `text-faint-foreground` is for disabled text only: it fails contrast as readable text.
- Layers use the z ladder (`z-(--z-modal)`, `--z-popover`, `--z-toast`, `--z-tooltip`), never a raw
  z-index.
- Focus is always visible: `outline-none focus-visible:ring-[3px] focus-visible:ring-ring`.
- Motion respects `prefers-reduced-motion` and uses the duration utilities (`duration-fast`,
  `duration-base`, `duration-slow`, `duration-reveal`). For motion beyond transitions, reach for
  `Reveal` / `Stagger`, the text effects, `Marquee`, `Spotlight` and `useViewTransition` before
  writing keyframes; decorative loops must stop under reduced motion and be pausable.
- Reuse the components (`Button`, `Badge`, `Popover`, `Tooltip`, `Select`, `Spinner`, `Kbd`…)
  instead of rebuilding them, and `cn` from `@/lib/utils` to merge classes.
- Dark and light both work with no extra code: never style for one theme only.

## Accessibility

- Every control has an accessible name; icon-only buttons get an `aria-label`.
- Everything works with the keyboard. When the focused element goes away (a dialog closes, a row is
  deleted), move focus somewhere meaningful.
- Status is never shown by colour alone: add text (visually hidden if needed).
- Hover-only UI also works on focus and on touch.

## Text

- User-facing strings come from `useCoreloomI18n()` (English, French, Spanish, German); the
  components read it already. Don't hard-code strings in shared components; pass them as props or
  add them to the app's locale.
- Format numbers, dates and money with `Intl` and the current locale (`useCoreloomI18n().locale`),
  never by hand.

## App setup (already done when installed with `@coreloom/all` or the starter)

- Global CSS, after `@import "tailwindcss";`: `@import "tw-animate-css"; @import "./coreloom/fonts.css";
@import "./coreloom/tokens.css"; @import "./coreloom/theme.css";`.
- Mount `TooltipProvider` and one `Toaster` at the root.
