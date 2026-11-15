import { describe, expect, it } from 'vitest'
import { en } from './en.js'
import { ptBR } from './pt-BR.js'

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('message catalogs', () => {
  // TypeScript already rejects a divergence in `pt-BR.ts`; this keeps it failing in CI
  // even if someone casts around the type, and names the offending keys.
  it('have exactly the same keys in English and Portuguese', () => {
    const english = Object.keys(en).sort()
    const portuguese = Object.keys(ptBR).sort()
    expect(portuguese.filter((key) => !(key in en))).toEqual([])
    expect(english.filter((key) => !(key in ptBR))).toEqual([])
  })

  it('use the same {placeholders} in both languages', () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(placeholders(ptBR[key]), key).toEqual(placeholders(en[key]))
    }
  })

  it('have no empty messages', () => {
    for (const [key, message] of [...Object.entries(en), ...Object.entries(ptBR)]) {
      expect(message.trim(), key).not.toBe('')
    }
  })

  it('give every plural key its _other form and a {count}', () => {
    for (const catalog of [en, ptBR] as Array<Record<string, string>>) {
      for (const key of Object.keys(catalog)) {
        const match = /^(.*)_(zero|one|two|few|many)$/.exec(key)
        if (match) expect(catalog[`${match[1]}_other`], key).toBeDefined()
        if (/_(zero|one|two|few|many|other)$/.test(key)) {
          expect(catalog[key], key).toContain('{count}')
        }
      }
    }
  })
})
