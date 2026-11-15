import { beforeEach } from 'vitest'
import { setLanguage } from './i18n/index.js'

// The app defaults to Portuguese, but the existing tests assert English text.
// Every test starts in English (without writing it to storage); a test that
// wants another language calls setLanguage itself.
;(globalThis as Record<string, unknown>)['__TUIFT_TEST_LANGUAGE__'] = 'en'
beforeEach(() => setLanguage('en', { persist: false }))
