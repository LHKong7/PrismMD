import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zh from './locales/zh.json'

const resources = {
  en: { translation: en },
  zh: { translation: zh },
}

export function initI18n(language?: string) {
  const detectedLang = language ?? navigator.language.startsWith('zh') ? 'zh' : 'en'

  i18n.use(initReactI18next).init({
    resources,
    lng: detectedLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })

  return i18n
}

export function changeLanguage(lang: string) {
  i18n.changeLanguage(lang)
}

export type SupportedLanguage = 'en' | 'zh'

export const LANGUAGES: { code: SupportedLanguage; name: string; nativeName: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '简体中文' },
]

export default i18n
