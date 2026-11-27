import { TOPICS } from '@coreloom-uml/catalog'
import vine from '@vinejs/vine'
import { SKILL_TOPIC_LIMITS } from '#app/skills/constants/skill-topics'
import { WATCH_ASSISTANT_LIMITS, WATCH_LIMITS } from '#app/watch/constants/watch'
import { WEB_SEARCH_LIMITS } from '#app/web-search/constants/web-search'

/** A host as typed by the admin: letters, digits, hyphens and dots, lower-cased. */
const HOST = /^(?=.{1,253}$)(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/

const topics = () =>
  vine.array(vine.enum(TOPICS)).maxLength(SKILL_TOPIC_LIMITS.maxTopics).distinct()

/**
 * `GET /watch/articles` query params: by tag, by words (in the title or the excerpt), published
 * within `sinceDays`. `untagged` lists the articles with no tag; `hidden` (the admin's only) the
 * articles the admin hid.
 */
export const listWatchArticlesInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
    topic: vine.enum(TOPICS).optional(),
    q: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(WATCH_ASSISTANT_LIMITS.queryMaxLength)
      .optional(),
    sinceDays: vine.number().withoutDecimals().min(1).max(WATCH_LIMITS.retentionDays).optional(),
    untagged: vine.boolean().optional(),
    hidden: vine.boolean().optional(),
  }),
)

/**
 * `POST /admin/watch/sources`: a feed to read (`url`, `https` only) or a web search to run
 * (`search`: its words, stored as the source's `query`; a body field named `query` would read as
 * the query string in the typed client), one of the two, with optional tags of its own.
 */
export const createWatchSourceInput = vine.create(
  vine.object({
    url: vine
      .string()
      .trim()
      .maxLength(WATCH_LIMITS.urlMaxLength)
      .url({ protocols: ['https'], require_protocol: true })
      .optional()
      .requiredIfMissing('search'),
    search: vine
      .string()
      .trim()
      .minLength(3)
      .maxLength(WEB_SEARCH_LIMITS.queryMaxLength)
      .optional()
      .requiredIfMissing('url'),
    topics: topics().optional(),
  }),
)

/** `PATCH /admin/watch/sources/:id`: read it at the next run or not, and its tags. */
export const updateWatchSourceInput = vine.create(
  vine.object({
    enabled: vine.boolean().optional(),
    topics: topics().optional(),
  }),
)

/**
 * `PATCH /admin/watch/articles/:id`: hide or show it again, and its tags as the admin sets them,
 * the main one first (the tagger learns from it), or `null` to give them back to the tagger.
 */
export const updateWatchArticleInput = vine.create(
  vine.object({
    hidden: vine.boolean().optional(),
    topics: topics().minLength(1).nullable().optional(),
  }),
)

/** `POST /admin/watch/blocked-sites`: a host whose articles are never taken in again. */
export const blockWatchSiteInput = vine.create(
  vine.object({
    host: vine.string().trim().toLowerCase().regex(HOST),
  }),
)
