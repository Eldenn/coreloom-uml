import * as React from 'react'

import type { DiagramFormat } from '@/components/diagram-file-tools'
import type { Messages } from '@/lib/i18n'
import { isPlantUml } from '@/lib/uml-plantuml'

/** The file picker's filter: the extensions each format is saved with, and plain text. */
const DIAGRAM_FILE_ACCEPT =
  '.mmd,.mermaid,.puml,.plantuml,.pu,.iuml,.wsd,.json,.txt,text/plain,application/json'

/** Larger files are not diagrams someone writes by hand: they are refused, not read. */
const MAX_DIAGRAM_FILE_BYTES = 1_000_000

const EXTENSION_FORMATS: Partial<Record<string, DiagramFormat>> = {
  mmd: 'mermaid',
  mermaid: 'mermaid',
  puml: 'plantuml',
  plantuml: 'plantuml',
  pu: 'plantuml',
  iuml: 'plantuml',
  wsd: 'plantuml',
  json: 'json',
}

/** A file read as a diagram's text, or why it couldn't be. */
type DiagramFileRead =
  | { status: 'read'; name: string; title: string; text: string; format: DiagramFormat }
  | { status: 'error'; name: string; error: 'tooLarge' | 'unreadable' }

/** The syntax a text is written in, when it clearly says: `@startuml`, `{`, or a Mermaid header. */
function sniffFormat(text: string): DiagramFormat | null {
  if (isPlantUml(text)) return 'plantuml'
  if (/^\s*[{[]/.test(text)) return 'json'
  const first = text.trimStart().split(/\s/)[0] ?? ''
  return /^(classDiagram|sequenceDiagram|stateDiagram|erDiagram|flowchart|graph|C4\w+|---)/.test(
    first,
  )
    ? 'mermaid'
    : null
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** The format of a file: its extension says; a `.txt` (or none) is read from its first words. */
function formatOfFile(name: string, text: string, fallback: DiagramFormat): DiagramFormat {
  return EXTENSION_FORMATS[extensionOf(name)] ?? sniffFormat(text) ?? fallback
}

/** "order-flow.puml" → "order-flow": the name a view takes from its file. */
function titleOfFile(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name).trim()
  return base || name
}

/** Reads a picked file in the browser. Binary files and files over 1 MB are refused. */
async function readDiagramFile(file: File, fallback: DiagramFormat): Promise<DiagramFileRead> {
  const name = file.name
  if (file.size > MAX_DIAGRAM_FILE_BYTES) return { status: 'error', name, error: 'tooLarge' }
  let text: string
  try {
    text = await file.text()
  } catch {
    return { status: 'error', name, error: 'unreadable' }
  }
  // A NUL character never appears in text: this is an image, an archive or another binary file.
  if (text.includes('\u0000')) return { status: 'error', name, error: 'unreadable' }
  const format = formatOfFile(name, text, fallback)
  return { status: 'read', name, title: titleOfFile(name), text, format }
}

/** What the status line says about a file that couldn't be read. */
function importError(read: DiagramFileRead, t: Messages['diagramEditor']): string | null {
  if (read.status === 'read') return null
  return read.error === 'tooLarge' ? t.importTooLarge(read.name) : t.importFailed(read.name)
}

/**
 * Reads the files picked with Import, one at a time: `onRead` gets each text; `notice` says what
 * happened to the last one until `clear` (the next edit).
 */
function useFileImport({
  format,
  onRead,
  t,
}: {
  format: DiagramFormat
  onRead: (read: Extract<DiagramFileRead, { status: 'read' }>) => void
  t: Messages['diagramEditor']
}) {
  const [notice, setNotice] = React.useState<string | null>(null)
  const latest = React.useRef(0)
  const importFile = (file: File) => {
    const ticket = ++latest.current
    void readDiagramFile(file, format).then((read) => {
      // A file picked later wins over one still being read.
      if (ticket !== latest.current) return
      if (read.status === 'read') onRead(read)
      setNotice(importError(read, t) ?? t.imported(read.name))
    })
  }
  const clear = () => {
    if (notice !== null) setNotice(null)
  }
  return { importFile, notice, clear }
}

/** True when what is dragged holds files (not text or a link from the page). */
function draggingFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

/**
 * Files dropped on an area: `dragging` while files are held over it, `onFiles` with the dropped
 * ones. The handlers run in the capture phase, so the area's children (the code editor would
 * paste a dropped file's text) never see files. Text and links dragged inside the page pass by.
 */
function useFileDrop({ enabled, onFiles }: { enabled: boolean; onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = React.useState(false)
  // dragenter and dragleave fire for every child crossed: count them to know when files leave.
  const depth = React.useRef(0)
  const take = (event: React.DragEvent) => {
    if (!enabled || !draggingFiles(event)) return false
    event.preventDefault()
    event.stopPropagation()
    return true
  }
  const handlers = {
    onDragEnterCapture: (event: React.DragEvent) => {
      if (!take(event)) return
      depth.current += 1
      setDragging(true)
    },
    onDragOverCapture: (event: React.DragEvent) => {
      if (take(event)) event.dataTransfer.dropEffect = 'copy'
    },
    onDragLeaveCapture: (event: React.DragEvent) => {
      if (!take(event)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    },
    onDropCapture: (event: React.DragEvent) => {
      if (!take(event)) return
      depth.current = 0
      setDragging(false)
      const files = Array.from(event.dataTransfer.files)
      if (files.length > 0) onFiles(files)
    },
  }
  return { dragging: enabled && dragging, handlers }
}

export {
  DIAGRAM_FILE_ACCEPT,
  type DiagramFileRead,
  formatOfFile,
  importError,
  MAX_DIAGRAM_FILE_BYTES,
  readDiagramFile,
  sniffFormat,
  titleOfFile,
  useFileDrop,
  useFileImport,
}
