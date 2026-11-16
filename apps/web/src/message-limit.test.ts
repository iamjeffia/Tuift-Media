// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { setLanguage } from './i18n/index.js'
import { formatTextSize, serverErrorText, userMessageTooLongText } from './message-limit.js'
import { parseResponseFrame, ServerError } from './transport.js'

describe('formatTextSize', () => {
  it('counts in KB, rounded up so a size over the limit never reads as the limit', () => {
    expect(formatTextSize(256 * 1024)).toBe('256 KB')
    expect(formatTextSize(256 * 1024 + 1)).toBe('256.1 KB')
    expect(formatTextSize(3 * 1024 * 1024)).toBe('3 MB')
  })

  it('uses the decimal comma in Portuguese', () => {
    setLanguage('pt-BR', { persist: false })
    expect(formatTextSize(256 * 1024 + 1)).toBe('256,1 KB')
  })
})

describe('serverErrorText', () => {
  const refusal = new ServerError('This message is 300000 characters long.', 'chat.send.tooLong', {
    size: 300_000,
    limit: 262_144,
  })

  it('says a named refusal in the language of the screen', () => {
    expect(serverErrorText(refusal)).toBe(
      'This message is 293 KB; the limit is 256 KB. Attach it as a file instead.',
    )
    setLanguage('pt-BR', { persist: false })
    expect(serverErrorText(refusal)).toBe(
      'Esta mensagem tem 293 KB e o limite é 256 KB. Anexe o texto como arquivo.',
    )
    expect(userMessageTooLongText(300_000)).toBe(serverErrorText(refusal))
  })

  it('keeps the server words for an error with no key, an unknown key, or no error at all', () => {
    expect(serverErrorText(new Error('plain'))).toBe('plain')
    expect(serverErrorText(new ServerError('English words', 'no.such.key'))).toBe('English words')
    expect(serverErrorText('text')).toBe('text')
  })
})

describe('the wire', () => {
  it('keeps the key and the values a refusal names, and nothing else it was not given', () => {
    const frame = parseResponseFrame({
      id: '1',
      error: {
        code: 'bad_request',
        message: 'm',
        key: 'chat.send.tooLong',
        params: { size: 1, limit: 2 },
      },
    })

    expect(frame).toEqual({
      id: '1',
      error: { message: 'm', key: 'chat.send.tooLong', params: { size: 1, limit: 2 } },
    })
    expect(parseResponseFrame({ id: '2', error: { code: 'internal', message: 'm' } })).toEqual({
      id: '2',
      error: { message: 'm' },
    })
  })
})
