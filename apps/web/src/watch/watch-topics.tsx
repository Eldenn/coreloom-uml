// The tags of the watch are the skills catalog's: same values, same labels, at most three, kept
// in the order they were picked (the first is the main one).
import { Badge } from '@/components/ui/badge'
import { ChipGroup } from '@/components/ui/chip-group'
import { useT } from '@/lib/locale'
import type { WatchTopics } from '@/lib/watch'
import { inPickOrder, topicLabel } from '@/skills/skill-values'

/** The API's bound (`SKILL_TOPIC_LIMITS.maxTopics`). */
const WATCH_MAX_TOPICS = 3

export function TopicChips({
  value,
  onChange,
  label,
  disabled,
}: {
  value: WatchTopics
  onChange: (topics: WatchTopics) => void
  label: string
  disabled?: boolean
}) {
  const t = useT().skills
  return (
    <ChipGroup
      type="multiple"
      size="sm"
      aria-label={label}
      disabled={disabled}
      options={Object.keys(t.topics).map((topic) => ({
        value: topic,
        label: topicLabel(t, topic),
        disabled: value.length >= WATCH_MAX_TOPICS && !(value as string[]).includes(topic),
      }))}
      value={value}
      onValueChange={(next) => {
        onChange(inPickOrder(value, next))
      }}
    />
  )
}

export function TopicBadges({ topics }: { topics: string[] }) {
  const t = useT().skills
  return topics.map((topic) => (
    <Badge key={topic} variant="outline">
      {topicLabel(t, topic)}
    </Badge>
  ))
}
