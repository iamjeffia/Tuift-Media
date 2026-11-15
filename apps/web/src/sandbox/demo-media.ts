type DemoMedia = { url: string; mediaType: 'image' | 'video' | 'audio' }

const cache = new Map<string, Promise<DemoMedia | undefined>>()

/** An image, a sound or a video for a demo file, made in the page so no binary is committed. */
export function demoMedia(path: string): Promise<DemoMedia | undefined> {
  const extension = path.split('.').at(-1)?.toLowerCase() ?? ''
  // `large.png` stands for a photo-sized image, to time how one opens.
  const key = path.includes('large') ? `large.${extension}` : extension
  let made = cache.get(key)
  if (!made) {
    made =
      extension === 'png' || extension === 'jpg' || extension === 'webp'
        ? image(path.includes('large'))
        : extension === 'wav' || extension === 'mp3'
          ? Promise.resolve(sound())
          : extension === 'mp4' || extension === 'webm'
            ? video()
            : Promise.resolve(undefined)
    cache.set(key, made)
  }
  return made
}

function paint(context: CanvasRenderingContext2D, width: number, height: number, t: number): void {
  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#1f3a5f')
  gradient.addColorStop(0.55, '#7a4e9c')
  gradient.addColorStop(1, '#e8905b')
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
  context.fillStyle = 'rgb(255 255 255 / 85%)'
  context.beginPath()
  context.arc(width * (0.25 + 0.5 * t), height * 0.55, height * 0.16, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = 'rgb(255 255 255 / 92%)'
  context.font = `600 ${Math.round(height / 9)}px sans-serif`
  context.fillText('Frame 0042', width * 0.06, height * 0.2)
}

async function image(large: boolean): Promise<DemoMedia> {
  const canvas = document.createElement('canvas')
  const width = large ? 6000 : 1600
  const height = large ? 4000 : 900
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  paint(context, width, height, 0.5)
  if (large) {
    // Speckle, so the PNG is a few megabytes to decode rather than a flat gradient.
    for (let dot = 0; dot < 60_000; dot += 1) {
      context.fillStyle = `hsl(${(dot * 37) % 360} 60% ${30 + ((dot * 13) % 50)}%)`
      context.fillRect((dot * 7919) % width, (dot * 104_729) % height, 6, 6)
    }
  }
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!)))
  return { url: URL.createObjectURL(blob), mediaType: 'image' }
}

function sound(): DemoMedia {
  const rate = 22_050
  const seconds = 6
  const samples = rate * seconds
  const buffer = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) =>
    [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples * 2, true)
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.sin((Math.PI * index) / samples)
    const tone = Math.sin((2 * Math.PI * (220 + 110 * Math.floor(index / rate)) * index) / rate)
    view.setInt16(44 + index * 2, tone * envelope * 9_000, true)
  }
  return {
    url: URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' })),
    mediaType: 'audio',
  }
}

async function video(): Promise<DemoMedia | undefined> {
  if (typeof MediaRecorder === 'undefined') return undefined
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 360
  const context = canvas.getContext('2d')!
  const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm' })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => chunks.push(event.data)
  const finished = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))
  recorder.start()
  const started = performance.now()
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = Math.min(1, (performance.now() - started) / 2_000)
      paint(context, 640, 360, t)
      if (t < 1) requestAnimationFrame(frame)
      else resolve()
    }
    frame()
  })
  recorder.stop()
  await finished
  return {
    url: URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })),
    mediaType: 'video',
  }
}
