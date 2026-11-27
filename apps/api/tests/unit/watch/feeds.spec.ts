import { test } from '@japa/runner'
import { WATCH_LIMITS } from '#app/watch/constants/watch'
import FeedFetcher, { isDeniedAddress } from '#app/watch/services/feed-fetch'
import { normalizeUrl, parseFeed, plainText } from '#app/watch/services/feed-parse'
import { isBlockedHost, keptItems } from '#app/watch/services/watch-refresh'

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Engineering &amp; AI</title>
    <item>
      <title>Testing agents &lt;for real&gt;</title>
      <link>https://blog.example.com/agents?utm_source=rss&amp;id=4#top</link>
      <pubDate>Tue, 24 Nov 2026 08:00:00 GMT</pubDate>
      <description><![CDATA[<p>How we <b>test</b> coding agents&nbsp;&amp; their tools.</p>]]></description>
    </item>
    <item>
      <title>No date</title>
      <link>https://blog.example.com/undated</link>
    </item>
    <item>
      <title>Dublin Core date</title>
      <link>javascript:alert(1)</link>
      <dc:date>2026-11-20T10:00:00Z</dc:date>
    </item>
  </channel>
</rss>`

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Security notes</title>
  <entry>
    <title type="html">Secrets in CI</title>
    <link rel="self" href="https://sec.example.org/feed/1"/>
    <link rel="alternate" href="/posts/secrets"/>
    <updated>2026-11-25T12:00:00Z</updated>
    <summary>Keep tokens out of logs.</summary>
  </entry>
</feed>`

test.group('Watch - feeds', () => {
  test('reads an RSS 2.0 feed: plain text, a clean link, the dates it gives', ({ assert }) => {
    const feed = parseFeed(RSS, 'https://blog.example.com/feed')
    assert.equal(feed.title, 'Engineering & AI')
    // The javascript: link is dropped; the undated item stays, without a date.
    assert.lengthOf(feed.items, 2)
    assert.deepEqual(feed.items[0], {
      title: 'Testing agents',
      url: 'https://blog.example.com/agents?id=4',
      publishedAt: new Date('2026-11-24T08:00:00Z'),
      excerpt: 'How we test coding agents & their tools.',
    })
    assert.isNull(feed.items[1].publishedAt)
  })

  test('reads an Atom feed by its alternate link, relative to the feed', ({ assert }) => {
    const feed = parseFeed(ATOM, 'https://sec.example.org/atom.xml')
    assert.equal(feed.title, 'Security notes')
    assert.deepEqual(feed.items, [
      {
        title: 'Secrets in CI',
        url: 'https://sec.example.org/posts/secrets',
        publishedAt: new Date('2026-11-25T12:00:00Z'),
        excerpt: 'Keep tokens out of logs.',
      },
    ])
  })

  test('refuses a document that declares entities, and one that is no feed', ({ assert }) => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;">]><rss><channel><title>&b;</title></channel></rss>`
    assert.throws(() => parseFeed(bomb, 'https://x.example'), /entities/)
    assert.throws(
      () => parseFeed('<html><body>hi</body></html>', 'https://x.example'),
      /Not an RSS/,
    )
  })

  test('cuts the text it keeps, and reads a hostile one in one pass', ({ assert }) => {
    assert.lengthOf(plainText('word '.repeat(1000), WATCH_LIMITS.excerptMaxLength), 500)
    const hostile = `${'<'.repeat(200_000)}${'&#'.repeat(200_000)}`
    const start = performance.now()
    plainText(hostile, WATCH_LIMITS.excerptMaxLength)
    assert.isBelow(performance.now() - start, 500)
  })

  test('keeps http(s) links without credentials, fragment or tracking', ({ assert }) => {
    assert.equal(
      normalizeUrl('https://a.example/p?utm_medium=x&fbclid=1&q=2#h')?.href,
      'https://a.example/p?q=2',
    )
    assert.isNull(normalizeUrl('ftp://a.example/file'))
    assert.isNull(normalizeUrl('https://user:pass@a.example/'))
    assert.isNull(normalizeUrl(`https://a.example/${'a'.repeat(WATCH_LIMITS.urlMaxLength)}`))
  })

  test('keeps dated items within the retention, on sites not blocked, once each', ({ assert }) => {
    const now = new Date('2026-11-27T00:00:00Z')
    const item = (url: string, publishedAt: Date | null) => ({
      title: 't',
      url,
      publishedAt,
      excerpt: '',
    })
    const kept = keptItems(
      [
        item('https://a.example/old', new Date('2026-08-01T00:00:00Z')),
        item('https://a.example/future', new Date('2026-12-01T00:00:00Z')),
        item('https://a.example/undated', null),
        item('https://ads.spam.example/x', new Date('2026-11-26T00:00:00Z')),
        item('https://a.example/new', new Date('2026-11-26T00:00:00Z')),
        item('https://a.example/new', new Date('2026-11-26T00:00:00Z')),
        item('https://a.example/newer', new Date('2026-11-26T12:00:00Z')),
      ],
      ['spam.example'],
      now,
    )
    assert.deepEqual(
      kept.map((entry) => entry.url),
      ['https://a.example/newer', 'https://a.example/new'],
    )
    assert.isTrue(isBlockedHost('spam.example', ['spam.example']))
    assert.isFalse(isBlockedHost('notspam.example', ['spam.example']))
  })

  test('never fetches from this machine, a private network or the metadata address', async ({
    assert,
  }) => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '169.254.169.254',
      '192.168.0.1',
      '::1',
      'fd00::1',
    ]) {
      assert.isTrue(isDeniedAddress(address), address)
    }
    assert.isFalse(isDeniedAddress('93.184.215.14'))
    const fetcher = new FeedFetcher()
    await assert.rejects(() => fetcher.fetch('https://127.0.0.1/feed'), /Denied address/)
    await assert.rejects(() => fetcher.fetch('https://[::1]/feed'), /Denied address/)
    await assert.rejects(() => fetcher.fetch('http://example.com/feed'), /Only https/)
    await assert.rejects(() => fetcher.fetch('https://localhost/feed'), /denied address/)
  })
})
