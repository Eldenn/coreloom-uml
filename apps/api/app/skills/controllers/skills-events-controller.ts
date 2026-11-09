import { PassThrough } from 'node:stream'
import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { SKILLS_EVENTS_HEARTBEAT_MS } from '#app/skills/constants/skill'
import SkillsEvents from '#app/skills/services/skills-events'

/** How long a browser waits before reconnecting a dropped stream. */
const RETRY_MS = 10_000

/**
 * `GET /skills/events`: a Server-Sent Events stream that says when the skills catalog changed
 * (`event: catalog.refreshed` after a search run, `catalog.updated` after a block), so open
 * Skills screens reload their data. It carries no catalog data itself.
 */
export default class SkillsEventsController {
  async handle({ request, response }: HttpContext) {
    const events = await app.container.make(SkillsEvents)
    const stream = new PassThrough()

    stream.write(`retry: ${RETRY_MS}\n\n`)
    stream.write(': connected\n\n')
    const heartbeat = setInterval(() => stream.write(': heartbeat\n\n'), SKILLS_EVENTS_HEARTBEAT_MS)
    const stop = events.listen(
      (event) => stream.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
      () => stream.end(),
    )
    const close = () => {
      clearInterval(heartbeat)
      stop()
      stream.end()
    }
    request.request.once('close', close)
    stream.once('close', close)

    response.header('Content-Type', 'text/event-stream; charset=utf-8')
    response.header('Cache-Control', 'no-cache, no-transform')
    response.header('Connection', 'keep-alive')
    // Tells nginx-style proxies not to buffer the stream.
    response.header('X-Accel-Buffering', 'no')
    response.stream(stream)
  }
}
