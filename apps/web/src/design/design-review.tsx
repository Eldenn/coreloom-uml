// What a project's requirements and decisions say against themselves, above their lists: read
// from the stored records by the API, with no model call.
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { useDesignReview } from '@/lib/design-records'
import { useT } from '@/lib/locale'

export function DesignReview({ projectId }: { projectId: number }) {
  const t = useT().design
  const findings = useDesignReview(projectId).data
  // Nothing is said until it is known: the lists below carry the loading and the errors.
  if (!findings) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle id="design-review-title">{t.review}</CardTitle>
        <CardDescription>{t.reviewDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {findings.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{t.reviewClear}</p>
        ) : (
          <ItemGroup aria-labelledby="design-review-title" className="gap-2">
            {findings.map((finding) => (
              <Item
                key={`${finding.kind}-${String(finding.requirementId ?? finding.decisionId)}`}
                variant="outline"
                size="sm"
              >
                <ItemContent>
                  <ItemTitle>{finding.subject}</ItemTitle>
                  <ItemDescription>{t.findings[finding.kind]}</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  )
}
