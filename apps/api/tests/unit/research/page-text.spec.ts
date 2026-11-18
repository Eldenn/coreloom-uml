import { test } from '@japa/runner'
import { isWebUrl, pageFromHtml } from '#app/research/services/page-text'

const HTML = `<!doctype html>
<html><head><title> Our &amp; your conventions </title>
<style>body { color: red }</style>
<script>window.secret = "<p>not text</p>"</script></head>
<body>
<!-- a comment -->
<h1>Conventions</h1>
<p>Use pnpm &amp; never <b>npm</b>.</p>
<noscript>Enable JavaScript</noscript>
<svg><text>drawn</text></svg>
<a href="/guide">Guide</a>
<a href="https://other.example/page#top">Other</a>
<a href="/guide">Guide again</a>
<a href="javascript:alert(1)">No</a>
<a href="file:///etc/passwd">No</a>
<a href="mailto:a@b.example">No</a>
</body></html>`

test.group('pageFromHtml', () => {
  test('keeps the title, the text and the web links of a page', ({ assert }) => {
    const page = pageFromHtml(HTML, 'https://docs.example/start/')

    assert.equal(page.title, 'Our & your conventions')
    assert.include(page.text, 'Conventions')
    assert.include(page.text, 'Use pnpm & never npm.')
    assert.deepEqual(page.links, ['https://docs.example/guide', 'https://other.example/page#top'])
  })

  test('drops scripts, styles, comments and what is not text', ({ assert }) => {
    const { text } = pageFromHtml(HTML, 'https://docs.example/')

    for (const gone of ['secret', 'color: red', 'a comment', 'Enable JavaScript', 'drawn', '<']) {
      assert.notInclude(text, gone)
    }
    assert.notMatch(text, /\s{2,}/)
  })

  test('returns plain text as it is', ({ assert }) => {
    const page = pageFromHtml('# Rules\n\n- Use pnpm.', 'https://raw.example/AGENTS.md')

    assert.deepEqual(page, { title: null, text: '# Rules\n\n- Use pnpm.', links: [] })
  })

  test('keeps at most 100 links', ({ assert }) => {
    const many = Array.from({ length: 150 }, (_, n) => `<a href="/p${n}">x</a>`).join('')

    assert.lengthOf(pageFromHtml(`<html>${many}</html>`, 'https://docs.example/').links, 100)
  })

  test('reads a large hostile page in linear time', ({ assert }) => {
    const hostile = `<html>${'<a href="'.repeat(50_000)}${'<!--'.repeat(50_000)}${'<script'.repeat(50_000)}`
    const started = performance.now()

    pageFromHtml(hostile, 'https://docs.example/')

    assert.isBelow(performance.now() - started, 1000)
  })
})

test.group('isWebUrl', () => {
  test('accepts http and https only', ({ assert }) => {
    assert.isTrue(isWebUrl('https://example.com/a'))
    assert.isTrue(isWebUrl('http://example.com'))
    for (const refused of [
      'file:///etc/passwd',
      'ftp://example.com/x',
      'javascript:alert(1)',
      'not a url',
      '',
      '/relative',
    ]) {
      assert.isFalse(isWebUrl(refused), refused)
    }
  })
})
