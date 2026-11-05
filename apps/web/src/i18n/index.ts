import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enAccount from './locales/en/account.json'
import enAuth from './locales/en/auth.json'
import enCommon from './locales/en/common.json'
import enNotes from './locales/en/notes.json'
import frAccount from './locales/fr/account.json'
import frAuth from './locales/fr/auth.json'
import frCommon from './locales/fr/common.json'
import frNotes from './locales/fr/notes.json'

/** Languages offered in the `<LanguageSwitcher>`. `en` is the source of truth. */
export const supportedLanguages = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
] as const

const STORAGE_KEY = 'coreloom-uml.lang'

type SupportedLanguageCode = (typeof supportedLanguages)[number]['code']

function isSupportedLanguageCode(value: string | null): value is SupportedLanguageCode {
  return supportedLanguages.some((l) => l.code === value)
}

function storedLanguage(): string {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isSupportedLanguageCode(value) ? value : 'en'
  } catch {
    return 'en'
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, auth: enAuth, account: enAccount, notes: enNotes },
    fr: { common: frCommon, auth: frAuth, account: frAccount, notes: frNotes },
  },
  lng: storedLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

document.documentElement.lang = i18n.language
i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    // Private mode / storage disabled — the choice just won't persist.
  }
  document.documentElement.lang = lng
})

export default i18n
