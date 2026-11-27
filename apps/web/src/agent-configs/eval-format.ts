// What the convention test screens share: numbers, money, dates and durations written for the
// reader's language, a held rule's name read from the catalog, and why a run ended, in words.
import * as React from 'react'

import { formatValue } from '@/components/ui/format'
import type { RulePack } from '@/lib/agent-configs'
import { durationParts, knownFailureReason } from '@/lib/convention-eval-results'
import { useCoreloomI18n } from '@/lib/i18n'
import { useLocale, type useT } from '@/lib/locale'
import { plainText } from '@/lib/ready-rules'

export type EvalMessages = ReturnType<typeof useT>['evals']

/** Numbers, money and dates written for the current language. */
export function useEvalFormat() {
  const { locale } = useCoreloomI18n()
  return React.useMemo(() => {
    const unit = (value: number, name: 'minute' | 'second') =>
      new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short' }).format(
        value,
      )
    return {
      usd: (value: number) =>
        formatValue(value, locale, {
          format: 'currency',
          currency: 'USD',
          maximumFractionDigits: 2,
        }),
      integer: (value: number) => formatValue(value, locale, { format: 'integer' }),
      // A plain date (`YYYY-MM-DD`) is read as UTC: written in UTC, it stays the same day.
      day: (date: string) =>
        new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
          new Date(date),
        ),
      dateTime: (date: string) =>
        new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(date),
        ),
      duration: (ms: number) => {
        const { minutes, seconds } = durationParts(ms)
        return minutes > 0
          ? `${unit(minutes, 'minute')} ${unit(seconds, 'second')}`
          : unit(seconds, 'second')
      },
    }
  }, [locale])
}

/** A held rule's name, read from the catalog; its slot and id when the catalog lacks it. */
export function useRuleTitle(packs: RulePack[]) {
  const { locale, t } = useLocale()
  return (rule: { slot: string; rule: string }) => {
    for (const pack of packs)
      for (const group of pack.groups) {
        if (group.slot !== rule.slot) continue
        const found = group.rules.find((item) => item.id === rule.rule)
        if (found)
          return t.evals.ruleTitle(
            plainText(group.label[locale]).replace(/\s*:$/, ''),
            plainText(found.title[locale]),
          )
      }
    return `${rule.slot} · ${rule.rule}`
  }
}

/** Why a run or a trial ended without its result, in words. */
export function failureText(t: EvalMessages, reason: string | null): string {
  const known = knownFailureReason(reason)
  return known ? t.reason[known] : t.reasonOther
}
