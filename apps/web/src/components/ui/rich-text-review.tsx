import { DOMSerializer, Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { type Editor, Extension, useEditorState } from '@tiptap/react'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useCoreloomI18n } from '@/lib/i18n'

/** One suggested change: put `content` in place of `from`..`to` (an empty range inserts, empty content deletes). */
interface RichTextSuggestion {
  id: number
  from: number
  to: number
  /** Inline nodes (words in a paragraph) or, when `block`, whole blocks. */
  content: Fragment
  block: boolean
  /** The text of `from`..`to` when it was suggested: an edit that changes it drops the suggestion. */
  original: string
}

type Change = Omit<RichTextSuggestion, 'id' | 'original'>

// ——— The diff. Blocks are lined up first (equal ones skipped); blocks of the same kind that sit in
// the same place are compared word by word, and what's left is replaced as whole blocks.

type Op = ['eq', number, number] | ['del', number] | ['ins', number]

// Past this many cells the comparison isn't worth it: the whole run becomes one change.
const MAX_CELLS = 1_000_000

/** The shortest edit script from `a` to `b` (longest common subsequence), common ends trimmed first. */
function align<T>(a: T[], b: T[], same: (x: T, y: T) => boolean): Op[] {
  let start = 0
  while (start < a.length && start < b.length && same(a[start], b[start])) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && same(a[endA - 1], b[endB - 1])) {
    endA--
    endB--
  }
  const head: Op[] = Array.from({ length: start }, (_, i): Op => ['eq', i, i])
  const tail: Op[] = Array.from({ length: a.length - endA }, (_, i): Op => [
    'eq',
    endA + i,
    endB + i,
  ])
  const n = endA - start
  const m = endB - start
  const middle: Op[] = []
  if (n * m > MAX_CELLS || n === 0 || m === 0) {
    for (let i = start; i < endA; i++) middle.push(['del', i])
    for (let j = start; j < endB; j++) middle.push(['ins', j])
    return [...head, ...middle, ...tail]
  }
  // lengths[i][j]: the common subsequence of a[start+i..] and b[start+j..].
  const lengths = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lengths[i][j] = same(a[start + i], b[start + j])
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1])
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (same(a[start + i], b[start + j])) {
      middle.push(['eq', start + i++, start + j++])
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) middle.push(['del', start + i++])
    else middle.push(['ins', start + j++])
  }
  while (i < n) middle.push(['del', start + i++])
  while (j < m) middle.push(['ins', start + j++])
  return [...head, ...middle, ...tail]
}

interface Token {
  node: ProseMirrorNode
  from: number
  to: number
}

// Words, runs of spaces and single punctuation marks: "builds," is two tokens, so a changed comma
// doesn't strike the word before it.
const TOKEN = /[\p{L}\p{N}_'’-]+|\s+|[^\p{L}\p{N}\s]/gu

function tokens(block: ProseMirrorNode, start: number): Token[] {
  const out: Token[] = []
  block.forEach((child, offset) => {
    const at = start + offset
    if (!child.isText) {
      out.push({ node: child, from: at, to: at + child.nodeSize })
      return
    }
    for (const match of (child.text ?? '').matchAll(TOKEN)) {
      const from = match.index
      const to = from + match[0].length
      out.push({ node: child.cut(from, to), from: at + from, to: at + to })
    }
  })
  return out
}

const isSpace = (token: Token) => token.node.isText && !token.node.text?.trim()

/** Word-level changes between two textblocks of the same kind. */
function diffInline(a: ProseMirrorNode, aStart: number, b: ProseMirrorNode, out: Change[]) {
  const before = tokens(a, aStart)
  const after = tokens(b, 0)
  const ops = align(before, after, (x, y) => x.node.eq(y.node))
  // Runs of changes between equal tokens. One space between two runs joins them, so
  // "the quick" → "a fast" reads as one change rather than two.
  interface Run {
    dels: Token[]
    ins: Token[]
    at: number
  }
  const runs: Run[] = []
  let run: Run | null = null
  let gap: Token[] = []
  let gapNew: Token[] = []
  let cursor = aStart
  for (const op of ops) {
    if (op[0] === 'eq') {
      const old = before[op[1]]
      if (run) {
        gap.push(old)
        gapNew.push(after[op[2]])
      }
      cursor = old.to
      continue
    }
    if (run && gap.length) {
      if (gap.length === 1 && isSpace(gap[0])) {
        run.dels.push(...gap)
        run.ins.push(...gapNew)
      } else {
        runs.push(run)
        run = null
      }
    }
    gap = []
    gapNew = []
    run ??= { dels: [], ins: [], at: cursor }
    if (op[0] === 'del') run.dels.push(before[op[1]])
    else run.ins.push(after[op[1]])
  }
  if (run) runs.push(run)
  for (const r of runs) {
    // A run can end up as spaces only on both sides (the joined gap): nothing changed.
    const from = r.dels[0]?.from ?? r.at
    const to = r.dels.at(-1)?.to ?? r.at
    const content = Fragment.fromArray(r.ins.map((t) => t.node))
    if (from === to && !content.size) continue
    out.push({ from, to, content, block: false })
  }
}

// Paired blocks are compared inside; anything else is replaced whole.
const pairs = (x: ProseMirrorNode, y: ProseMirrorNode) => !x.isLeaf && x.sameMarkup(y)

function diffChildren(a: ProseMirrorNode, aStart: number, b: ProseMirrorNode, out: Change[]) {
  const olds: { node: ProseMirrorNode; pos: number }[] = []
  a.forEach((node, offset) => olds.push({ node, pos: aStart + offset }))
  const news: ProseMirrorNode[] = []
  b.forEach((node) => news.push(node))
  const ops = align(
    olds.map((o) => o.node),
    news,
    (x, y) => x.eq(y),
  )
  let cursor = aStart
  let dels: number[] = []
  let ins: number[] = []
  const pair = (i: number, j: number) => {
    const old = olds[i]
    if (old.node.isTextblock) diffInline(old.node, old.pos + 1, news[j], out)
    else diffChildren(old.node, old.pos + 1, news[j], out)
  }
  const flush = () => {
    let s = 0
    while (s < dels.length && s < ins.length && pairs(olds[dels[s]].node, news[ins[s]])) s++
    let e = 0
    while (
      e < dels.length - s &&
      e < ins.length - s &&
      pairs(olds[dels[dels.length - 1 - e]].node, news[ins[ins.length - 1 - e]])
    )
      e++
    for (let k = 0; k < s; k++) pair(dels[k], ins[k])
    const midDels = dels.slice(s, dels.length - e)
    const midIns = ins.slice(s, ins.length - e)
    if (midDels.length || midIns.length) {
      const after = s ? olds[dels[s - 1]] : null
      const at = after ? after.pos + after.node.nodeSize : cursor
      const first = midDels.length ? olds[midDels[0]] : null
      const last = midDels.length ? olds[midDels[midDels.length - 1]] : null
      out.push({
        from: first ? first.pos : at,
        to: last ? last.pos + last.node.nodeSize : at,
        content: Fragment.fromArray(midIns.map((j) => news[j])),
        block: true,
      })
    }
    for (let k = e; k > 0; k--) pair(dels[dels.length - k], ins[ins.length - k])
    dels = []
    ins = []
  }
  for (const op of ops) {
    if (op[0] === 'eq') {
      flush()
      const old = olds[op[1]]
      cursor = old.pos + old.node.nodeSize
    } else if (op[0] === 'del') dels.push(op[1])
    else ins.push(op[1])
  }
  flush()
}

/** The changes that turn `before` into `after` (two documents of the same schema), in document order. */
function suggestChanges(before: ProseMirrorNode, after: ProseMirrorNode): Change[] {
  const out: Change[] = []
  diffChildren(before, 0, after, out)
  return out
}

// ——— The plugin: the pending suggestions, kept in step with edits, and drawn as decorations.

interface ReviewState {
  suggestions: RichTextSuggestion[]
  /** The change the bar acts on: the one the caret is in, or the one stepped to. */
  current: number | null
  /** Bumped each time a new set of suggestions starts, so the bar can announce it. */
  round: number
  decorations: DecorationSet
}

type ReviewMeta =
  | { type: 'start'; suggestions: RichTextSuggestion[] }
  | { type: 'remove'; ids: number[]; current: number | null }
  | { type: 'focus'; id: number }
  | { type: 'clear' }

const reviewKey = new PluginKey<ReviewState>('coreloomAiReview')
const textOf = (doc: ProseMirrorNode, from: number, to: number) =>
  doc.textBetween(from, to, '\n', '￼')

function draw(doc: ProseMirrorNode, suggestions: RichTextSuggestion[], current: number | null) {
  const decorations: Decoration[] = []
  const serializer = DOMSerializer.fromSchema(doc.type.schema)
  for (const s of suggestions) {
    const now = s.id === current ? ' rte-suggest-current' : ''
    if (s.from < s.to) {
      if (s.block)
        doc.nodesBetween(s.from, s.to, (node, pos) => {
          if (pos < s.from || pos + node.nodeSize > s.to) return true
          decorations.push(
            Decoration.node(pos, pos + node.nodeSize, { class: `rte-suggest-del-block${now}` }),
          )
          return false
        })
      decorations.push(
        Decoration.inline(s.from, s.to, {
          nodeName: 'del',
          class: `rte-suggest-del${now}`,
          'data-suggestion': String(s.id),
        }),
      )
    }
    if (s.content.size)
      decorations.push(
        Decoration.widget(
          s.to,
          () => {
            const ins = document.createElement('ins')
            ins.className = `${s.block ? 'rte-suggest-ins-block' : 'rte-suggest-ins'}${now}`
            ins.dataset.suggestion = String(s.id)
            // ProseMirror's own serializer: nodes and marks to elements, text as text (never HTML).
            serializer.serializeFragment(s.content, { document }, ins)
            return ins
          },
          // Redrawn when it becomes (or stops being) the current change.
          { side: -1, key: `rte-suggest-${s.id}${now}`, ignoreSelection: true },
        ),
      )
  }
  return DecorationSet.create(doc, decorations)
}

const AiReview = Extension.create({
  name: 'coreloomAiReview',
  addProseMirrorPlugins() {
    return [
      new Plugin<ReviewState>({
        key: reviewKey,
        state: {
          init: () => ({
            suggestions: [],
            current: null,
            round: 0,
            decorations: DecorationSet.empty,
          }),
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(reviewKey) as ReviewMeta | undefined
            let { suggestions, current, round } = prev
            if (tr.docChanged && suggestions.length)
              // Edits move the suggestions along; one whose text was edited (or removed) is dropped.
              suggestions = suggestions.flatMap((s) => {
                const start = tr.mapping.mapResult(s.from, s.from === s.to ? -1 : 1)
                const end = s.from === s.to ? start : tr.mapping.mapResult(s.to, -1)
                if (start.deleted || end.pos < start.pos) return []
                if (textOf(state.doc, start.pos, end.pos) !== s.original) return []
                return [{ ...s, from: start.pos, to: end.pos }]
              })
            if (meta?.type === 'start') {
              suggestions = meta.suggestions
              current = suggestions[0]?.id ?? null
              round++
            } else if (meta?.type === 'remove') {
              suggestions = suggestions.filter((s) => !meta.ids.includes(s.id))
              current = meta.current
            } else if (meta?.type === 'focus') current = meta.id
            else if (meta?.type === 'clear') suggestions = []
            else if (tr.selectionSet && suggestions.length) {
              // The caret in (or at the edge of) a change makes it the current one.
              const head = state.selection.head
              current = suggestions.find((s) => head >= s.from && head <= s.to)?.id ?? current
            }
            if (!suggestions.some((s) => s.id === current)) current = suggestions[0]?.id ?? null
            if (
              suggestions === prev.suggestions &&
              current === prev.current &&
              !tr.docChanged &&
              round === prev.round
            )
              return prev
            return {
              suggestions,
              current,
              round,
              decorations: suggestions.length
                ? draw(state.doc, suggestions, current)
                : DecorationSet.empty,
            }
          },
        },
        props: { decorations: (state) => reviewKey.getState(state)?.decorations },
      }),
    ]
  },
})

let nextId = 1

/** Shows the changes from the editor's document to `after` as suggestions. Returns how many.
 *  `select` puts the caret on the first one and scrolls to it (after the person asked for it). */
function startReview(editor: Editor, after: ProseMirrorNode, { select = true } = {}) {
  const doc = editor.state.doc
  const suggestions = suggestChanges(doc, after).map((c): RichTextSuggestion => ({
    ...c,
    id: nextId++,
    original: textOf(doc, c.from, c.to),
  }))
  const tr = editor.state.tr.setMeta(reviewKey, { type: 'start', suggestions } satisfies ReviewMeta)
  const first = suggestions.at(0)
  if (first && select)
    tr.setSelection(TextSelection.near(tr.doc.resolve(first.from))).scrollIntoView()
  editor.view.dispatch(tr)
  return suggestions.length
}

/** Content styles for the suggestions, added to the editor's content when AI is on. */
const REVIEW_CONTENT = [
  '[&_.rte-suggest-del]:rounded-[2px] [&_.rte-suggest-del]:bg-destructive-subtle [&_.rte-suggest-del]:text-destructive [&_.rte-suggest-del]:line-through [&_.rte-suggest-del]:decoration-1',
  '[&_.rte-suggest-ins]:rounded-[2px] [&_.rte-suggest-ins]:bg-success-subtle [&_.rte-suggest-ins]:text-foreground [&_.rte-suggest-ins]:underline [&_.rte-suggest-ins]:decoration-success [&_.rte-suggest-ins]:underline-offset-4',
  '[&_.rte-suggest-del-block]:rounded-[3px] [&_.rte-suggest-del-block]:bg-destructive-subtle',
  '[&_.rte-suggest-ins-block]:block [&_.rte-suggest-ins-block]:rounded-[3px] [&_.rte-suggest-ins-block]:border-l-2 [&_.rte-suggest-ins-block]:border-success [&_.rte-suggest-ins-block]:bg-success-subtle [&_.rte-suggest-ins-block]:pl-2 [&_.rte-suggest-ins-block]:no-underline [&_.rte-suggest-ins-block>*+*]:mt-2.5',
  '[&_.rte-suggest-current]:outline-2 [&_.rte-suggest-current]:outline-offset-1 [&_.rte-suggest-current]:outline-ring',
].join(' ')

// ——— The bar under the text: where you are, the change in words, and the buttons.

const clip = (text: string, max = 48) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/** How a review ended: how many changes were accepted and rejected (the rest were edited away). */
interface RichTextReviewResult {
  accepted: number
  rejected: number
}

function RichTextReview({
  editor,
  disabled,
  onEnd,
}: {
  editor: Editor
  disabled?: boolean
  /** Called once the last change is accepted, rejected or edited away. */
  onEnd?: (result: RichTextReviewResult) => void
}) {
  const t = useCoreloomI18n().messages.editor
  const review = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const s = e.isDestroyed ? null : reviewKey.getState(e.state)
      return s ? { suggestions: s.suggestions, current: s.current, round: s.round } : null
    },
  })
  const [message, setMessage] = React.useState('')
  const [announced, setAnnounced] = React.useState(0)
  const suggestions = review?.suggestions ?? []
  const round = review?.round ?? 0
  // A new set of suggestions is announced once (adjusting state while rendering, not in an effect).
  if (round !== announced) {
    setAnnounced(round)
    setMessage(suggestions.length ? t.reviewStarted(suggestions.length) : '')
  }
  const index = Math.max(
    0,
    suggestions.findIndex((s) => s.id === review?.current),
  )
  const current = suggestions.at(index)

  // Counted as the person decides; reported when nothing is left to review.
  const counts = React.useRef<RichTextReviewResult>({ accepted: 0, rejected: 0 })
  const seen = React.useRef({ round: 0, pending: 0 })
  const pending = suggestions.length
  React.useEffect(() => {
    if (round !== seen.current.round) counts.current = { accepted: 0, rejected: 0 }
    if (seen.current.pending && !pending) onEnd?.({ ...counts.current })
    seen.current = { round, pending }
  }, [round, pending, onEnd])

  const dispatch = (build: (tr: typeof editor.state.tr) => void) => {
    const tr = editor.state.tr
    build(tr)
    editor.view.dispatch(tr)
  }
  const show = (s: RichTextSuggestion) => {
    dispatch((tr) =>
      tr
        .setSelection(TextSelection.near(tr.doc.resolve(s.from)))
        .setMeta(reviewKey, { type: 'focus', id: s.id } satisfies ReviewMeta)
        .scrollIntoView(),
    )
  }
  // The bar goes away with the last change: focus goes back to the text instead of being lost.
  const settle = (left: number) => {
    if (!left) editor.commands.focus()
  }
  const apply = (tr: typeof editor.state.tr, s: RichTextSuggestion) => {
    if (s.content.size) tr.replaceWith(s.from, s.to, s.content)
    else tr.delete(s.from, s.to)
  }
  const resolve = (s: RichTextSuggestion, accept: boolean) => {
    const following =
      suggestions.at(index + 1) ?? (index > 0 ? suggestions.at(index - 1) : undefined)
    dispatch((tr) => {
      if (accept) apply(tr, s)
      tr.setMeta(reviewKey, {
        type: 'remove',
        ids: [s.id],
        current: following?.id ?? null,
      } satisfies ReviewMeta)
      if (following) {
        const at = tr.mapping.map(following.from, following.from === following.to ? -1 : 1)
        tr.setSelection(TextSelection.near(tr.doc.resolve(at))).scrollIntoView()
      }
    })
    counts.current[accept ? 'accepted' : 'rejected']++
    const left = suggestions.length - 1
    setMessage(accept ? t.reviewAccepted(left) : t.reviewRejected(left))
    settle(left)
  }
  const resolveAll = (accept: boolean) => {
    dispatch((tr) => {
      // From the end, so each change leaves the positions before it alone; one step to undo.
      if (accept) for (const s of [...suggestions].reverse()) apply(tr, s)
      tr.setMeta(reviewKey, { type: 'clear' } satisfies ReviewMeta)
    })
    counts.current[accept ? 'accepted' : 'rejected'] += suggestions.length
    setMessage(accept ? t.reviewAllAccepted : t.reviewAllRejected)
    settle(0)
  }

  const describe = (s: RichTextSuggestion) => {
    const before = clip(textOf(editor.state.doc, s.from, s.to))
    const after = clip(s.content.textBetween(0, s.content.size, ' ', '￼'))
    if (before && after) return t.reviewReplace(before, after)
    if (before) return t.reviewDelete(before)
    return t.reviewInsert(after || '↵')
  }

  return (
    <>
      <p role="status" className="sr-only">
        {message}
      </p>
      {current && (
        <div
          role="group"
          aria-label={t.review}
          data-slot="rich-text-review"
          className="@container/review flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border bg-surface px-2 py-1.5"
        >
          <div className="flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t.reviewPrevious}
              disabled={suggestions.length < 2}
              onClick={() => {
                show(suggestions[(index - 1 + suggestions.length) % suggestions.length])
              }}
            >
              <ChevronUpIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t.reviewNext}
              disabled={suggestions.length < 2}
              onClick={() => {
                show(suggestions[(index + 1) % suggestions.length])
              }}
            >
              <ChevronDownIcon />
            </Button>
          </div>
          <p className="flex min-w-0 flex-1 basis-48 flex-col">
            <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {t.reviewCount(index + 1, suggestions.length)}
            </span>
            <span className="truncate text-[13px] text-fg-secondary">{describe(current)}</span>
          </p>
          {/* Narrow (a phone, a side panel): two rows of two. */}
          <div className="grid w-full grid-cols-2 gap-1.5 @lg/review:flex @lg/review:w-auto @lg/review:items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => {
                resolve(current, false)
              }}
            >
              <XIcon />
              {t.reviewReject}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => {
                resolve(current, true)
              }}
            >
              <CheckIcon />
              {t.reviewAccept}
            </Button>
            <Separator
              orientation="vertical"
              className="mx-0.5 hidden data-[orientation=vertical]:h-5 @lg/review:block"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                resolveAll(false)
              }}
            >
              {t.reviewRejectAll}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                resolveAll(true)
              }}
            >
              {t.reviewAcceptAll}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

export {
  AiReview,
  REVIEW_CONTENT,
  RichTextReview,
  type RichTextReviewResult,
  type RichTextSuggestion,
  startReview,
  suggestChanges,
}
