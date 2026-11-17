// What a code map holds: where it comes from (repository, branch, commit), its counts, its
// folders and communities, and the entry points found in it. No graph view: thousands of nodes
// don't read, and the map is never drawn on the server.
import { ExternalLinkIcon } from 'lucide-react'

import { StatCard } from '@/components/stat-card'
import { Badge } from '@/components/ui/badge'
import { BarList } from '@/components/ui/bar-list'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DescriptionList } from '@/components/ui/description-list'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { codeHref, type CodeMapContents, type CodeMapDetail } from '@/lib/code-maps'
import { useLocale, useT } from '@/lib/locale'

export function CodeMapOverview({
  map,
  contents,
}: {
  map: CodeMapDetail
  contents: CodeMapContents
}) {
  const t = useT()
  const { counts } = contents
  return (
    <div className="flex flex-col gap-4">
      <CodeMapHeader map={map} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t.code.files} value={counts.files} />
        <StatCard label={t.code.symbols} value={counts.symbols} />
        <StatCard label={t.code.modules} value={counts.modules} />
        <StatCard label={t.code.edges} value={counts.edges} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.code.folders}</CardTitle>
            <CardDescription>{t.code.foldersHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              aria-label={t.code.folders}
              data={contents.folders.map((folder) => ({
                key: folder.path,
                label: <span className="font-mono text-[12.5px]">{folder.path}</span>,
                value: folder.files,
                ...hrefOf(map, `${folder.path}/`),
              }))}
              limit={12}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.code.communities}</CardTitle>
            <CardDescription>{t.code.communitiesHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              aria-label={t.code.communities}
              data={contents.communities.map((community) => ({
                key: String(community.id),
                label: (
                  <span className="font-mono text-[12.5px]">
                    {t.code.community(community.folder)}
                  </span>
                ),
                value: community.size,
              }))}
              limit={12}
            />
          </CardContent>
        </Card>
      </div>
      <EntryPoints map={map} entries={contents.entries} />
    </div>
  )
}

function hrefOf(map: CodeMapDetail, key: string, line?: number): { href?: string } {
  const href = codeHref(map, key, line)
  return href ? { href } : {}
}

function CodeMapHeader({ map }: { map: CodeMapDetail }) {
  const t = useT()
  const { locale } = useLocale()
  const repository = map.repositoryUrl
  return (
    <Card>
      <CardContent>
        <DescriptionList
          layout="grid"
          columns={3}
          items={[
            {
              term: t.code.repository,
              value: repository ? (
                <a
                  href={repository}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 break-all text-primary-text underline-offset-2 hover:underline"
                >
                  {repository.replace(/^https?:\/\//, '')}
                  <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden />
                </a>
              ) : null,
            },
            { term: t.code.branch, value: map.branch },
            {
              term: t.code.commit,
              value: map.commitSha ? (
                <code className="font-mono text-[12.5px]">{map.commitSha.slice(0, 12)}</code>
              ) : null,
              ...(map.commitSha ? { copy: map.commitSha } : {}),
            },
            {
              term: t.code.added,
              value: new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(map.createdAt)),
            },
            { term: t.code.source, value: t.code.sources[map.source] },
            { term: t.code.extractor, value: `${map.extractor} ${map.extractorVersion}` },
          ]}
        />
      </CardContent>
    </Card>
  )
}

function EntryPoints({
  map,
  entries,
}: {
  map: CodeMapDetail
  entries: CodeMapContents['entries']
}) {
  const t = useT()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.code.entries}</CardTitle>
        <CardDescription>{t.code.entriesHint}</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="m-0 text-[13px] text-muted-foreground">{t.code.noEntries}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.code.kind}</TableHead>
                <TableHead>{t.code.name}</TableHead>
                <TableHead>{t.code.place}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const place =
                  entry.line === undefined ? entry.path : `${entry.path}:${String(entry.line)}`
                const href = codeHref(map, entry.key, entry.line)
                return (
                  <TableRow key={entry.key}>
                    <TableCell>
                      <Badge variant="secondary">{t.code.entryKinds[entry.kind]}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[12.5px]">{entry.name}</TableCell>
                    <TableCell className="font-mono text-[12.5px] break-all whitespace-normal">
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-primary-text underline-offset-2 hover:underline"
                          aria-label={t.code.openInRepository(place)}
                        >
                          {place}
                        </a>
                      ) : (
                        place
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
