import { readFileSync, writeFileSync } from 'node:fs'
import { slotTopics } from '../../../packages/catalog/src/topics.ts'
const rules = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const out = Object.fromEntries([...new Set(rules.map((r) => r.slot))].map((s) => [s, slotTopics(s)]))
writeFileSync(process.argv[3], JSON.stringify(out))
