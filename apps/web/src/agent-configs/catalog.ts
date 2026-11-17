// The catalog as the screen reads it: its texts in the app's language, and the coding tools as
// options.
import * as React from 'react'

import { type Localized, TARGETS } from '@/lib/agent-configs'
import { useLocale, useT } from '@/lib/locale'

/** The catalog's text in the app's language. */
export function useLocalized() {
  const { locale } = useLocale()
  return React.useCallback((text: Localized) => text[locale], [locale])
}

/** The coding tools as checkbox cards, each saying which files it gets. */
export function useTargetOptions() {
  const t = useT()
  return TARGETS.map((target) => ({
    value: target,
    title: t.agents.targetNames[target],
    description: t.agents.targetFiles[target],
  }))
}
