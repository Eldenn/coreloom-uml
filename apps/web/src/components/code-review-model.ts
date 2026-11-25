// Coreloom UI — Code review, the data side. The shapes the CodeReview block reads (changed files,
// comment threads anchored on a line, the review's verdict) and the plain functions behind it:
// line counts, where a thread sits in a diff, and the folder tree of the changed files.
import type { CommentData } from '@/components/ui/comment-thread'
import { type DiffLine, diffLines } from '@/components/ui/diff-viewer'

type ReviewFileStatus = 'added' | 'modified' | 'deleted' | 'renamed'

interface ReviewFile {
  /** The file's path now (for a deleted file, the path it had). Unique among the files. */
  path: string
  status: ReviewFileStatus
  /** The path before a rename. */
  oldPath?: string
  /** The text before the change; empty for an added file. */
  before: string
  /** The text after the change; empty for a deleted file. */
  after: string
}

/** Which text a line number counts in: `old` for the text before, `new` for the text after. */
type ReviewSide = 'old' | 'new'

interface ReviewThread {
  id: string
  /** The file it is on. */
  path: string
  /** The line, from 1, in the text `side` names. */
  line: number
  side: ReviewSide
  /** The discussion is settled: it folds into one line until opened. */
  resolved?: boolean
  /** The comments, oldest first. */
  comments: CommentData[]
}

type ReviewVerdict = 'comment' | 'approve' | 'request-changes'

/** A new comment on a line, for `onComment`. */
interface ReviewCommentInput {
  path: string
  line: number
  side: ReviewSide
  body: string
}

/** The finished review, for `onSubmitReview`. */
interface ReviewSubmission {
  verdict: ReviewVerdict
  /** The summary; may be empty. */
  body: string
}

type ReviewLayout = 'unified' | 'split'

interface DiffStats {
  added: number
  removed: number
}

function diffStats(lines: readonly DiffLine[]): DiffStats {
  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.type === 'add') added++
    else if (line.type === 'remove') removed++
  }
  return { added, removed }
}

/** Lines added and removed in one file. */
const fileStats = (file: ReviewFile): DiffStats => diffStats(diffLines(file.before, file.after))

/** The files changed and the lines added and removed across all of them. */
function reviewStats(files: readonly ReviewFile[]): DiffStats & { files: number } {
  return files.reduce(
    (total, file) => {
      const stats = fileStats(file)
      return {
        files: total.files,
        added: total.added + stats.added,
        removed: total.removed + stats.removed,
      }
    },
    { files: files.length, added: 0, removed: 0 },
  )
}

/** Where a comment on this line is anchored: removed lines count in the old text, others in the new. */
function lineAnchor(line: DiffLine): { side: ReviewSide; line: number } {
  if (line.type === 'remove') return { side: 'old', line: line.oldLine ?? 0 }
  return { side: 'new', line: line.newLine ?? 0 }
}

const anchorKey = (side: ReviewSide, line: number) => `${side}:${String(line)}`

/** A file's threads by anchor (`side:line`), each list in the order given. */
function threadsByAnchor(
  threads: readonly ReviewThread[],
  path: string,
): Map<string, ReviewThread[]> {
  const map = new Map<string, ReviewThread[]>()
  for (const thread of threads) {
    if (thread.path !== path) continue
    const key = anchorKey(thread.side, thread.line)
    map.set(key, [...(map.get(key) ?? []), thread])
  }
  return map
}

/** The keys a line answers to: its own anchor, and for an unchanged line its number in the old text. */
function lineKeys(line: DiffLine): string[] {
  const own = lineAnchor(line)
  const keys = [anchorKey(own.side, own.line)]
  if (line.type === 'equal' && line.oldLine !== undefined) keys.push(anchorKey('old', line.oldLine))
  return keys
}

/** The threads drawn under a line. */
function threadsForLine(byAnchor: Map<string, ReviewThread[]>, line: DiffLine): ReviewThread[] {
  return lineKeys(line).flatMap((key) => byAnchor.get(key) ?? [])
}

/** A file's threads whose line is not in its diff any more: shown after the file, not lost. */
function outdatedThreads(
  byAnchor: Map<string, ReviewThread[]>,
  lines: readonly DiffLine[],
): ReviewThread[] {
  const present = new Set(lines.flatMap(lineKeys))
  return [...byAnchor.entries()].filter(([key]) => !present.has(key)).flatMap(([, list]) => list)
}

/** A folder or a file in the tree of changed files. Folders with one folder inside merge: `src/ui`. */
interface ReviewTreeNode {
  /** `dir:<path>` for a folder, the file's path for a file. */
  id: string
  name: string
  /** Files only: the file's path. */
  path?: string
  children?: ReviewTreeNode[]
}

interface Dir {
  dirs: Map<string, Dir>
  files: string[]
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

function dirOf(paths: readonly string[]): Dir {
  const root: Dir = { dirs: new Map(), files: [] }
  for (const path of paths) {
    let dir = root
    for (const part of path.split('/').slice(0, -1)) {
      const next = dir.dirs.get(part) ?? { dirs: new Map(), files: [] }
      dir.dirs.set(part, next)
      dir = next
    }
    dir.files.push(path)
  }
  return root
}

function dirNodes(dir: Dir, prefix: string): ReviewTreeNode[] {
  const folders = [...dir.dirs.entries()]
    .sort(([a], [b]) => byName(a, b))
    .map(([name, child]) => {
      // A folder that only holds one folder merges with it, as code hosts show them.
      let label = name
      let inner = child
      while (inner.files.length === 0 && inner.dirs.size === 1) {
        const [[nextName, next]] = [...inner.dirs.entries()]
        label = `${label}/${nextName}`
        inner = next
      }
      const path = `${prefix}${label}`
      return { id: `dir:${path}`, name: label, children: dirNodes(inner, `${path}/`) }
    })
  const files = [...dir.files]
    .sort((a, b) => byName(baseName(a), baseName(b)))
    .map((path) => ({ id: path, name: baseName(path), path }))
  return [...folders, ...files]
}

/** The changed files as a folder tree: folders first, then files, each by name. */
function reviewTree(paths: readonly string[]): ReviewTreeNode[] {
  return dirNodes(dirOf(paths), '')
}

export {
  type DiffStats,
  diffStats,
  fileStats,
  lineAnchor,
  outdatedThreads,
  type ReviewCommentInput,
  type ReviewFile,
  type ReviewFileStatus,
  type ReviewLayout,
  type ReviewSide,
  reviewStats,
  type ReviewSubmission,
  type ReviewThread,
  reviewTree,
  type ReviewTreeNode,
  type ReviewVerdict,
  threadsByAnchor,
  threadsForLine,
}
