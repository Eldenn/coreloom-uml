// One article in a side sheet, for the admin (the API refuses everyone else's edits): hide it or
// show it again, block its site, and set its tags or give them back to the tagger. The sheet
// shows the article the last edit answered, so it stays open when a filter no longer lists it.
import { ExternalLinkIcon } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { toast } from '@/components/ui/sonner'
import { TuyauError } from '@/lib/client'
import { useT } from '@/lib/locale'
import {
  useBlockWatchSite,
  useUpdateWatchArticle,
  type WatchArticle,
  type WatchTopics,
} from '@/lib/watch'
import { topicLabel } from '@/skills/skill-values'
import { PublishedOn } from '@/watch/watch-articles'
import { TopicBadges, TopicChips } from '@/watch/watch-topics'

function Section({
  title,
  help,
  children,
}: {
  title: string
  help: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-sm font-medium text-foreground">{title}</h3>
      <p className="m-0 text-sm text-muted-foreground">{help}</p>
      {children}
    </section>
  )
}

function ArticleTags({
  article,
  onChange,
}: {
  article: WatchArticle
  onChange: (article: WatchArticle) => void
}) {
  const t = useT()
  const update = useUpdateWatchArticle()
  const [picked, setPicked] = React.useState(article.topics as WatchTopics)
  const save = (topics: WatchTopics | null) => {
    update.mutate(
      { id: article.id, topics },
      {
        onSuccess: (result) => {
          onChange(result.article)
          toast.success(topics ? t.skills.tagging.saved : t.watch.sheet.tagsReset)
        },
        onError: () => toast.error(t.skills.tagging.failed),
      },
    )
  }
  const changed = picked.join() !== article.topics.join() || !article.reviewed
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-medium text-foreground">{t.skills.tagging.title}</h3>
        <Badge variant="outline">
          {article.reviewed ? t.watch.sheet.tagsSources.reviewed : t.watch.sheet.tagsSources.auto}
        </Badge>
      </div>
      <p className="m-0 text-sm text-muted-foreground">{t.watch.sheet.tagsHelp}</p>
      <TopicChips value={picked} onChange={setPicked} label={t.skills.tagging.title} />
      {picked[0] && (
        <p className="m-0 text-sm text-muted-foreground">
          {t.skills.tagging.main(topicLabel(t.skills, picked[0]))}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={picked.length === 0 || !changed || update.isPending}
          onClick={() => {
            save(picked)
          }}
        >
          {t.skills.tagging.save}
        </Button>
        {article.reviewed && (
          <Button
            size="sm"
            variant="outline"
            disabled={update.isPending}
            onClick={() => {
              save(null)
            }}
          >
            {t.skills.tagging.giveBack}
          </Button>
        )}
      </div>
    </section>
  )
}

function ArticleBody({
  article,
  onChange,
}: {
  article: WatchArticle
  onChange: (article: WatchArticle) => void
}) {
  const t = useT().watch
  const update = useUpdateWatchArticle()
  const block = useBlockWatchSite()
  return (
    <>
      <SheetHeader>
        <SheetTitle>{article.title}</SheetTitle>
        <SheetDescription>
          {article.site} · <PublishedOn date={article.publishedAt} />
        </SheetDescription>
        <div className="flex flex-wrap gap-1">
          {article.hidden && <Badge variant="secondary">{t.list.hidden}</Badge>}
          <TopicBadges topics={article.topics} />
        </div>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-[22px] pt-2 pb-4">
        {article.excerpt && (
          <p className="m-0 text-sm whitespace-pre-line text-foreground">{article.excerpt}</p>
        )}
        <ArticleTags key={article.topics.join()} article={article} onChange={onChange} />
        <Section title={t.sheet.visibility} help={t.sheet.visibilityHelp}>
          <Button
            variant="outline"
            className="w-fit"
            disabled={update.isPending}
            onClick={() => {
              update.mutate(
                { id: article.id, hidden: !article.hidden },
                {
                  onSuccess: (result) => {
                    onChange(result.article)
                    toast.success(result.article.hidden ? t.sheet.hidden : t.sheet.shown)
                  },
                  onError: () => toast.error(t.sheet.updateFailed),
                },
              )
            }}
          >
            {article.hidden ? t.sheet.show : t.sheet.hide}
          </Button>
        </Section>
        <Section title={t.sheet.siteTitle} help={t.sheet.blockHelp}>
          <Button
            variant="destructive"
            className="w-fit"
            disabled={block.isPending}
            onClick={() => {
              block.mutate(article.site, {
                onSuccess: () => {
                  onChange({ ...article, hidden: true })
                  toast.success(t.sheet.blocked)
                },
                onError: (error) =>
                  error instanceof TuyauError && error.status === 409
                    ? toast.info(t.sheet.blockedAlready)
                    : toast.error(t.sheet.blockFailed),
              })
            }}
          >
            {t.sheet.block(article.site)}
          </Button>
        </Section>
      </div>
      <SheetFooter className="flex-row flex-wrap">
        <Button variant="outline" asChild>
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            {t.sheet.open}
            <ExternalLinkIcon />
          </a>
        </Button>
      </SheetFooter>
    </>
  )
}

export function WatchArticleSheet({
  article,
  onClose,
  onChange,
}: {
  article: WatchArticle | null
  onClose: () => void
  onChange: (article: WatchArticle) => void
}) {
  return (
    <Sheet
      open={!!article}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        {article && <ArticleBody article={article} onChange={onChange} />}
      </SheetContent>
    </Sheet>
  )
}
