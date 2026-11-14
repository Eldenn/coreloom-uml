import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

/**
 * One ESM file with a shebang, run by `npx @coreloom-uml/cli`. `@coreloom-uml/catalog` and
 * `@coreloom-uml/codemap` are private TypeScript source, so they are bundled in (with zod); the published dependencies stay external.
 */
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  clean: true,
  minify: false,
  treeshake: true,
  sourcemap: false,
  noExternal: ['@coreloom-uml/catalog', '@coreloom-uml/codemap', 'zod'],
  define: { __CLI_VERSION__: JSON.stringify(version) },
  banner: { js: '#!/usr/bin/env node' },
})
