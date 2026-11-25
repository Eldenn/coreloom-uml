// What the admin's own model says of one copy of a skill, next to SkillSpector's scan: asked on
// demand with the provider this browser keeps, shown as a help to read the copy. It never decides:
// the copy's files are a stranger's and may address the model.
import { Link } from '@tanstack/react-router'
import { SparklesIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { providerCallFailure, useStoredProvider } from '@/lib/llm-provider'
import { useLocale, useT } from '@/lib/locale'
import { type SkillVersion, useModelReviewSkillVersion } from '@/lib/skill-versions'
import { useProviderFailureText } from '@/llm/provider-failure'

type Review = NonNullable<SkillVersion['modelReview']>

const VERDICT_BADGES = {
  no_risk_seen: 'success',
  risk_seen: 'destructive',
  unsure: 'warning',
} as const

const ASSESSMENT_BADGES = { benign: 'secondary', risky: 'destructive', unsure: 'warning' } as const

function Notes({ review }: { review: Review }) {
  const t = useT().skillVersions.model
  const scan = useT().skillVersions.scan
  if (review.notes.length === 0) return null
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
      {review.notes.map((note, index) => (
        <li key={`${note.about}-${String(index)}`} className="flex flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={ASSESSMENT_BADGES[note.assessment]}>
              {t.assessments[note.assessment]}
            </Badge>
            <span className="font-medium">{note.label ?? t.other}</span>
            {note.file && (
              <code className="text-muted-foreground">{scan.at(note.file, note.line)}</code>
            )}
          </span>
          <span className="text-muted-foreground">{note.comment}</span>
        </li>
      ))}
    </ul>
  )
}

export function SkillModelReview({ version }: { version: SkillVersion }) {
  const t = useT().skillVersions.model
  const { locale } = useLocale()
  const provider = useStoredProvider()
  const failureText = useProviderFailureText()
  const run = useModelReviewSkillVersion()
  const review = version.modelReview

  return (
    <section className="flex flex-col gap-1.5 rounded-md border p-3">
      <h3 className="m-0 flex flex-wrap items-center gap-2 text-sm font-medium">
        {t.title}
        {review && (
          <Badge variant={VERDICT_BADGES[review.verdict]}>{t.verdicts[review.verdict]}</Badge>
        )}
      </h3>
      <p className="m-0 text-[13px] text-muted-foreground">{t.caution}</p>
      {review && (
        <>
          <p className="m-0 text-[13px]">{review.summary}</p>
          <Notes review={review} />
          {review.omittedFiles.length > 0 && (
            <p className="m-0 text-[13px] text-muted-foreground">
              {t.omitted(review.omittedFiles.join(', '))}
            </p>
          )}
          <p className="m-0 text-xs text-muted-foreground">{t.by(review.model)}</p>
        </>
      )}
      {run.isError && (
        <Alert variant="destructive">
          <AlertTitle>{t.failed}</AlertTitle>
          <AlertDescription>{failureText(providerCallFailure(run.error))}</AlertDescription>
        </Alert>
      )}
      {provider ? (
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={run.isPending}
          onClick={() => {
            run.mutate({ id: version.id, provider, locale: locale === 'fr' ? 'fr' : 'en' })
          }}
        >
          {run.isPending ? <Spinner /> : <SparklesIcon />}
          {review ? t.askAgain(provider.model) : t.ask(provider.model)}
        </Button>
      ) : (
        <Button variant="link" size="sm" className="w-fit px-0" asChild>
          <Link to="/settings">{t.noProvider}</Link>
        </Button>
      )}
    </section>
  )
}
