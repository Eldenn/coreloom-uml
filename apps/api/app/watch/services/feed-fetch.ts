import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { request } from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import { WATCH_DENIED_RANGES, WATCH_FETCH_LIMITS } from '#app/watch/constants/watch'

const denied = new BlockList()
for (const range of WATCH_DENIED_RANGES.ipv4) {
  const [address, prefix] = range.split('/')
  denied.addSubnet(address, Number(prefix), 'ipv4')
}
for (const range of WATCH_DENIED_RANGES.ipv6) {
  const [address, prefix] = range.split('/')
  denied.addSubnet(address, Number(prefix), 'ipv6')
}

/** Whether an address is one a feed may never be fetched from (`WATCH_DENIED_RANGES`). */
export function isDeniedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 0) return true
  return denied.check(address, family === 6 ? 'ipv6' : 'ipv4')
}

/**
 * Resolves a name and refuses it when any of its addresses is denied, so the connection only ever
 * goes to an address checked here (no second resolution to rebind).
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, family: options.family }, (error, addresses) => {
    if (error) return callback(error, '', 0)
    const list = addresses as LookupAddress[]
    if (list.length === 0 || list.some((entry) => isDeniedAddress(entry.address))) {
      return callback(new Error('The feed resolves to a denied address'), '', 0)
    }
    if (options.all)
      return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

export class FeedFetchError extends Error {}

/**
 * Fetches a feed for the watch run: `https` only, every address checked (`isDeniedAddress`, at
 * connect time), redirects followed by hand and checked again, cut at
 * `WATCH_FETCH_LIMITS.maxBytes` and given up after `timeoutMs`. Nothing is run. Resolved from the
 * container: tests swap it and never reach a network.
 */
export default class FeedFetcher {
  async fetch(url: string): Promise<string> {
    let current = new URL(url)
    for (let hop = 0; hop <= WATCH_FETCH_LIMITS.maxRedirects; hop++) {
      const answer = await this.#get(current)
      if (answer.redirect === undefined) return answer.body
      current = new URL(answer.redirect, current)
    }
    throw new FeedFetchError('Too many redirects')
  }

  #get(url: URL): Promise<{ redirect?: string; body: string }> {
    if (url.protocol !== 'https:') throw new FeedFetchError('Only https feeds are read')
    const host = url.hostname.replace(/^\[|\]$/g, '')
    if (isIP(host) && isDeniedAddress(host)) throw new FeedFetchError('Denied address')
    return new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          lookup: guardedLookup,
          timeout: WATCH_FETCH_LIMITS.timeoutMs,
          headers: {
            accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
            'user-agent': 'coreloom-uml-watch',
          },
        },
        (res) => {
          const status = res.statusCode ?? 0
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume()
            return resolve({ redirect: res.headers.location, body: '' })
          }
          if (status !== 200) {
            res.resume()
            return reject(new FeedFetchError(`The feed answered ${String(status)}`))
          }
          const chunks: Buffer[] = []
          let size = 0
          res.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > WATCH_FETCH_LIMITS.maxBytes) {
              req.destroy(new FeedFetchError('The feed is too large'))
              return
            }
            chunks.push(chunk)
          })
          res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8') }))
          res.on('error', reject)
        },
      )
      const deadline = setTimeout(
        () => req.destroy(new FeedFetchError('The feed took too long')),
        WATCH_FETCH_LIMITS.timeoutMs,
      )
      req.on('close', () => clearTimeout(deadline))
      req.on('timeout', () => req.destroy(new FeedFetchError('The feed took too long')))
      req.on('error', reject)
      req.end()
    })
  }
}
