// A skill's tags, in its sheet, for the admin only (the API refuses everyone else): set them by
// hand, the first one picked being the main tag the tagger learns from at its next run, or give
// them back to the tagger.
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChipGroup } from '@/components/ui/chip-group'
import { toast } from '@/components/ui/sonner'
import { useT } from '@/lib/locale'
import { type ReviewedTopics, useReviewSkillTopics } from '@/lib/skill-versions'
import type { SkillDetail } from '@/lib/skills'
import { topicLabel } from '@/skills/skill-values'

/** The API's bound (`SKILL_TOPIC_LIMITS.maxTopics`). */
const MAX_TOPICS = 3

type Topics = NonNullable<ReviewedTopics>

/** `next` in the order its values were picked: those already in `picked` keep their place. */
function inPickOrder(picked: Topics, next: string[]): Topics {
  return [
    ...picked.filter((topic) => next.includes(topic)),
    ...(next.filter((t) => !(picked as string[]).includes(t)) as Topics),
  ]
}

export function SkillTopicsEditor({ skill }: { skill: SkillDetail }) {
  const t = useT().skills
  const review = useReviewSkillTopics()
  // The API only ever answers tags of the catalog.
  const [picked, setPicked] = React.useState(skill.topics as Topics)

  const save = (topics: ReviewedTopics) =>
    review.mutate(
      { slug: skill.slug, topics },
      {
        onSuccess: () => toast.success(topics ? t.tagging.saved : t.tagging.reset),
        onError: () => toast.error(t.tagging.failed),
      },
    )
  const changed = picked.join() !== skill.topics.join() || skill.topicsSource !== 'reviewed'

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-medium text-foreground">{t.tagging.title}</h3>
        <Badge variant="outline">{t.tagging.sources[skill.topicsSource]}</Badge>
      </div>
      <p className="m-0 text-sm text-muted-foreground">{t.tagging.help}</p>
      <ChipGroup
        type="multiple"
        size="sm"
        aria-label={t.tagging.title}
        options={Object.keys(t.topics).map((topic) => ({
          value: topic,
          label: topicLabel(t, topic),
          disabled: picked.length >= MAX_TOPICS && !(picked as string[]).includes(topic),
        }))}
        value={picked}
        onValueChange={(next) => setPicked(inPickOrder(picked, next))}
      />
      {picked[0] && (
        <p className="m-0 text-sm text-muted-foreground">
          {t.tagging.main(topicLabel(t, picked[0]))}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={picked.length === 0 || !changed || review.isPending}
          onClick={() => save(picked)}
        >
          {t.tagging.save}
        </Button>
        {skill.topicsSource === 'reviewed' && (
          <Button
            size="sm"
            variant="outline"
            disabled={review.isPending}
            onClick={() => save(null)}
          >
            {t.tagging.giveBack}
          </Button>
        )}
      </div>
    </section>
  )
}
