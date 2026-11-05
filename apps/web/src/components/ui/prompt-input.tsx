import { ArrowUpIcon, FileIcon, PaperclipIcon, SquareIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AiChatStatus } from '@/lib/ai'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function PromptInput({
  onSubmit,
  onStop,
  status = 'ready',
  value,
  defaultValue = '',
  onValueChange,
  placeholder,
  accept,
  allowAttachments = false,
  toolbar,
  disabled = false,
  autoFocus,
  className,
}: {
  /** Called with the trimmed text and the attached files. The field clears itself. */
  onSubmit: (message: { text: string; files: File[] }) => void
  /** Shown as a Stop button while `status` is "submitted" or "streaming". */
  onStop?: () => void
  /** useChat's status: Send turns into Stop while a reply is on its way. */
  status?: AiChatStatus
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  /** File types for attachments, as in <input accept> ("image/*,.pdf"). */
  accept?: string
  allowAttachments?: boolean
  /** Controls on the left of the bottom bar: a model picker, toggles. */
  toolbar?: React.ReactNode
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}) {
  const t = useCoreloomI18n().messages.ai.prompt
  const [inner, setInner] = React.useState(defaultValue)
  const text = value ?? inner
  const setText = (next: string) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }
  const [files, setFiles] = React.useState<File[]>([])
  const fileInput = React.useRef<HTMLInputElement>(null)
  const textarea = React.useRef<HTMLTextAreaElement>(null)
  const hintId = React.useId()
  const busy = status === 'submitted' || status === 'streaming'
  const canSend = !disabled && !busy && (text.trim().length > 0 || files.length > 0)

  const submit = () => {
    if (!canSend) return
    onSubmit({ text: text.trim(), files })
    setText('')
    setFiles([])
  }

  return (
    <form
      data-slot="prompt-input"
      data-busy={busy || undefined}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-input bg-inset p-2 shadow-sm transition-[border-color,box-shadow] duration-base focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring',
        disabled && 'opacity-55',
        className,
      )}
    >
      {files.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0 px-1 pt-1">
          {files.map((file, i) => (
            <li
              // eslint-disable-next-line @eslint-react/no-array-index-key -- File objects have no id and two may share a name; the index tells them apart.
              key={`${file.name}-${i}`}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card py-1 pr-1 pl-2 text-[12.5px] text-foreground"
            >
              <FileIcon className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="max-w-40 truncate">{file.name}</span>
              <button
                type="button"
                aria-label={t.removeFile(file.name)}
                onClick={() => {
                  setFiles((f) => f.filter((_, j) => j !== i))
                }}
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={textarea}
        data-slot="prompt-input-textarea"
        aria-label={t.label}
        aria-describedby={hintId}
        rows={1}
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder ?? t.placeholder}
        onChange={(e) => {
          setText(e.target.value)
        }}
        onKeyDown={(e) => {
          // Enter sends; Shift + Enter breaks the line; composing (IME) text never sends.
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        className="field-sizing-content max-h-60 min-h-11 w-full resize-none bg-transparent px-2 py-1.5 font-sans text-[14.5px] leading-normal text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
      <span id={hintId} className="sr-only">
        {t.hint}
      </span>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {allowAttachments && (
            <>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={accept}
                hidden
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? [])
                  setFiles((f) => [...f, ...picked])
                  e.target.value = ''
                  textarea.current?.focus()
                }}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.attach}
                    disabled={disabled}
                    onClick={() => fileInput.current?.click()}
                  >
                    <PaperclipIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t.attach}</TooltipContent>
              </Tooltip>
            </>
          )}
          {toolbar}
        </div>
        {busy && onStop ? (
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            aria-label={t.stop}
            onClick={onStop}
          >
            <SquareIcon className="fill-current" />
          </Button>
        ) : (
          <Button type="submit" size="icon-sm" aria-label={t.send} disabled={!canSend}>
            <ArrowUpIcon />
          </Button>
        )}
      </div>
    </form>
  )
}

export { PromptInput }
