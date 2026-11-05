import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  temporarilySetTabFocusMode,
} from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
import { type Diagnostic, lintGutter, lintKeymap, setDiagnostics } from '@codemirror/lint'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import {
  Annotation,
  Compartment,
  EditorState,
  type Extension,
  type Text as CmText,
} from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers as lineNumbersGutter,
  placeholder as placeholderText,
  rectangularSelection,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import * as React from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type CodeEditorLanguage =
  | 'javascript'
  | 'jsx'
  | 'typescript'
  | 'tsx'
  | 'json'
  | 'css'
  | 'html'
  | 'markdown'
  | 'python'
  | 'text'

/** Every built-in language, in menu order, with its name ("text" is named by the locale). */
const CODE_EDITOR_LANGUAGES: readonly { value: CodeEditorLanguage; label: string | null }[] = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'tsx', label: 'TypeScript JSX' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'jsx', label: 'JavaScript JSX' },
  { value: 'json', label: 'JSON' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'python', label: 'Python' },
  { value: 'text', label: null },
]

/** A problem to show in the code: a red or amber underline, a gutter mark, a tooltip. */
interface CodeEditorDiagnostic {
  /** 1-based. */
  line: number
  /** 1-based; without it the whole line is marked. */
  column?: number
  endLine?: number
  endColumn?: number
  severity: 'error' | 'warning' | 'info'
  message: string
  /** Who reported it: "eslint", "tsc". */
  source?: string
}

/** Where the cursor is, for a status bar: 1-based line and column, and the selected characters. */
interface CodeEditorCursor {
  line: number
  column: number
  selected: number
}

const EXTENSIONS: Record<string, CodeEditorLanguage> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  html: 'html',
  htm: 'html',
  svg: 'html',
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  py: 'python',
}

/** The language of a file from its name: "src/app.tsx" → "tsx". Unknown extensions are "text". */
function languageFromPath(path: string): CodeEditorLanguage {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return 'text'
  return EXTENSIONS[name.slice(dot + 1).toLowerCase()] ?? 'text'
}

function languageExtension(language: CodeEditorLanguage): Extension {
  switch (language) {
    case 'javascript':
      return javascript()
    case 'jsx':
      return javascript({ jsx: true })
    case 'typescript':
      return javascript({ typescript: true })
    case 'tsx':
      return javascript({ jsx: true, typescript: true })
    case 'json':
      return json()
    case 'css':
      return css()
    case 'html':
      return html()
    case 'markdown':
      return markdown()
    case 'python':
      return python()
    case 'text':
      return []
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

/** Line/column diagnostics → CodeMirror's offsets, clamped to the document (stale ones still land). */
function toOffsets(doc: CmText, diagnostics: readonly CodeEditorDiagnostic[]): Diagnostic[] {
  return diagnostics.map((d) => {
    const start = doc.line(clamp(Math.trunc(d.line), 1, doc.lines))
    const from =
      d.column === undefined ? start.from : start.from + clamp(d.column - 1, 0, start.length)
    let to = start.to
    if (d.endLine !== undefined || d.endColumn !== undefined) {
      const end = doc.line(clamp(Math.trunc(d.endLine ?? d.line), 1, doc.lines))
      to = d.endColumn === undefined ? end.to : end.from + clamp(d.endColumn - 1, 0, end.length)
    }
    // An empty mark on an empty line is still drawn (as a point), so `to` may equal `from`.
    return {
      from,
      to: Math.max(from, to),
      severity: d.severity,
      message: d.message,
      source: d.source,
    }
  })
}

// Colours come from the tokens, so the editor follows the theme (and an app's own accent) with no
// second palette to maintain. The chart blues and pinks are pulled towards the text colour so they
// keep a 4.5:1 contrast on the code background in both themes.
const highlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword, tags.self],
    color: 'var(--color-chart-2)',
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--color-success)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.unit], color: 'var(--color-warning)' },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    color: 'var(--color-muted-foreground)',
    fontStyle: 'italic',
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.function(tags.definition(tags.variableName)),
    ],
    color: 'var(--color-info)',
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace, tags.standard(tags.tagName)],
    color: 'color-mix(in oklab, var(--color-chart-4) 72%, var(--color-foreground))',
  },
  {
    tag: [tags.tagName, tags.angleBracket],
    color: 'color-mix(in oklab, var(--color-chart-5) 72%, var(--color-foreground))',
  },
  { tag: [tags.attributeName, tags.propertyName], color: 'var(--color-fg-secondary)' },
  { tag: [tags.heading], color: 'var(--color-primary-text)', fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--color-info)', textDecoration: 'underline' },
  { tag: [tags.meta, tags.processingInstruction], color: 'var(--color-muted-foreground)' },
  { tag: tags.invalid, color: 'var(--color-destructive)' },
])

const theme = EditorView.theme({
  '&': {
    height: '100%',
    maxHeight: 'inherit',
    minHeight: 'inherit',
    color: 'var(--color-foreground)',
    backgroundColor: 'transparent',
    fontSize: '13px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.7',
    overflow: 'auto',
  },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--color-primary)' },
  '.cm-line': { padding: '0 16px 0 8px' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--color-primary)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'color-mix(in oklab, var(--color-primary) 26%, transparent)' },
  // The current line shows only while the editor has focus: unfocused, it would tint a line for no
  // reason (and dim the contrast of comments on it).
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '&.cm-focused .cm-activeLine': {
    backgroundColor: 'color-mix(in oklab, var(--color-foreground) 3%, transparent)',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'color-mix(in oklab, var(--color-primary) 14%, transparent)',
  },
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'transparent',
    outline: '1px solid var(--color-border-strong)',
    borderRadius: '2px',
  },
  '&.cm-focused .cm-nonmatchingBracket': { color: 'var(--color-destructive)' },
  '.cm-searchMatch': {
    backgroundColor: 'var(--color-warning-subtle)',
    outline: '1px solid color-mix(in oklab, var(--color-warning) 50%, transparent)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in oklab, var(--color-warning) 30%, transparent)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--color-muted-foreground)',
    border: 'none',
    fontFamily: 'var(--font-mono)',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px 0 14px', minWidth: '3ch' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '&.cm-focused .cm-activeLineGutter': { color: 'var(--color-foreground)' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', cursor: 'pointer' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--color-secondary)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-muted-foreground)',
    borderRadius: '4px',
    padding: '0 4px',
  },
  '.cm-placeholder': { color: 'var(--color-muted-foreground)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--color-popover)',
    color: 'var(--color-popover-foreground)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgb(0 0 0 / 0.25)',
    overflow: 'hidden',
    zIndex: 'var(--z-popover, 1400)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--font-mono)',
    fontSize: '12.5px',
    maxHeight: '16em',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '2px 8px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-accent-foreground)',
  },
  '.cm-completionIcon': { color: 'var(--color-muted-foreground)' },
  '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--color-primary-text)' },
  '.cm-completionDetail': { color: 'var(--color-muted-foreground)' },
  '.cm-tooltip-lint': { padding: '0' },
  '.cm-diagnostic': { padding: '6px 10px', borderLeftWidth: '3px', fontSize: '12.5px' },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--color-destructive)' },
  '.cm-diagnostic-warning': { borderLeftColor: 'var(--color-warning)' },
  '.cm-diagnostic-info': { borderLeftColor: 'var(--color-info)' },
  '.cm-diagnosticSource': { color: 'var(--color-muted-foreground)', opacity: '1' },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--color-destructive)',
    textUnderlineOffset: '3px',
  },
  '.cm-lintRange-warning': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy var(--color-warning)',
    textUnderlineOffset: '3px',
  },
  '.cm-lintRange-info': {
    backgroundImage: 'none',
    textDecoration: 'underline dotted var(--color-info)',
    textUnderlineOffset: '3px',
  },
  '.cm-lint-marker': { width: '0.8em', height: '0.8em' },
  '.cm-panels': {
    backgroundColor: 'var(--color-card)',
    color: 'var(--color-foreground)',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--color-border-subtle)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--color-border-subtle)' },
  '.cm-panel.cm-search': { padding: '6px 32px 6px 8px', fontSize: '12.5px' },
  '.cm-panel.cm-search label': { fontSize: '12.5px', color: 'var(--color-fg-secondary)' },
  '.cm-panel input[type=checkbox]': { accentColor: 'var(--color-primary)' },
  '.cm-textfield': {
    backgroundColor: 'var(--color-background)',
    color: 'var(--color-foreground)',
    border: '1px solid var(--color-input)',
    borderRadius: '6px',
    padding: '3px 8px',
    fontSize: '12.5px',
  },
  '.cm-textfield:focus-visible': {
    outline: 'none',
    boxShadow: '0 0 0 3px var(--color-ring)',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--color-secondary)',
    color: 'var(--color-secondary-foreground)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    padding: '3px 10px',
    fontSize: '12.5px',
  },
  '.cm-button:hover': { backgroundColor: 'var(--color-accent)' },
  '.cm-button:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px var(--color-ring)' },
  '.cm-panel.cm-search [name=close]': {
    color: 'var(--color-muted-foreground)',
    fontSize: '18px',
    padding: '0 6px',
    borderRadius: '4px',
  },
  '.cm-panel.cm-search [name=close]:focus-visible': {
    outline: 'none',
    boxShadow: '0 0 0 3px var(--color-ring)',
  },
})

/** Changes the editor makes to match a new `value`: not the user's edits, so not reported back. */
const external = Annotation.define<boolean>()

interface CodeEditorProps {
  /** The text (controlled). */
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  /** A built-in language, or one derived from `path` when omitted. */
  language?: CodeEditorLanguage
  /**
   * The file this text belongs to. The editor keeps one undo history, cursor and selection per
   * path, so a tabbed editor can switch files without losing them.
   */
  path?: string
  readOnly?: boolean
  lineNumbers?: boolean
  /** Fold arrows in the gutter. */
  folding?: boolean
  /** Long lines wrap instead of scrolling sideways. */
  wrap?: boolean
  /** Spaces per indent level. */
  tabSize?: number
  placeholder?: string
  /** Problems to mark in the code, by line and column. */
  diagnostics?: readonly CodeEditorDiagnostic[]
  /** Mod-S (Ctrl or Cmd + S) inside the editor; the browser's Save dialog is prevented. */
  onSave?: (value: string) => void
  onCursorChange?: (cursor: CodeEditorCursor) => void
  /** More CodeMirror extensions: a language server client, your own completions, Vim keys. */
  extensions?: readonly Extension[]
  /** The editor's own size (CSS lengths). Without `height` it grows with its text up to `maxHeight`. */
  height?: string
  minHeight?: string
  maxHeight?: string
  autoFocus?: boolean
  /** Gets the CodeMirror view once it exists (to focus it, move the cursor), and null when it goes. */
  onViewChange?: (view: EditorView | null) => void
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  id?: string
}

function CodeEditor({
  value,
  defaultValue = '',
  onChange,
  language: languageProp,
  path,
  readOnly = false,
  lineNumbers = true,
  folding = true,
  wrap = false,
  tabSize = 2,
  placeholder,
  diagnostics,
  onSave,
  onCursorChange,
  extensions,
  height,
  minHeight,
  maxHeight,
  autoFocus = false,
  onViewChange,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  id,
}: CodeEditorProps) {
  const t = useCoreloomI18n().messages.codeEditor
  const language = languageProp ?? (path ? languageFromPath(path) : 'text')
  const hostRef = React.useRef<HTMLDivElement>(null)
  const viewInstance = React.useRef<EditorView | null>(null)
  // One saved state per path, so switching files keeps each one's undo history and cursor.
  const states = React.useRef(new Map<string, EditorState>())
  const pathRef = React.useRef(path)

  // The latest callbacks, read by CodeMirror's listeners (which are set up once).
  const callbacks = React.useRef({ onChange, onSave, onCursorChange })
  React.useLayoutEffect(() => {
    callbacks.current = { onChange, onSave, onCursorChange }
  })

  const compartments = React.useMemo(
    () => ({
      language: new Compartment(),
      editable: new Compartment(),
      gutters: new Compartment(),
      wrap: new Compartment(),
      indent: new Compartment(),
      placeholder: new Compartment(),
      attributes: new Compartment(),
      phrases: new Compartment(),
      extra: new Compartment(),
    }),
    [],
  )

  // Everything that follows props, as one reconfiguration.
  const dynamic = {
    language: languageExtension(language),
    editable: [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)],
    gutters: [
      lineNumbers ? [lineNumbersGutter(), highlightActiveLineGutter()] : [],
      folding ? foldGutter() : [],
    ],
    wrap: wrap ? EditorView.lineWrapping : [],
    indent: [EditorState.tabSize.of(tabSize), indentUnit.of(' '.repeat(tabSize))],
    placeholder: placeholder ? placeholderText(placeholder) : [],
    attributes: EditorView.contentAttributes.of({
      ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      ...(ariaLabelledBy ? { 'aria-labelledby': ariaLabelledBy } : {}),
      ...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {}),
      ...(ariaInvalid ? { 'aria-invalid': 'true' } : {}),
      ...(readOnly ? { 'aria-readonly': 'true' } : {}),
      ...(id ? { id } : {}),
      // The editor is a code field: no spell check, no autocorrect, no capitalised first letter.
      spellcheck: 'false',
      // Focusable even when read only, so the keyboard can reach, select and scroll the code.
      tabindex: '0',
      autocorrect: 'off',
      autocapitalize: 'off',
      translate: 'no',
    }),
    phrases: EditorState.phrases.of(t.phrases),
    extra: extensions ?? [],
  }
  const dynamicRef = React.useRef(dynamic)
  React.useLayoutEffect(() => {
    dynamicRef.current = dynamic
  })

  const createState = React.useEffectEvent((doc: string) => {
    const d = dynamicRef.current
    return EditorState.create({
      doc,
      extensions: [
        compartments.gutters.of(d.gutters),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(highlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        lintGutter(),
        keymap.of([
          {
            key: 'Mod-s',
            // Without onSave the key goes on to the page (an IDE around the editor saves).
            run: (view) => {
              const save = callbacks.current.onSave
              if (!save) return false
              save(view.state.doc.toString())
              return true
            },
          },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
          indentWithTab,
          // When Escape has nothing else to do, the next Tab leaves the editor.
          { key: 'Escape', run: temporarilySetTabFocusMode },
        ]),
        theme,
        EditorView.updateListener.of((update) => {
          if (
            update.docChanged &&
            !update.transactions.some((tr) => tr.annotation(external) === true)
          ) {
            callbacks.current.onChange?.(update.state.doc.toString())
          }
          if (update.docChanged || update.selectionSet) {
            const range = update.state.selection.main
            const line = update.state.doc.lineAt(range.head)
            callbacks.current.onCursorChange?.({
              line: line.number,
              column: range.head - line.from + 1,
              selected: update.state.selection.ranges.reduce((n, r) => n + r.to - r.from, 0),
            })
          }
        }),
        compartments.language.of(d.language),
        compartments.editable.of(d.editable),
        compartments.wrap.of(d.wrap),
        compartments.indent.of(d.indent),
        compartments.placeholder.of(d.placeholder),
        compartments.attributes.of(d.attributes),
        compartments.phrases.of(d.phrases),
        compartments.extra.of(d.extra),
      ],
    })
  })

  // Create the view once; React only owns the host element.
  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({ state: createState(value ?? defaultValue), parent: host })
    viewInstance.current = view
    onViewChange?.(view)
    if (autoFocus) view.focus()
    return () => {
      view.destroy()
      viewInstance.current = null
      onViewChange?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted once; later props reconfigure it below
  }, [])

  // Another file: park this one's state, bring back (or start) the next one's.
  React.useEffect(() => {
    const view = viewInstance.current
    if (!view || pathRef.current === path) return
    if (pathRef.current !== undefined) states.current.set(pathRef.current, view.state)
    pathRef.current = path
    const saved = path === undefined ? undefined : states.current.get(path)
    view.setState(saved ?? createState(value ?? ''))
  }, [path, value])

  // Follow every prop that changes the configuration.
  const { language: lang, editable, gutters, wrap: wrapExt, indent, placeholder: ph } = dynamic
  const { attributes, phrases, extra } = dynamic
  React.useEffect(() => {
    viewInstance.current?.dispatch({
      effects: [
        compartments.language.reconfigure(lang),
        compartments.editable.reconfigure(editable),
        compartments.gutters.reconfigure(gutters),
        compartments.wrap.reconfigure(wrapExt),
        compartments.indent.reconfigure(indent),
        compartments.placeholder.reconfigure(ph),
        compartments.attributes.reconfigure(attributes),
        compartments.phrases.reconfigure(phrases),
        compartments.extra.reconfigure(extra),
      ],
    })
    // The extension objects are rebuilt each render; these keys say when they really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [
    compartments,
    language,
    readOnly,
    lineNumbers,
    folding,
    wrap,
    tabSize,
    placeholder,
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedBy,
    ariaInvalid,
    id,
    t,
    extensions,
    path,
  ])

  // A new `value` from outside replaces the text (keeping the cursor where it can).
  React.useEffect(() => {
    const view = viewInstance.current
    if (!view || value === undefined) return
    const current = view.state.doc.toString()
    if (value === current) return
    const head = Math.min(view.state.selection.main.head, value.length)
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: head },
      annotations: external.of(true),
    })
  }, [value, path])

  React.useEffect(() => {
    const view = viewInstance.current
    if (!view) return
    view.dispatch(setDiagnostics(view.state, toOffsets(view.state.doc, diagnostics ?? [])))
  }, [diagnostics, value, path])

  return (
    <div
      ref={hostRef}
      data-slot="code-editor"
      data-readonly={readOnly || undefined}
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border border-border bg-inset text-foreground has-[.cm-content:focus-visible]:ring-[3px] has-[.cm-content:focus-visible]:ring-ring',
        ariaInvalid && 'border-destructive',
        className,
      )}
      style={{ height, minHeight, maxHeight }}
    />
  )
}

/** The name of a language as people read it: "TypeScript JSX", "Plain text". */
function useLanguageName() {
  const t = useCoreloomI18n().messages.codeEditor
  return (language: CodeEditorLanguage) =>
    CODE_EDITOR_LANGUAGES.find((l) => l.value === language)?.label ?? t.plainText
}

/**
 * Lets people pick the language of a CodeEditor: put it in the editor's header or toolbar and pass
 * the same value to the editor's `language`.
 */
function CodeEditorLanguageSelect({
  value,
  onValueChange,
  languages = CODE_EDITOR_LANGUAGES.map((l) => l.value),
  size = 'sm',
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  value: CodeEditorLanguage
  onValueChange: (language: CodeEditorLanguage) => void
  /** The languages to offer, in order (all built-in ones by default). */
  languages?: readonly CodeEditorLanguage[]
  size?: 'sm' | 'default'
  disabled?: boolean
  className?: string
  'aria-label'?: string
}) {
  const t = useCoreloomI18n().messages.codeEditor
  const name = useLanguageName()
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        onValueChange(next as CodeEditorLanguage)
      }}
      disabled={disabled}
    >
      <SelectTrigger
        size={size}
        aria-label={ariaLabel ?? t.language}
        className={cn('w-auto', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {languages.map((language) => (
          <SelectItem key={language} value={language}>
            {name(language)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export {
  CODE_EDITOR_LANGUAGES,
  CodeEditor,
  type CodeEditorCursor,
  type CodeEditorDiagnostic,
  type CodeEditorLanguage,
  CodeEditorLanguageSelect,
  type CodeEditorProps,
  toOffsets as diagnosticsToOffsets,
  languageFromPath,
  useLanguageName,
}
