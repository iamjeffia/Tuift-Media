import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { pickedAttachment, attachmentPreviewFromUrl } from './attachment-preview.js'
import { projectFilePreview, projectFilePreviewFromUrl } from './project-file-preview.js'

const secret = Buffer.from('project-file-preview-test-secret')

describe('project file previews', () => {
  it.each([
    ['logo.PNG', 'image', 'image/png'],
    ['reel.mp4', 'video', 'video/mp4'],
    ['voice.mp3', 'audio', 'audio/mpeg'],
  ] as const)('signs a URL for %s', (name, mediaType, mimeType) => {
    const filePath = path.resolve('fixtures', name)
    const preview = projectFilePreview(filePath, secret)

    expect(preview?.mediaType).toBe(mediaType)
    expect(projectFilePreviewFromUrl(preview!.url, secret)).toEqual({
      path: filePath,
      mediaType,
      mimeType,
      variant: 'media',
    })
  })

  it('leaves any other type to the text reader', () => {
    expect(projectFilePreview(path.resolve('fixtures', 'app.ts'), secret)).toBeUndefined()
    expect(projectFilePreview(path.resolve('fixtures', 'brief.pdf'), secret)).toBeUndefined()
  })

  it('rejects a URL whose signed path was swapped or signed with another secret', () => {
    const first = projectFilePreview(path.resolve('fixtures', 'one.png'), secret)!.url
    const second = projectFilePreview(path.resolve('fixtures', 'two.png'), secret)!.url
    const swapped = `${first.slice(0, first.lastIndexOf('/') + 1)}${second.slice(second.lastIndexOf('/') + 1)}`

    expect(projectFilePreviewFromUrl(swapped, secret)).toBeUndefined()
    expect(projectFilePreviewFromUrl(first, Buffer.from('another secret'))).toBeUndefined()
    expect(projectFilePreviewFromUrl(`${first}?x=1`, secret)).toBeUndefined()
  })

  it('keeps picker URLs and project file URLs apart', () => {
    const filePath = path.resolve('fixtures', 'one.png')
    const picked = pickedAttachment(filePath, secret).previewUrl!
    const project = projectFilePreview(filePath, secret)!.url

    expect(projectFilePreviewFromUrl(picked, secret)).toBeUndefined()
    expect(attachmentPreviewFromUrl(project, secret)).toBeUndefined()
    expect(projectFilePreviewFromUrl(project.replace('//file/', '//preview/'), secret)).toBe(
      undefined,
    )
  })
})

describe('project file preview revisions', () => {
  it('lets the renderer add a number so a replaced file is fetched again', () => {
    const { url } = projectFilePreview(path.resolve('fixtures', 'frame.png'), secret)!
    expect(projectFilePreviewFromUrl(`${url}?v=3`, secret)).toMatchObject({ mediaType: 'image' })
    expect(projectFilePreviewFromUrl(`${url}?v=abc`, secret)).toBeUndefined()
    expect(projectFilePreviewFromUrl(`${url}?v=3&x=1`, secret)).toBeUndefined()
  })
})
