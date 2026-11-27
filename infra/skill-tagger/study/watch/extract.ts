// Reads the feeds given as arguments with the watch's own parser and prints a sample of their
// items as JSON lines: { id, feed, title, excerpt }. Measurement only, never committed.
import { readFileSync } from 'node:fs'
import { parseFeed } from '#app/watch/services/feed-parse'

const PER_FEED = 8
let id = 0
for (const path of process.argv.slice(2)) {
  try {
    const feed = parseFeed(readFileSync(path, 'utf8'), 'https://example.com/')
    for (const item of feed.items.slice(0, PER_FEED)) {
      id += 1
      console.log(JSON.stringify({ id, feed: feed.title, title: item.title, excerpt: item.excerpt }))
    }
  } catch (error) {
    console.error(path, error instanceof Error ? error.message : error)
  }
}
