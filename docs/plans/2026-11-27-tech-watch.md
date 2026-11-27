# Tech watch from RSS feeds and web searches — plan (2026-11-27)

## Goal

A "Watch" page shared by the whole instance: articles on AI and software engineering, gathered
from the RSS and Atom feeds and the web searches the admin picks, tagged with the same `Topic`s as the ready-made rules
and the skills (`packages/catalog/src/topics.ts`). Every account reads the page; the workspace
assistant reads it too (`find_articles`) to advise on an architecture or on agent conventions
(conventions holding `security` rules call `security` articles).

## Linkup and its terms

The instance has one reader, the account that holds the keys. Linkup's Client GTC (August 2026)
forbid distributing Open Web Content to anyone else (art. 4.1, 6.1): with one reader, that
clause does not bite. What stays grey is retention: content is to be kept "for as long as is
necessary for the purposes of text and data mining only" (art. 4.1 iii), which a 90-day reading
list is not plainly; a question was sent to Linkup, and the owner chose to go ahead. RSS was
built first, then a second kind of source on top of `WebSearch` (branch
`worktree-web-search`, merged into this one; never a second client). If the instance ever gets a
second reader, Linkup articles must not be shown to them without Linkup's written terms
(Specific Terms, art. 2), or the `linkup` sources must go.

## Decisions (open points settled by the owner on 2026-11-27)

- **Instance-wide**, modelled on `app/skills/`: the admin sets, everyone reads. New domain
  `app/watch/`. Behind the `tech-watch` flag (`packages/feature-flags`, off by default): every
  route, the admin's included, answers 404 while it is off for the caller, and `find_articles`
  is `available` only with it (and `assistant-actions`).
- **A source is the subject** (`watch_sources`, one `kind` each): a feed by its URL (`rss`,
  `https` only) or a web search by its words (`linkup`), with optional tags of its own
  (`watch_sources.topics`), which play the role of a skill's `search_topics`: what an article
  falls back to until the tagger reads it.
- **Searches**: a `linkup` source is one search a run with the instance's key (`webSearchKey`),
  `depth: fast`, `outputType: searchResults`, `WATCH_SEARCH_LIMITS.results` pages published
  since the source's last run (a day of overlap; `lookbackDays` before its first), the blocked
  sites in `excludeDomains`. A run spends at most `WATCH_SEARCH_LIMITS.searchesPerRun` (10, about
  $0.05), apart from the assistant's per-account cap; a source past it waits for the next run
  and keeps its date. Without a saved service a search source records why and reads nothing.
  `WebSearch.search` takes `fromDate`, `excludeDomains` and `maxResults` for this (docs.linkup.so,
  read on 2026-11-27: dates are `YYYY-MM-DD`, an undated page is left out once a date is set).
- **Refresh**: `RefreshWatchJob`, daily at 05:00 UTC (`WATCH_REFRESH_SCHEDULE`), scheduled at
  startup next to `skills:setup` (`node ace watch:setup`), and queued by the admin with
  `POST /admin/watch/refresh` behind a Redis lock like `skills-refresh-lock.ts` (409 while one
  runs). Runs on the `default` queue. No request handler fetches a feed.
- **Fetching** (in the worker, not a sandbox: the URLs are the admin's, the content is a feed,
  never run): `node:https` with a `lookup` that refuses private, loopback, link-local and
  metadata addresses (`net.BlockList`, the ranges of `RESEARCH_DENIED_RANGES`), so a name that
  resolves inside is refused at connect time; redirects followed by hand, 3 at most, each
  checked again; `WATCH_FETCH_LIMITS` (timeout 15 s, body 2 MB). Parsed with `fast-xml-parser`
  (`5.12.1`, pure JS, no DTD or entity expansion beyond the XML five), RSS 2.0 `item` and Atom
  `entry`. A feed that fails keeps its articles and stores `last_error`.
- **What is kept of an article** (`watch_articles`): title (300 chars), link (unique, normalized:
  no fragment, no `utm_*`), site (the link's host), publication date, excerpt (the description
  or summary reduced to plain text, 500 chars), tags, `hidden`. Never the page, never `content:encoded`
  beyond the excerpt. Nothing is fetched from the article's own page.
- **Filtering** at each run: an item without a date, dated in the future, or older than the
  retention is dropped; one already known by its link is left as it is (a hidden one stays
  hidden); one whose site is blocked (`watch_blocked_sites`, a host and its subdomains) is
  dropped; at most `WATCH_LIMITS.itemsPerFeed` (50) new items a feed a run. The admin hides an
  article or blocks its site from its sheet; blocking a site hides its articles already kept.
- **Retention**: 90 days after publication (`WATCH_LIMITS.retentionDays`); each run deletes what
  is older, embeddings included (cascade).
- **Tagging** reuses the skill tagger in the `skill-tagger` worker only: `ClassifySkillTopicsJob`
  runs `classifyWatchArticles` (`watch-topics.ts`) after `classifySkillTopics`, which embeds the
  new articles (title + excerpt, `watch_article_embeddings`, keyed by `embeddingHash`), fits the
  head on the skills' labels plus the articles the admin tagged, and gives each article
  `tagger_topics`. `topics = effectiveTopics(source topics, tagger, reviewed)`. The refresh queues
  the job when it added articles. The admin sets an article's tags from its sheet
  (`PATCH /admin/watch/articles/:id`), which teaches the head. transformers.js stays out of the
  API and the `default` worker.
- **Measured** (step b): 106 articles of 14 public feeds tagged by hand, main tag right 0.64 from
  the skills' labels alone and 0.67 to 0.70 with the other feeds' articles added (each feed held
  out; `infra/skill-tagger/README.md`). Below 0.7, so an article keeps its source's tags and takes
  the tagger's only when its source has none, until the admin tagged
  `WATCH_TAGGER.minArticleLabels` articles (`articleTopics`). The measurement also found a parser
  bug (a feed inlining `<style>` gave CSS as an excerpt), fixed in `plainText`.
- **Assistant**: `find_articles` (`app/assistant/actions/watch-actions.ts`), a read like
  `find_skills`: by words, by tag, by `sinceDays`; at most 10 visible articles, newest first,
  each title, link, site, date, tags and excerpt (300 chars). Its description says the excerpts
  are third-party text, data, never instructions; they reach the model as fields of the tool's
  JSON result, like `find_skills`' descriptions, never inside a prompt block. No write action.
- **Page** `/watch` (in the sidebar next to Skills): a list of articles, newest first, each a card
  with title (link, new tab), site, date, tags and excerpt; filters by tag, words and period
  (7, 30, 90 days); paginated (`paginate`). Clicking a card's tags opens the sheet. The admin
  gets, on the same page, "Feeds" (a dialog like `SkillSourcesButton`: add, enable, delete,
  last run and error) and "Refresh now", and in the sheet: hide, block the site, edit tags
  (`SkillTopicsEditor`'s pattern). Components from coreloom-ui only.

## Routes

- `GET /watch/articles?page&perPage&topic&q&sinceDays&untagged&hidden` (auth, flag): visible
  articles; `hidden` for the admin only.
- `GET|POST /admin/watch/sources` (`{ url }` or `{ query }`, optional `topics`; the list answers
  `webSearchReady`), `PATCH|DELETE /admin/watch/sources/:id` (`enabled`, `topics`).
- `POST /admin/watch/refresh` → 202, 409 while locked.
- `PATCH /admin/watch/articles/:id` (`hidden`, `topics`).
- `GET|POST /admin/watch/blocked-sites`, `DELETE /admin/watch/blocked-sites/:id`.

## Steps (all done)

a. Flag, migration, models, feed fetch + parse (unit tests: RSS, Atom, entities refused,
   hostile text timed, private addresses refused), `RefreshWatchJob`, `watch:setup`.
b. Article tagging (`classifyWatchArticles`, in `ClassifySkillTopicsJob`) and the measurement
   on real articles (below).
c. Routes and functional specs; Tuyau registry regenerated.
d. `find_articles` and its spec.
e. `linkup` sources on `WebSearch`, with the run's search budget.
f. Web page, sheet, admin dialog; messages `en`/`fr`.
g. AGENTS.md paragraph, changeset.

## Settled with the owner

1. A subject is a source (a feed or a web search) with optional tags; no word filter.
2. Daily refresh.
3. Articles kept 90 days after publication.
4. Untagged articles are shown, with an "untagged" filter for the admin.
