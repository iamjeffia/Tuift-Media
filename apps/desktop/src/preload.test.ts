import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessBridge } from './preload.js'

const { exposeInMainWorld, getPathForFile, invoke, on, send, sendSync } = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  getPathForFile: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  send: vi.fn(),
  sendSync: vi.fn((channel: string) =>
    channel === 'harness:ownServerToken' ? 'dGhpcy1pcy1hLXRva2VuLWZvci10ZXN0cw' : undefined,
  ),
}))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, send, sendSync, on, removeListener: vi.fn() },
  webUtils: { getPathForFile },
}))

await import('./preload.js')
const api = exposeInMainWorld.mock.calls[0]![1] as HarnessBridge

describe('preload own-server token', () => {
  it('asks main once, before the page connects, and exposes the answer', () => {
    expect(sendSync).toHaveBeenCalledExactlyOnceWith('harness:ownServerToken')
    expect(api.ownServerToken).toBe('dGhpcy1pcy1hLXRva2VuLWZvci10ZXN0cw')
  })
})

describe('preload dropped files', () => {
  beforeEach(() => {
    getPathForFile.mockReset()
    invoke.mockReset()
    send.mockReset()
  })

  it('asks main to preview the native path of a dropped File', () => {
    const dropped = new File(['png'], 'photo.png')
    getPathForFile.mockImplementation((file: File) =>
      file === dropped ? 'C:\\Users\\Test\\photo.png' : '',
    )
    expect(api.droppedFilePath(dropped)).toBe('C:\\Users\\Test\\photo.png')
    expect(send).toHaveBeenCalledExactlyOnceWith(
      'harness:droppedFile',
      'C:\\Users\\Test\\photo.png',
    )
  })

  it('sends no grant for a File the page made or a path string it names', async () => {
    getPathForFile.mockReturnValue('')
    expect(api.droppedFilePath(new File(['png'], 'C:\\Users\\Test\\private.png'))).toBeUndefined()
    await api.previewViewedImage('C:\\Users\\Test\\private.png')
    expect(send).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledExactlyOnceWith(
      'harness:previewViewedImage',
      'C:\\Users\\Test\\private.png',
    )
  })
})

describe('preload delivered files', () => {
  beforeEach(() => {
    invoke.mockReset()
    send.mockReset()
  })

  it('asks main to resolve, copy, save and attach by path, and grants nothing itself', async () => {
    await api.resolveDeliveredFiles(['render/a.mp4'], ['C:\\site'])
    await api.copyDeliveredFile('C:\\site\\a.png', ['C:\\site'])
    await api.saveDeliveredFile('C:\\site\\a.mp4', ['C:\\site'])
    await api.attachDeliveredFile('C:\\site\\a.mp4', ['C:\\site'])
    expect(invoke.mock.calls).toEqual([
      ['harness:resolveDeliveredFiles', ['render/a.mp4'], ['C:\\site']],
      ['harness:copyDeliveredFile', 'C:\\site\\a.png', ['C:\\site']],
      ['harness:saveDeliveredFile', 'C:\\site\\a.mp4', ['C:\\site']],
      ['harness:attachDeliveredFile', 'C:\\site\\a.mp4', ['C:\\site']],
    ])
    expect(send).not.toHaveBeenCalled()
  })
})

describe('preload desk lifecycle', () => {
  beforeEach(() => {
    on.mockReset()
    send.mockReset()
  })

  const handlerFor = (channel: string) =>
    on.mock.calls.find(([name]) => name === channel)![1] as (...args: unknown[]) => void

  it('reports the open chat as the page names it', () => {
    api.reportActiveChat('chat-1')
    expect(send).toHaveBeenCalledExactlyOnceWith('harness:activeChat', 'chat-1')
  })

  it('answers an unload question with what the page says, and "not safe" when it throws', () => {
    let safe: () => boolean = () => true
    api.onUnloadProbe(() => safe())
    const ask = handlerFor('harness:unloadProbe')
    ask({}, 7)
    safe = () => {
      throw new Error('broken page')
    }
    ask({}, 8)
    ask({}, 'not-an-id')
    expect(send.mock.calls).toEqual([
      ['harness:unloadProbeAnswer', 7, true],
      ['harness:unloadProbeAnswer', 8, false],
    ])
  })

  it('passes on a shell notice that is plain text and drops anything else', () => {
    const listener = vi.fn()
    api.onShellNotice(listener)
    const deliver = handlerFor('harness:shellNotice')
    deliver({}, 'A line.')
    deliver({}, { text: 'A line.' })
    deliver({}, '')
    deliver({}, 'x'.repeat(501))
    expect(listener.mock.calls).toEqual([['A line.']])
  })
})
