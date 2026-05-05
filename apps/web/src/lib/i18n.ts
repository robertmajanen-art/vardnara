'use client'

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import sv from '../../../../packages/locales/sv.json'

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: 'sv',
    fallbackLng: 'sv',
    resources: { sv: { translation: sv } },
    interpolation: { escapeValue: false },
  })
}

export default i18n
