import logger from '@adonisjs/core/services/logger'
import redis from '@adonisjs/redis/services/main'
import { DateTime } from 'luxon'
import { SKILLS_EVENTS_CHANNEL } from '#app/skills/constants/skill'
import type { SkillsCatalogEvent } from '#app/skills/validators/skills-output'

type Listener = (event: SkillsCatalogEvent) => void

const EVENT_TYPES: readonly SkillsCatalogEvent['type'][] = ['catalog.refreshed', 'catalog.updated']

/** A message read from the channel, or `null` when it isn't one of ours. */
export function parseCatalogEvent(message: string): SkillsCatalogEvent | null {
  try {
    const value: unknown = JSON.parse(message)
    if (typeof value !== 'object' || value === null) return null
    const { type, at } = value as Record<string, unknown>
    if (typeof at !== 'string' || !EVENT_TYPES.includes(type as SkillsCatalogEvent['type'])) {
      return null
    }
    return { type: type as SkillsCatalogEvent['type'], at }
  } catch {
    return null
  }
}

/**
 * Tells open Skills screens that the catalog changed. The search runs in the queue worker (or
 * `node ace skills:refresh`), a different process from the HTTP server holding the streams, so
 * events go through Redis pub/sub: `publish` from anywhere, `listen` in the server, which
 * subscribes once, on its first listener. A singleton in the container (`start/skills.ts`);
 * tests swap it for one that delivers in-process.
 */
export default class SkillsEvents {
  #listeners = new Map<Listener, () => void>()
  #subscribed = false

  /** Announces a change; a Redis failure is logged, never thrown at the run that changed it. */
  async publish(type: SkillsCatalogEvent['type']): Promise<void> {
    const event: SkillsCatalogEvent = { type, at: DateTime.now().toUTC().toISO() ?? '' }
    try {
      await this.send(JSON.stringify(event))
    } catch (error) {
      logger.warn({ err: error }, 'could not announce a skills catalog change')
    }
  }

  /**
   * Calls `listener` on every change until the returned function is called; `onClose` runs if
   * the server shuts down first.
   */
  listen(listener: Listener, onClose: () => void = () => {}): () => void {
    this.#listeners.set(listener, onClose)
    if (!this.#subscribed) {
      this.#subscribed = true
      this.subscribe((message) => {
        const event = parseCatalogEvent(message)
        if (event) this.deliver(event)
      })
    }
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** How many streams are open in this process. */
  get listenerCount(): number {
    return this.#listeners.size
  }

  /** Ends every open stream (the server is shutting down). */
  close() {
    const closers = [...this.#listeners.values()]
    this.#listeners.clear()
    for (const onClose of closers) onClose()
  }

  protected deliver(event: SkillsCatalogEvent) {
    for (const listener of this.#listeners.keys()) listener(event)
  }

  protected async send(message: string): Promise<void> {
    await redis.publish(SKILLS_EVENTS_CHANNEL, message)
  }

  protected subscribe(onMessage: (message: string) => void) {
    redis.subscribe(SKILLS_EVENTS_CHANNEL, onMessage)
  }
}
