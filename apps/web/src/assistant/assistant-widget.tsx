// The assistant from every page of the shell: a launcher in the corner that opens the panel in a
// card floating over the page, never beside it. Over an architecture's page the owner can enlarge
// it to read the changes proposed for a view.
import { AssistantPanel } from '@/assistant/assistant-panel'
import { ChatWidget } from '@/components/ai-chat-widget'
import { useAssistant } from '@/lib/assistant-context'
import { useFeature } from '@/lib/feature-flags'
import { useT } from '@/lib/locale'

export function AssistantWidget() {
  const t = useT().assistant
  const enabled = useFeature('diagram-assistant')
  const { open, setOpen } = useAssistant()
  if (!enabled) return null
  return (
    <ChatWidget open={open} onOpenChange={setOpen} title={t.title} subtitle={t.subtitle} resizable>
      {/* Mounted with the chat: the conversations are read when it opens, not with every page. */}
      {open && <AssistantPanel />}
    </ChatWidget>
  )
}
