import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

/**
 * One ESM file with a shebang, run by `npx @coreloom-uml/cli`. `@coreloom-uml/catalog` is private
 * TypeScript source, so it is bundled in (with zod); the published dependencies stay external.
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
  noExternal: ['@coreloom-uml/catalog', 'zod'],
  define: { __CLI_VERSION__: JSON.stringify(version) },
  banner: { js: '#!/usr/bin/env node' },
})
