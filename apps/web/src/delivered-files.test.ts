import { describe, expect, it } from 'vitest'
import { detectDeliveredPaths, MAX_DETECTED_PATHS } from './delivered-files.js'

const VIDEO = 'C:/Users/Ana/Vídeos de teste/projeto/render/apresentacao-15s.mp4'

describe('detectDeliveredPaths', () => {
  it('finds a path written as inline code', () => {
    expect(detectDeliveredPaths(`Arquivo: \`${VIDEO}\``)).toEqual([VIDEO])
    expect(detectDeliveredPaths('Pronto: `render/final.mp4`')).toEqual(['render/final.mp4'])
  })

  it('finds a path in a Markdown link, with the label ignored and escapes decoded', () => {
    expect(detectDeliveredPaths('[o vídeo](render/final.mp4)')).toEqual(['render/final.mp4'])
    expect(detectDeliveredPaths('[o vídeo](<C:/Meus vídeos/final.mp4>)')).toEqual([
      'C:/Meus vídeos/final.mp4',
    ])
    expect(detectDeliveredPaths('[x](C:/Meus%20v%C3%ADdeos/final.mp4)')).toEqual([
      'C:/Meus vídeos/final.mp4',
    ])
    expect(detectDeliveredPaths('[x](file:///C:/work/final.mp4)')).toEqual(['C:/work/final.mp4'])
  })

  it('finds a path on a line of its own, with a label, a bullet or bold marks', () => {
    expect(detectDeliveredPaths(`Arquivo: ${VIDEO}`)).toEqual([VIDEO])
    expect(detectDeliveredPaths(`${VIDEO}`)).toEqual([VIDEO])
    expect(detectDeliveredPaths('- **render/Meu vídeo final.mp4**')).toEqual([
      'render/Meu vídeo final.mp4',
    ])
    expect(detectDeliveredPaths('1. C:\\Users\\Ana Maria\\Vídeos\\festa.mov')).toEqual([
      'C:\\Users\\Ana Maria\\Vídeos\\festa.mov',
    ])
  })

  it('finds paths inside a sentence', () => {
    expect(detectDeliveredPaths('Salvei em render/final.mp4 e em ./capa.png, ok?')).toEqual([
      'render/final.mp4',
      './capa.png',
    ])
    expect(detectDeliveredPaths('O arquivo /home/ana/video.webm está pronto.')).toEqual([
      '/home/ana/video.webm',
    ])
    expect(detectDeliveredPaths('Veja C:\\Users\\Ana Maria\\a.mp3 agora')).toEqual([
      'C:\\Users\\Ana Maria\\a.mp3',
    ])
  })

  it('covers every kind of media and nothing else', () => {
    const text =
      'a.mp4 b.webm c.mov d.m4v e.png f.jpg g.jpeg h.webp i.gif j.mp3 k.wav l.m4a m.ogg n.pdf'
    expect(detectDeliveredPaths(text)).toEqual(text.split(' '))
    expect(detectDeliveredPaths('notes.md main.ts data.json archive.zip app.exe clip.mkv')).toEqual(
      [],
    )
    expect(detectDeliveredPaths('`render/final.mp4.txt` and video.mp4x')).toEqual([])
  })

  it('does not match a URL', () => {
    expect(detectDeliveredPaths('https://example.com/video.mp4')).toEqual([])
    expect(detectDeliveredPaths('[video](https://example.com/render/video.mp4)')).toEqual([])
    expect(detectDeliveredPaths('<https://example.com/video.mp4>')).toEqual([])
    expect(detectDeliveredPaths('`https://example.com/video.mp4`')).toEqual([])
    expect(detectDeliveredPaths('www.example.com/video.mp4')).toEqual([])
    expect(detectDeliveredPaths('![](https://example.com/a.png)')).toEqual([])
  })

  it('does not match a network path', () => {
    expect(detectDeliveredPaths('`\\\\server\\share\\video.mp4`')).toEqual([])
    expect(detectDeliveredPaths('[x](file://server/share/video.mp4)')).toEqual([])
    expect(detectDeliveredPaths('//server/share/video.mp4')).toEqual([])
  })

  it('does not match inside a fenced code block, however it is fenced', () => {
    const fenced = [
      '```bash',
      'ffmpeg -i input.mp4 render/out.mp4',
      'C:/work/out.mp4',
      '```',
      '',
      '~~~~',
      'render/other.mp4',
      '~~~~',
      '',
      '`render/real.mp4`',
    ].join('\n')
    expect(detectDeliveredPaths(fenced)).toEqual(['render/real.mp4'])
  })

  it('does not match a command in inline code, or an image link', () => {
    expect(detectDeliveredPaths('`ffmpeg -i in.mp4 out.mp4`')).toEqual([])
    expect(detectDeliveredPaths('`cp a.mp4 b.mp4`')).toEqual([])
    expect(detectDeliveredPaths('![capa](render/capa.png)')).toEqual([])
  })

  it('lists a path once, however many ways the message names it', () => {
    const text = `Arquivo: \`render/final.mp4\`\n\n[ver](render/final.mp4)\n\nrender\\final.mp4\n\nrender/final.mp4`
    expect(detectDeliveredPaths(text)).toEqual(['render/final.mp4'])
  })

  it('stops at the cap, ignores huge input and very long paths', () => {
    const many = Array.from({ length: 500 }, (_unused, index) => `render/clip-${index}.mp4`)
    expect(detectDeliveredPaths(many.join('\n'))).toHaveLength(MAX_DETECTED_PATHS)
    expect(detectDeliveredPaths(`\`${'a/'.repeat(600)}x.mp4\``)).toEqual([])
    expect(detectDeliveredPaths(`${'x '.repeat(5_000)}render/a.mp4`)).toEqual([])
    const started = performance.now()
    detectDeliveredPaths(`${'C:/'.repeat(600)} no extension here`)
    detectDeliveredPaths('a'.repeat(190_000))
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('returns nothing for text that names no file', () => {
    expect(detectDeliveredPaths('')).toEqual([])
    expect(detectDeliveredPaths('Feito. Veja o resultado no painel.')).toEqual([])
  })
})
