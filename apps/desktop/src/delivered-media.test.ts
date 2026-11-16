import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { canCreateSymlinks } from '@harness/proc/symlink.test-support'
import {
  confineDeliveredFile,
  copyDeliveredFile,
  copyFileToWindowsClipboard,
  MAX_DELIVERED_CANDIDATES,
  resolveDeliveredFiles,
  saveDeliveredFileAs,
  type DeliveredScope,
} from './delivered-media.js'
import { PickedImagePaths } from './viewed-image-path.js'

const execFile = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile }))

const secret = Buffer.alloc(32, 7)
const canSymlink = canCreateSymlinks()
let base: string
let project: string
let pasted: string
let scope: DeliveredScope

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'delivered-'))
  project = path.join(base, 'Vídeos de teste')
  pasted = path.join(base, 'pasted-files')
  await mkdir(path.join(project, 'render'), { recursive: true })
  await mkdir(pasted)
  await writeFile(path.join(project, 'render', 'final.mp4'), 'video')
  await writeFile(path.join(project, 'render', 'Meu vídeo.mov'), 'video')
  await writeFile(path.join(project, 'capa.png'), 'png')
  await writeFile(path.join(project, 'notes.md'), 'notes')
  await writeFile(path.join(base, 'secret.mp4'), 'secret')
  await writeFile(path.join(pasted, 'pasted-1.png'), 'png')
  scope = { attachmentFolders: [pasted], grants: new PickedImagePaths() }
})

afterEach(async () => {
  execFile.mockReset()
  await rm(base, { recursive: true, force: true })
})

describe('confineDeliveredFile', () => {
  it('accepts an absolute or relative path to a media file inside the project', async () => {
    const final = path.join(project, 'render', 'final.mp4')
    await expect(confineDeliveredFile(final, [project], scope)).resolves.toBe(final)
    await expect(confineDeliveredFile('render/final.mp4', [project], scope)).resolves.toBe(final)
    await expect(confineDeliveredFile('.\\render\\final.mp4', [project], scope)).resolves.toBe(
      final,
    )
    await expect(confineDeliveredFile('render/Meu vídeo.mov', [project], scope)).resolves.toBe(
      path.join(project, 'render', 'Meu vídeo.mov'),
    )
  })

  it('accepts a FLAC sound the library fetched into the project', async () => {
    const sound = path.join(project, 'audio', 'clube', 'Cello Drone A minor.flac')
    await mkdir(path.dirname(sound), { recursive: true })
    await writeFile(sound, 'flac')
    await expect(confineDeliveredFile(sound, [project], scope)).resolves.toBe(sound)
  })

  it('refuses a path outside the project, however it is written', async () => {
    const outside = path.join(base, 'secret.mp4')
    for (const candidate of [
      outside,
      '../secret.mp4',
      'render/../../secret.mp4',
      `${project}/render/../../secret.mp4`,
    ]) {
      await expect(confineDeliveredFile(candidate, [project], scope)).resolves.toBeUndefined()
    }
  })

  it('refuses network paths, device names, stream suffixes and other unsafe text', async () => {
    for (const candidate of [
      '\\\\server\\share\\a.mp4',
      '//server/share/a.mp4',
      '\\\\.\\C:\\a.mp4',
      'render/NUL.mp4',
      'render/con.png',
      'render/COM1.wav',
      'render/final.mp4:stream.mp4',
      'render/final.mp4\0.mp4',
      'render/fin<al.mp4',
      `${'a/'.repeat(600)}x.mp4`,
      '',
    ]) {
      await expect(confineDeliveredFile(candidate, [project], scope)).resolves.toBeUndefined()
    }
    for (const value of [undefined, null, 42, {}, ['render/final.mp4']]) {
      await expect(confineDeliveredFile(value, [project], scope)).resolves.toBeUndefined()
    }
  })

  it('refuses a file kind that is not media, a missing file and a folder named like a file', async () => {
    await mkdir(path.join(project, 'folder.mp4'))
    for (const candidate of ['notes.md', 'render/missing.mp4', 'folder.mp4', 'render']) {
      await expect(confineDeliveredFile(candidate, [project], scope)).resolves.toBeUndefined()
    }
  })

  it('needs a root: no roots, or a root that is not a folder, resolves nothing', async () => {
    const final = path.join(project, 'render', 'final.mp4')
    await expect(confineDeliveredFile(final, [], scope)).resolves.toBeUndefined()
    await expect(confineDeliveredFile(final, 'not a list', scope)).resolves.toBeUndefined()
    await expect(confineDeliveredFile(final, [42, null], scope)).resolves.toBeUndefined()
    await expect(
      confineDeliveredFile(final, [path.join(base, 'elsewhere')], scope),
    ).resolves.toBeUndefined()
  })

  it.skipIf(!canSymlink)('refuses a link inside the project that points outside it', async () => {
    await symlink(path.join(base, 'secret.mp4'), path.join(project, 'render', 'link.mp4'))
    await expect(confineDeliveredFile('render/link.mp4', [project], scope)).resolves.toBeUndefined()
  })

  it('accepts what the person attached: the paste folder and a picked file', async () => {
    await expect(confineDeliveredFile('pasted-1.png', [], scope)).resolves.toBe(
      path.join(pasted, 'pasted-1.png'),
    )
    const picked = path.join(base, 'picked.png')
    await writeFile(picked, 'png')
    await scope.grants.authorize(picked)
    await expect(confineDeliveredFile(picked, [], scope)).resolves.toBe(picked)
    // Not picked, so not shown: a path the person never attached is not the app's to open.
    await expect(
      confineDeliveredFile(path.join(base, 'secret.mp4'), [], scope),
    ).resolves.toBeUndefined()
    await expect(confineDeliveredFile('../secret.mp4', [], scope)).resolves.toBeUndefined()
  })
})

describe('resolveDeliveredFiles', () => {
  it('answers name, size, kind and a signed URL, in the order the reply named them', async () => {
    const files = await resolveDeliveredFiles(
      ['capa.png', 'render/final.mp4', 'notes.md', 'render/missing.mp4', '../secret.mp4'],
      [project],
      scope,
      secret,
      'win32',
    )
    expect(files.map((file) => [file.name, file.size, file.mediaType, file.copyable])).toEqual([
      ['capa.png', 3, 'image', true],
      ['final.mp4', 5, 'video', true],
    ])
    expect(files[1]!.path).toBe(path.join(project, 'render', 'final.mp4'))
    expect(files[1]!.url).toMatch(/^tastecode-attachment:\/\/file\/[\w-]+\/[\w-]+$/)
  })

  it('lists a file once, and a non-image can only be copied where the system allows it', async () => {
    const files = await resolveDeliveredFiles(
      ['render/final.mp4', path.join(project, 'render', 'final.mp4'), 'render\\final.mp4'],
      [project],
      scope,
      secret,
      'darwin',
    )
    expect(files).toHaveLength(1)
    expect(files[0]!.copyable).toBe(false)
  })

  it('looks at no more than the cap, and ignores anything that is not a list', async () => {
    const many = Array.from({ length: MAX_DELIVERED_CANDIDATES + 5 }, () => 'render/final.mp4')
    expect(await resolveDeliveredFiles(many, [project], scope, secret)).toHaveLength(1)
    const late = [...Array.from({ length: MAX_DELIVERED_CANDIDATES }, () => 'nope.mp4'), 'capa.png']
    expect(await resolveDeliveredFiles(late, [project], scope, secret)).toEqual([])
    expect(await resolveDeliveredFiles('capa.png', [project], scope, secret)).toEqual([])
    expect(await resolveDeliveredFiles(undefined, [project], scope, secret)).toEqual([])
  })
})

describe('saveDeliveredFileAs', () => {
  it('copies the file where the person chooses, offering its own name', async () => {
    const source = path.join(project, 'render', 'final.mp4')
    const destination = path.join(base, 'Saved video.mp4')
    const choose = vi.fn(async () => destination)
    await expect(saveDeliveredFileAs(source, choose)).resolves.toBe(destination)
    expect(choose).toHaveBeenCalledWith('final.mp4')
    expect(await readFile(destination, 'utf8')).toBe('video')
    expect(await readFile(source, 'utf8')).toBe('video')
  })

  it('does nothing when the person cancels, and does not copy a file onto itself', async () => {
    const source = path.join(project, 'render', 'final.mp4')
    await expect(saveDeliveredFileAs(source, async () => undefined)).resolves.toBeUndefined()
    await expect(saveDeliveredFileAs(source, async () => source.toUpperCase())).resolves.toBe(
      source.toUpperCase(),
    )
    expect(await readFile(source, 'utf8')).toBe('video')
  })
})

describe('copyDeliveredFile', () => {
  it('puts an image on the clipboard as an image', async () => {
    const writeImage = vi.fn()
    const writeFileTool = vi.fn()
    await copyDeliveredFile(
      path.join(project, 'capa.png'),
      { writeImage, writeFile: writeFileTool },
      'darwin',
    )
    expect(writeImage).toHaveBeenCalledWith(path.join(project, 'capa.png'))
    expect(writeFileTool).not.toHaveBeenCalled()
  })

  it('puts any other file on the clipboard as a file on Windows, and refuses elsewhere', async () => {
    const writeImage = vi.fn()
    const writeFileTool = vi.fn(async () => undefined)
    const video = path.join(project, 'render', 'final.mp4')
    await copyDeliveredFile(video, { writeImage, writeFile: writeFileTool }, 'win32')
    expect(writeFileTool).toHaveBeenCalledWith(video)
    await expect(
      copyDeliveredFile(video, { writeImage, writeFile: writeFileTool }, 'linux'),
    ).rejects.toThrow()
    expect(writeImage).not.toHaveBeenCalled()
  })
})

describe('copyFileToWindowsClipboard', () => {
  it('hands the path over in the environment and never in the command text', async () => {
    execFile.mockImplementation((_command, _args, _options, done: (error: null) => void) =>
      done(null),
    )
    const file = 'C:\\Users\\Ana Maria\\Vídeos\\a "b".mp4'
    await copyFileToWindowsClipboard(file)
    const [command, args, options] = execFile.mock.calls[0]!
    expect(command).toBe('powershell.exe')
    expect(args.join(' ')).not.toContain('Ana Maria')
    expect(args.at(-1)).toBe('Set-Clipboard -LiteralPath $env:TUIFT_COPY_FILE')
    expect(options.env.TUIFT_COPY_FILE).toBe(file)
    expect(options.windowsHide).toBe(true)
  })

  it('reports a failure', async () => {
    execFile.mockImplementation((_command, _args, _options, done: (error: Error) => void) =>
      done(new Error('no clipboard')),
    )
    await expect(copyFileToWindowsClipboard('C:\\a.mp4')).rejects.toThrow('no clipboard')
  })
})
