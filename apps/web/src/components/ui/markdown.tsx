import { CheckIcon, CopyIcon } from 'lucide-react'
import * as React from 'react'
import ReactMarkdown, { type Components, type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {
  type CitationSource,
  InlineCitation,
  splitCitations,
} from '@/components/ui/inline-citation'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// The sources the citations point at, read by the `sup` renderer (a context, so the renderers stay the
// same objects from one streamed token to the next and nothing remounts).
const SourcesContext = React.createContext<readonly CitationSource[]>([])

/** What a code block renderer gets: the code, its language, and the plain code block to fall back on. */
interface MarkdownCodeBlockProps {
  code: string
  /** As written after the fence, in lower case: `mermaid`, `plantuml`. */
  language: string
  /** The answer is still being written: the block may be incomplete. */
  streaming: boolean
  /** The usual code block (with its copy button), to show instead or beside. */
  children: React.ReactNode
}

type MarkdownCodeRenderers = Readonly<
  Partial<Record<string, React.ComponentType<MarkdownCodeBlockProps>>>
>

/**
 * Renderers for fenced code, by language, for every Markdown inside (a whole chat at once):
 * `<MarkdownCodeBlocksContext value={diagramCodeBlocks}>`.
 */
const MarkdownCodeBlocksContext = React.createContext<MarkdownCodeRenderers>({})

/** The renderers and the streaming flag, read by each code block. */
const BlockContext = React.createContext<{ renderers: MarkdownCodeRenderers; streaming: boolean }>({
  renderers: {},
  streaming: false,
})

interface Position {
  start: { offset?: number }
  end: { offset?: number }
}
interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
  position?: Position
  referenceType?: string
  data?: Record<string, unknown>
}
interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

const citationNode = (n: number): MdNode => ({
  type: 'text',
  value: `[${n}]`,
  data: { hName: 'sup', hProperties: { dataCitation: String(n) } },
})
const textNode = (value: string): MdNode => ({ type: 'text', value })

/**
 * The citation pieces of one text node. The source text decides: a marker written escaped (`\[1\]`)
 * or right after a letter or digit (`items[1]`) is not a citation. When the source and the text differ
 * (escapes, entities) and the markers can't be paired one to one, nothing is cited: better plain than wrong.
 */
function citationPieces(node: MdNode, markdown: string, count: number): (string | number)[] {
  const value = node.value ?? ''
  const from = node.position?.start.offset
  const to = node.position?.end.offset
  if (from === undefined || to === undefined) return splitCitations(value, count)
  const source = markdown.slice(from, to)
  const before = markdown[from - 1] ?? ''
  if (source === value) return splitCitations(value, count, before)
  const written = [...source.matchAll(/(\\?)\[(\d{1,3})(\\?)\]/g)]
  const shown = [...value.matchAll(/\[(\d{1,3})\]/g)]
  if (written.length !== shown.length) return [value]
  const out: (string | number)[] = []
  let last = 0
  shown.forEach((m, i) => {
    const w = written[i]
    const n = Number(m[1])
    const previous = w.index > 0 ? source[w.index - 1] : before
    if (w[1] || w[3] || w[2] !== m[1] || n < 1 || n > count || /[\w\\]/.test(previous)) return
    if (m.index > last) out.push(value.slice(last, m.index))
    out.push(n)
    last = m.index + m[0].length
  })
  if (last < value.length) out.push(value.slice(last))
  return out
}

/**
 * A remark step: "[n]" in text, 1 ≤ n ≤ count, becomes a citation (<sup data-citation="n">). Code and
 * links are left alone. "[1]" that a model-written definition (`[1]: https://…`) turned into a link
 * becomes a citation too (or plain "[1]" without that source): a number in brackets never links elsewhere.
 */
function remarkCitations({ count }: { count: number }) {
  return (tree: MdNode, file: { value?: string | Uint8Array | null }) => {
    const markdown = String(file.value ?? '')
    const walk = (node: MdNode) => {
      if (!node.children || ['link', 'linkReference', 'inlineCode', 'code'].includes(node.type))
        return
      node.children = node.children.flatMap((child): MdNode[] => {
        if (child.type === 'linkReference' && child.referenceType !== 'full') {
          const label = (child.children ?? []).map((c) => c.value ?? '').join('')
          if (/^\d{1,3}$/.test(label)) {
            const n = Number(label)
            const from = child.position?.start.offset
            const previous = from ? markdown.charAt(from - 1) : ''
            return [
              n >= 1 && n <= count && !/[\w\\]/.test(previous)
                ? citationNode(n)
                : textNode(`[${label}]`),
            ]
          }
        }
        if (child.type !== 'text' || !count || !child.value?.includes('[')) {
          walk(child)
          return [child]
        }
        return citationPieces(child, markdown, count).map((piece) =>
          typeof piece === 'string' ? textNode(piece) : citationNode(piece),
        )
      })
    }
    walk(tree)
  }
}

/** A rehype step: footnotes get ids unique to this block (two answers with footnotes on one page don't collide). */
function rehypeFootnoteIds({ prefix }: { prefix: string }) {
  const walk = (node: HastNode) => {
    const props = node.properties
    if (props?.id === 'footnote-label') props.id = `${prefix}footnote-label`
    if (Array.isArray(props?.ariaDescribedBy))
      props.ariaDescribedBy = props.ariaDescribedBy.map((id: unknown) =>
        id === 'footnote-label' ? `${prefix}footnote-label` : id,
      )
    node.children?.forEach(walk)
  }
  return (tree: HastNode) => {
    walk(tree)
  }
}

function Citation({ n, fallback }: { n: number; fallback: React.ReactNode }) {
  const sources = React.use(SourcesContext)
  // Out of range when the text cites a source the message doesn't have.
  const source = sources[n - 1] as CitationSource | undefined
  return source ? <InlineCitation index={n} source={source} /> : <>{fallback}</>
}

function CodeCopy({ code }: { code: string }) {
  const t = useCoreloomI18n().messages.ai.code
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => {
      setCopied(false)
    }, 1400)
    return () => {
      clearTimeout(timer)
    }
  }, [copied])
  return (
    <button
      type="button"
      aria-label={t.copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code)
          setCopied(true)
        } catch {
          /* clipboard unavailable: nothing to confirm */
        }
      }}
      className="inline-flex size-7 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:size-3.5"
    >
      {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
    </button>
  )
}

/** The code itself. Long lines scroll sideways; only then does the block take focus, so keyboard users can scroll it. */
function CodeScroll({ code }: { code: string }) {
  const ref = React.useRef<HTMLPreElement>(null)
  const [overflows, setOverflows] = React.useState(false)
  const measure = React.useCallback(() => {
    const pre = ref.current
    if (pre) setOverflows(pre.scrollWidth > pre.clientWidth + 1)
  }, [])
  React.useLayoutEffect(measure, [code, measure])
  React.useEffect(() => {
    const pre = ref.current
    if (!pre) return
    const observer = new ResizeObserver(measure)
    observer.observe(pre)
    return () => {
      observer.disconnect()
    }
  }, [measure])
  return (
    <pre
      ref={ref}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard-reachable; axe requires it.
      tabIndex={overflows ? 0 : undefined}
      className="m-0 overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-[1.65] text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring"
    >
      <code>{code}</code>
    </pre>
  )
}

/** A fenced block: the app's renderer for its language when there is one, else the code. */
function CodeBlock({ code, language }: { code: string; language: string | undefined }) {
  const t = useCoreloomI18n().messages.ai.code
  const { renderers, streaming } = React.use(BlockContext)
  const plain = (
    <figure
      data-slot="markdown-code"
      className="my-3 overflow-hidden rounded-md border border-border bg-inset"
    >
      <figcaption className="flex h-9 items-center justify-between border-b border-border-subtle pr-1 pl-3">
        <span className="font-mono text-[11.5px] text-muted-foreground">
          {language ? t.language(language) : ' '}
        </span>
        <CodeCopy code={code} />
      </figcaption>
      <CodeScroll code={code} />
    </figure>
  )
  const lang = language?.toLowerCase()
  const Renderer = lang ? renderers[lang] : undefined
  if (!Renderer || !lang) return plain
  return (
    <Renderer code={code} language={lang} streaming={streaming}>
      {plain}
    </Renderer>
  )
}

function textOf(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

function useComponents(): Components {
  const t = useCoreloomI18n().messages.ai.code
  return React.useMemo<Components>(
    () => ({
      h1: ({ node: _n, ...p }) => (
        // eslint-disable-next-line jsx-a11y/heading-has-content -- content comes through props.
        <h3
          className="mt-5 mb-2 font-display text-[19px] font-semibold tracking-[-0.015em] text-foreground first:mt-0"
          {...p}
        />
      ),
      h2: ({ node: _n, ...p }) => (
        // eslint-disable-next-line jsx-a11y/heading-has-content -- content comes through props.
        <h4
          className="mt-5 mb-2 font-display text-[17px] font-semibold text-foreground first:mt-0"
          {...p}
        />
      ),
      h3: ({ node: _n, ...p }) => (
        // eslint-disable-next-line jsx-a11y/heading-has-content -- content comes through props.
        <h5 className="mt-4 mb-1.5 text-[15px] font-semibold text-foreground first:mt-0" {...p} />
      ),
      h4: ({ node: _n, ...p }) => (
        // eslint-disable-next-line jsx-a11y/heading-has-content -- content comes through props.
        <h6 className="mt-4 mb-1.5 text-[14px] font-semibold text-foreground first:mt-0" {...p} />
      ),
      p: ({ node: _n, ...p }) => <p className="my-2.5 first:mt-0 last:mb-0" {...p} />,
      ul: ({ node: _n, className, ...p }) => (
        <ul
          className={cn(
            'my-2.5 list-disc space-y-1 pl-5 marker:text-muted-foreground',
            className?.includes('contains-task-list') && 'list-none pl-1',
          )}
          {...p}
        />
      ),
      ol: ({ node: _n, ...p }) => (
        <ol className="my-2.5 list-decimal space-y-1 pl-5 marker:text-muted-foreground" {...p} />
      ),
      li: ({ node: _n, ...p }) => (
        <li className="pl-1 [&>input]:mr-2 [&>input]:align-middle" {...p} />
      ),
      // Task list boxes: read-only, named for screen readers.
      input: ({ node: _n, type, checked, ...p }) =>
        type === 'checkbox' ? (
          <input
            type="checkbox"
            checked={checked}
            readOnly
            aria-label={checked ? t.done : t.todo}
            className="accent-primary"
            {...p}
          />
        ) : (
          <input type={type} {...p} />
        ),
      // Links leave in a new tab; jumps within the answer (footnotes) stay here.
      a: ({ node: _n, href, ...p }) =>
        href?.startsWith('#') ? (
          // eslint-disable-next-line jsx-a11y/anchor-has-content -- content comes through props.
          <a
            href={href}
            className="text-primary-text underline underline-offset-4 hover:no-underline"
            {...p}
          />
        ) : (
          // eslint-disable-next-line jsx-a11y/anchor-has-content -- content comes through props.
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary-text underline underline-offset-4 hover:no-underline"
            {...p}
          />
        ),
      section: ({ node: _n, className, ...p }) => (
        <section
          className={cn(
            className?.includes('footnotes') &&
              'mt-4 border-t border-border-subtle pt-3 text-[13px] [&_ol]:my-1',
            className,
          )}
          {...p}
        />
      ),
      blockquote: ({ node: _n, ...p }) => (
        <blockquote
          className="my-3 border-l-2 border-border-strong pl-4 text-muted-foreground"
          {...p}
        />
      ),
      hr: () => <hr className="my-4 border-border-subtle" />,
      strong: ({ node: _n, ...p }) => <strong className="font-semibold text-foreground" {...p} />,
      // Citation markers (see remarkCitations); any other <sup> (GFM footnotes) renders as is.
      sup: ({ node, children, ...p }) => {
        const n = Number(node?.properties.dataCitation)
        return n ? <Citation n={n} fallback={children} /> : <sup {...p}>{children}</sup>
      },
      table: ({ node: _n, ...p }) => (
        <div className="my-3 overflow-x-auto rounded-md border border-border-subtle">
          <table className="w-full text-[13px]" {...p} />
        </div>
      ),
      thead: ({ node: _n, ...p }) => <thead className="bg-secondary" {...p} />,
      th: ({ node: _n, ...p }) => (
        <th
          className="border-b border-border-subtle px-3 py-2 text-left font-semibold text-foreground"
          {...p}
        />
      ),
      td: ({ node: _n, ...p }) => (
        <td
          className="border-b border-border-subtle px-3 py-2 align-top [tr:last-child_&]:border-0"
          {...p}
        />
      ),
      // Fenced blocks arrive as <pre><code class="language-x">; inline code as <code> alone.
      pre: ({ node: _n, children }) => {
        // eslint-disable-next-line @eslint-react/no-children-only -- react-markdown always gives <pre> exactly one <code> child.
        const child = React.Children.only(children) as React.ReactElement<{
          className?: string
          children?: React.ReactNode
        }>
        const lang = /language-([\w-]+)/.exec(child.props.className ?? '')?.[1]
        const code = textOf(child.props.children).replace(/\n$/, '')
        return <CodeBlock code={code} language={lang} />
      },
      code: ({ node: _n, className, ...p }) => (
        <code
          className={cn(
            'rounded-[5px] bg-secondary px-1.5 py-0.5 font-mono text-[0.88em] text-foreground',
            className,
          )}
          {...p}
        />
      ),
    }),
    [t],
  )
}

function Markdown({
  children,
  streaming = false,
  sources,
  codeBlocks,
  className,
}: {
  /** The Markdown text. */
  children: string
  /** Shows a blinking caret after the text while a model is still writing it. */
  streaming?: boolean
  /** The message's sources, in order (AI SDK `source-url` / `source-document` parts): "[1]" in the text cites the first. */
  sources?: readonly CitationSource[]
  /** Renderers for fenced code by language; added to (and winning over) `MarkdownCodeBlocksContext`. */
  codeBlocks?: MarkdownCodeRenderers
  className?: string
}) {
  const inherited = React.use(MarkdownCodeBlocksContext)
  const renderers = React.useMemo(() => ({ ...inherited, ...codeBlocks }), [inherited, codeBlocks])
  const block = React.useMemo(() => ({ renderers, streaming }), [renderers, streaming])
  const components = useComponents()
  const t = useCoreloomI18n().messages.ai.chat
  const prefix = `${React.useId()}-`
  const count = sources?.length ?? 0
  const remarkPlugins = React.useMemo<Options['remarkPlugins']>(
    () => [remarkGfm, [remarkCitations, { count }]],
    [count],
  )
  const rehypePlugins = React.useMemo<Options['rehypePlugins']>(
    () => [[rehypeFootnoteIds, { prefix }]],
    [prefix],
  )
  // Footnotes: a translated label as a <p> (a heading would break the page's outline), in-block ids.
  const remarkRehypeOptions = React.useMemo<Options['remarkRehypeOptions']>(
    () => ({
      clobberPrefix: prefix,
      footnoteLabel: t.footnotes,
      footnoteLabelTagName: 'p',
      footnoteLabelProperties: {
        className: [
          'm-0 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase',
        ],
      },
      footnoteBackLabel: (reference: number, rereference: number) =>
        t.backToReference(
          rereference > 1 ? `${reference + 1}-${rereference}` : String(reference + 1),
        ),
    }),
    [prefix, t],
  )
  return (
    <div
      data-slot="markdown"
      data-streaming={streaming || undefined}
      className={cn(
        'min-w-0 text-[14.5px] leading-[1.65] break-words text-fg-secondary',
        // The caret follows the last block's text while streaming.
        "data-[streaming]:[&>*:last-child]:after:ml-0.5 data-[streaming]:[&>*:last-child]:after:inline-block data-[streaming]:[&>*:last-child]:after:h-[1.05em] data-[streaming]:[&>*:last-child]:after:w-[7px] data-[streaming]:[&>*:last-child]:after:translate-y-[3px] data-[streaming]:[&>*:last-child]:after:animate-pulse data-[streaming]:[&>*:last-child]:after:rounded-[1px] data-[streaming]:[&>*:last-child]:after:bg-primary data-[streaming]:[&>*:last-child]:after:content-['']",
        className,
      )}
    >
      <SourcesContext value={sources ?? []}>
        <BlockContext value={block}>
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            remarkRehypeOptions={remarkRehypeOptions}
            components={components}
            skipHtml
          >
            {children}
          </ReactMarkdown>
        </BlockContext>
      </SourcesContext>
    </div>
  )
}

export {
  Markdown,
  type MarkdownCodeBlockProps,
  MarkdownCodeBlocksContext,
  type MarkdownCodeRenderers,
}
