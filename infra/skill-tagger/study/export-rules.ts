import { writeFileSync } from 'node:fs'
import { RULE_PACKS } from '../../../packages/catalog/src/index.ts'
const rows = []
for (const pack of RULE_PACKS) for (const group of pack.groups) for (const rule of group.rules) {
  rows.push({ pack: pack.id, slot: group.slot, rule: rule.id, group: group.label.en, label: rule.label?.en ?? null, lines: rule.lines })
}
writeFileSync(process.argv[2], JSON.stringify(rows, null, 1))
console.log(rows.length, 'rules')
