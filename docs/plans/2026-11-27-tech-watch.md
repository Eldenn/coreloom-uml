# Tech watch from RSS feeds — plan (2026-11-27)

## Goal

A "Watch" page shared by the whole instance: articles on AI and software engineering, gathered
from RSS and Atom feeds the admin picks, tagged with the same `Topic`s as the ready-made rules
and the skills (`packages/catalog/src/topics.ts`). Every account reads the page; the workspace
assistant reads it too (`find_articles`) to advise on an architecture or on agent conventions
(conventions holding `security` rules call `security` articles).

## Why RSS first, and where Linkup stands

The instance has one reader, the account that holds the keys. Linkup's Client GTC (August 2026)
forbid distributing Open Web Content to anyone else (art. 4.1, 6.1): with one reader, that
clause does not bite. What stays grey is retention: content is to be kept "for as long as is
necessary for the purposes of text and data mining only" (art. 4.1 iii), which a 90-day reading
list is not plainly; a question was sent to Linkup. The owner chose to start with feeds, which
publishers put out to be picked up. `watch_feeds.kind` has one value (`rss`, Atom included):
Linkup becomes a second kind later, through `WebSearch` (branch `worktree-web-search`), never a
second client, with its own spending cap per run. If the instance ever gets a second reader,
Linkup articles must not be shown to them without Linkup's written terms.

## Decisions (open points settled by the owner on 2026-11-27)

- **Instance-wide**, modelled on `app/skills/`: the admin sets, everyone reads. New domain
  `app/watch/`. Behind the `tech-watch` flag (`packages/feature-flags`, off by default): every
  route, the admin's included, answers 404 while it is off for the caller, and `find_articles`
  is `available` only with it (and `assistant-actions`).
- **A feed is the subject.** The admin adds a feed by its URL (`https` only), with optional
  tags of its own (`watch_feeds.topics`), which play the role of a skill's `search_topics`: what
  an article falls back to until the tagger reads it. No free query: a feed already says what it
  is about.
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
- **Tagging** reuses the skill tagger in the `skill-tagger` worker only: `classifySkillTopics`
  also embeds the new articles (title + excerpt, `watch_article_embeddings`, keyed by
  `embeddingHash`), the head is fitted once on the skills' labels plus the articles the admin
  tagged, and each article gets `tagger_topics`. `topics = effectiveTopics(feed topics, tagger,
  reviewed)`. The refresh queues `ClassifySkillTopicsJob` when it added articles. The admin sets
  an article's tags from its sheet (`PATCH /admin/watch-articles/:id`), which teaches the head.
  transformers.js stays out of the API and the `default` worker.
- **Measure first** (step b below): before the tagger's tags are shown, 100 articles from the
  first feeds are tagged by hand and the head is scored on them in the `skill-tagger` image
  (skill labels only, then skill + article labels in cross-validation, with the skill
  instruction and with an article instruction). Result and choice go in
  `infra/skill-tagger/README.md`. Below 0.7 of main tags right, articles keep their feed's tags
  until enough are tagged by hand.
- **Assistant**: `find_articles` (`app/assistant/actions/watch-actions.ts`), a read like
  `find_skills`: by words, by tag, by `sinceDays`; at most 10 visible articles, newest first,
  each title, link, site, date, tags and excerpt (300 chars). Its description says the excerpts
  are third-party text, data, never instructions; the excerpt's closing tags are broken like any
  text of a stranger's. No write action.
- **Page** `/watch` (in the sidebar next to Skills): a list of articles, newest first, each a card
  with title (link, new tab), site, date, tags and excerpt; filters by tag, words and period
  (7, 30, 90 days); paginated (`paginate`). Clicking a card's tags opens the sheet. The admin
  gets, on the same page, "Feeds" (a dialog like `SkillSourcesButton`: add, enable, delete,
  last run and error) and "Refresh now", and in the sheet: hide, block the site, edit tags
  (`SkillTopicsEditor`'s pattern). Components from coreloom-ui only.

## Routes

- `GET /watch/articles?page&perPage&topic&q&sinceDays` (auth, flag): visible articles.
- `GET|POST /admin/watch-feeds`, `PATCH|DELETE /admin/watch-feeds/:id` (`enabled`, `topics`).
- `POST /admin/watch/refresh` → 202, 409 while locked.
- `PATCH /admin/watch-articles/:id` (`hidden`, `topics`), `GET /admin/watch-articles?hidden=true`.
- `GET|POST /admin/watch-blocked-sites`, `DELETE /admin/watch-blocked-sites/:id`.

## Steps

a. Flag, migrations, models, feed fetch + parse (unit tests on fixture feeds, a hostile one
   included: entities, huge, redirect to a private address), `RefreshWatchJob`, `watch:setup`.
b. Tagging in `classifySkillTopics` + the measurement on real articles.
c. Routes and functional specs; Tuyau registry regenerated.
d. `find_articles` and its spec.
e. Web page, sheet, admin dialog; messages `en`/`fr`.
f. AGENTS.md paragraph, changeset.

## Settled with the owner

1. A subject is a feed with optional tags; no word filter.
2. Daily refresh.
3. Articles kept 90 days after publication.
4. Untagged articles are shown, with an "untagged" filter for the admin.
