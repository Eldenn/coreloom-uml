import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from '@japa/runner'
import {
  RESEARCH_COMMAND_OUTPUT_MAX_BYTES,
  RESEARCH_PAGE_MAX_BYTES,
  researchTimeLeft,
} from '#app/research/constants/research'
import { FETCH_PAGE, RUN_COMMAND } from '#app/research/services/sandbox-commands'

/**
 * The two fixed command lines a sandbox runs, run here with this machine's bash and curl against
 * a local server: what they answer is what the API reads back from a sandbox.
 */

let server: Server
let origin = ''

function sh(line: string, env: Record<string, string>) {
  return new Promise<{ exitCode: number; stdout: string }>((resolve) => {
    execFile(
      '/bin/bash',
      ['-c', line],
      { env: { PATH: process.env.PATH ?? '', ...env }, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
        resolve({ exitCode: code, stdout })
      },
    )
  })
}

const fetchPage = (path: string) => sh(FETCH_PAGE, { PAGE_URL: `${origin}${path}` })
const run = (command: string) => sh(RUN_COMMAND, { RESEARCH_COMMAND: command })

test.group('sandbox command lines', (group) => {
  group.setup(async () => {
    server = createServer((request, response) => {
      const url = request.url ?? '/'
      if (url.startsWith('/missing')) {
        response.writeHead(404, { 'content-type': 'text/html' }).end('<html>Not here</html>')
      } else if (url.startsWith('/endless')) {
        // No Content-Length: only a cap on what is read stops it.
        response.writeHead(200, { 'content-type': 'text/html' })
        const chunk = 'x'.repeat(64 * 1024)
        const more = () => {
          while (response.write(chunk)) {
            /* keep writing until the socket pushes back */
          }
          response.once('drain', more)
        }
        response.on('close', () => response.removeAllListeners('drain'))
        more()
      } else if (url.startsWith('/to-file')) {
        response.writeHead(302, { location: 'file:///etc/passwd' }).end()
      } else {
        response.writeHead(200, { 'content-type': 'text/html' }).end(`<html>${url}</html>`)
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
    return () => {
      server.closeAllConnections()
      server.close()
    }
  })

  test('fetches a page', async ({ assert }) => {
    assert.deepEqual(await fetchPage('/guide'), { exitCode: 0, stdout: '<html>/guide</html>' })
  })

  test('fails on an HTTP error instead of answering its error page', async ({ assert }) => {
    const fetched = await fetchPage('/missing')

    assert.notEqual(fetched.exitCode, 0)
    assert.notInclude(fetched.stdout, 'Not here')
  })

  test('reads brackets and braces of a URL as they are', async ({ assert }) => {
    const fetched = await fetchPage('/list?filter[a]=b&page[1-3]={x,y}')

    assert.equal(fetched.exitCode, 0)
    assert.equal(fetched.stdout, '<html>/list?filter[a]=b&page[1-3]={x,y}</html>')
  })

  test('never follows a redirect out of http', async ({ assert }) => {
    const fetched = await fetchPage('/to-file')

    assert.notEqual(fetched.exitCode, 0)
    assert.notInclude(fetched.stdout, 'root:')
  })

  test('stops reading a page that never ends, and fails it', async ({ assert }) => {
    const fetched = await fetchPage('/endless')

    assert.notEqual(fetched.exitCode, 0)
    assert.isAtMost(fetched.stdout.length, RESEARCH_PAGE_MAX_BYTES)
  }).timeout(20_000)

  test('does not read the URL as shell', async ({ assert }) => {
    const fetched = await sh(FETCH_PAGE, { PAGE_URL: `${origin}/a"; echo INJECTED; echo "` })

    assert.notInclude(fetched.stdout, 'INJECTED\n')
  })

  test('runs a command and answers its output and exit code', async ({ assert }) => {
    assert.deepEqual(await run('echo out; echo err >&2'), { exitCode: 0, stdout: 'out\nerr\n' })
    assert.equal((await run('exit 3')).exitCode, 3)
  })

  test('caps the output of a command that never stops writing', async ({ assert }) => {
    const outcome = await run('yes')

    assert.isAtMost(outcome.stdout.length, RESEARCH_COMMAND_OUTPUT_MAX_BYTES)
    assert.isAbove(outcome.stdout.length, 0)
  }).timeout(20_000)
})

test.group('researchTimeLeft', () => {
  test('gives the loop what is left of the budget', ({ assert }) => {
    assert.equal(researchTimeLeft(0), 75_000)
    assert.equal(researchTimeLeft(20_000), 55_000)
  })

  test('gives nothing when too little is left to read a page', ({ assert }) => {
    assert.isNull(researchTimeLeft(70_000))
    assert.isNull(researchTimeLeft(120_000))
  })
})
