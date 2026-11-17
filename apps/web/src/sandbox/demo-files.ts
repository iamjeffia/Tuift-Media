import type { DemoChat, DemoFile } from './demo-data.js'

/**
 * Files for looking at the Files tab's viewers in the sandbox: a guide to render, source to
 * colour, media that the sandbox's own bridge generates, and two large ones to time
 * (`perf/`). The large ones are built here, once, rather than committed.
 */

const GUIDE = `# Prompt bar guide

How the **prompt bar** is put together, and why its focus ring is quiet.

## Contents

- The composer and its shelf
- Focus and keyboard use
- Where the tokens live: [focus-ring.css](apps/web/src/styles/focus-ring.css)

## Focus ring

The ring is an outline mixed from the accent, \`outline-offset: 1px\`, plus an inner hairline in \`--line-strong\`.

\`\`\`css
.composer:focus-within {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 1px;
}
\`\`\`

| Theme | Contrast | Passes |
| ----- | -------- | ------ |
| Dark  | 3.4:1    | yes    |
| Light | 4.1:1    | yes    |

> Keyboard users still need a visible ring. Lowering its strength is fine; removing it is not.

See also the notes in \`docs/notes.md\` and the component in \`apps/web/src/ui/Composer.tsx\`.
`

const SOURCE = `import { useState } from 'react'

type Props = { label: string; onSend: (text: string) => void }

/** The prompt bar's send button. */
export function SendButton({ label, onSend }: Props) {
  const [text, setText] = useState('')
  // A quiet ring: the accent at 55%, never removed.
  const ring = text.length > 0 ? 'var(--accent)' : 'transparent'
  return (
    <button
      type="button"
      style={{ outlineColor: ring }}
      onClick={() => {
        onSend(text)
        setText('')
      }}
    >
      {label}
    </button>
  )
}
`

function bigMarkdown(): string {
  const sections: string[] = ['# Release notes archive\n\n']
  for (let index = 0; index < 4_200; index += 1) {
    sections.push(
      `## Release ${index + 1}\n\nThis release changes **the composer** and *the sidebar*. See \`apps/web/src/ui/Composer.tsx\` and [the guide](docs/guide.md).\n\n- The prompt bar keeps its focus ring on every theme\n- Chats can be selected in bulk\n- File links open beside the chat\n\n\`\`\`ts\nconst release = ${index + 1}\nexport const notes = [release, 'composer', 'sidebar']\n\`\`\`\n\n`,
    )
  }
  return sections.join('')
}

function bigSource(): string {
  const lines: string[] = ['// Generated: a large source file to time the viewer.']
  for (let index = 0; index < 50_000; index += 1) {
    lines.push(
      index % 25 === 0
        ? `export function f${index}(x: string) { return x + '${index}' }`
        : `  const v${index} = { id: ${index}, tag: 'a' } // ${index}`,
    )
  }
  return lines.join('\n')
}

export const FILE_VIEWER_DEMO_FILES: DemoFile[] = [
  { path: 'docs/guide.md', content: GUIDE },
  { path: 'docs/notes.md', content: '# Notes\n\nA short note.\n' },
  { path: 'docs/brief.pdf', content: '', size: 184_320 },
  { path: 'apps/web/src/ui/SendButton.tsx', content: SOURCE },
  { path: 'media/frame.png', content: '', size: 412_000 },
  { path: 'media/large.png', content: '', size: 9_800_000 },
  { path: 'media/voice.wav', content: '', size: 264_644 },
  { path: 'media/clip.mp4', content: '', size: 6_300_000 },
  { path: 'perf/large.md', content: bigMarkdown() },
  { path: 'perf/large.ts', content: bigSource() },
]

/** A reply that cites files, to click through to the Files tab. */
export const FILE_LINK_DEMO_CHAT: DemoChat = {
  id: 'demo-file-links',
  title: 'Where the prompt bar guide lives',
  provider: 'claude-code',
  model: 'claude-opus-5-5',
  effort: 'high',
  approval: 'auto',
  turns: [
    {
      prompt: 'Where is the focus ring documented, and what did you touch?',
      agoMs: 30 * 60_000,
      durationMs: 18_000,
      items: [
        {
          type: 'message',
          role: 'assistant',
          phase: 'final_answer',
          text: 'The guide is [docs/guide.md](docs/guide.md); the styles are in `apps/web/src/styles/focus-ring.css` and the button in `apps/web/src/ui/SendButton.tsx`.\n\nFiles changed:\n\n- [docs/guide.md](docs/guide.md)\n- `media/frame.png`\n- `media/large.png`\n- `media/voice.wav`\n- `media/clip.mp4`\n- `docs/brief.pdf`\n- [the large archive](perf/large.md)\n- `perf/large.ts`',
        },
      ],
    },
  ],
}

/**
 * A video job that ends the way the owner wants: the reply names the files by path and the chat
 * shows them. `media/clip.mp4`, `media/frame.png`, `media/voice.wav` and `docs/brief.pdf` exist in
 * the demo project; `render/gone.mp4` does not, so it stays plain text.
 */
export const MEDIA_DELIVERY_DEMO_CHAT: DemoChat = {
  id: 'demo-media-delivery',
  title: 'Render the 15 second presentation',
  provider: 'claude-code',
  model: 'claude-opus-5-5',
  effort: 'high',
  approval: 'auto',
  turns: [
    {
      prompt: 'Render the 15 second presentation and send it here.',
      agoMs: 20 * 60_000,
      durationMs: 52_000,
      items: [
        {
          type: 'message',
          role: 'assistant',
          phase: 'final_answer',
          text: 'The 15 second presentation is rendered. It is below, so you can watch it without leaving the app.\n\nmedia/clip.mp4',
        },
      ],
    },
    {
      prompt: 'Add the cover image, the voice-over and the one-page brief.',
      agoMs: 10 * 60_000,
      durationMs: 31_000,
      items: [
        {
          type: 'message',
          role: 'assistant',
          phase: 'final_answer',
          text: 'Here are the three files:\n\n- Cover: `media/frame.png`\n- Voice-over: [voice.wav](media/voice.wav)\n- Brief: docs/brief.pdf',
        },
      ],
    },
    {
      prompt: 'Where did the alternative cut go?',
      agoMs: 4 * 60_000,
      durationMs: 9_000,
      items: [
        {
          type: 'message',
          role: 'assistant',
          phase: 'final_answer',
          text: 'I did not keep it: `render/gone.mp4` was a draft and the render folder was cleaned.',
        },
      ],
    },
  ],
}

/**
 * Prompts that were sent with files: a sound, a video, an image, a PDF, four of them at once, and
 * files that are gone or have no preview. The files are the demo project's (`media/`, `docs/`),
 * made in the page by the sandbox's own bridge, so nothing here is a real file.
 */
export const SENT_ATTACHMENTS_DEMO_CHAT: DemoChat = {
  id: 'demo-sent-attachments',
  title: 'Score the product teaser',
  provider: 'claude-code',
  model: 'claude-opus-5-5',
  effort: 'high',
  approval: 'auto',
  turns: [
    {
      prompt: 'Use this sound under the intro.',
      attachments: ['media/voice.wav'],
      agoMs: 60 * 60_000,
      durationMs: 14_000,
      items: [
        {
          type: 'message',
          role: 'assistant',
          phase: 'final_answer',
          text: 'Done: the sound sits under the first three seconds, with a one second fade in.',
        },
      ],
    },
    {
      prompt: 'Here is the cut so far.',
      attachments: ['media/clip.mp4'],
      agoMs: 50 * 60_000,
      durationMs: 12_000,
      items: [
        {
          type: 'message',
          role: 'assistant',
          phase: 'final_answer',
          text: 'Watched it. The second scene runs long; I would trim it by a second.',
        },
      ],
    },
    {
      prompt: 'Match the colours to this reference.',
      attachments: ['media/frame.png'],
      agoMs: 40 * 60_000,
      durationMs: 12_000,
      items: [
        {
          type: 'message',
          role: 'assistant',
          phase: 'final_answer',
          text: 'The reference is warmer than the cut. I pulled the highlights toward it.',
        },
      ],
    },
    {
      prompt: 'The brief for this one.',
      attachments: ['docs/brief.pdf'],
      agoMs: 30 * 60_000,
      durationMs: 12_000,
      items: [
        {
          type: 'message',
          role: 'assistant',
          phase: 'final_answer',
          text: 'Read it. Two points change the ending: the logo comes last, and the voice stays dry.',
        },
      ],
    },
    {
      prompt: 'Everything for the final pass.',
      attachments: ['media/voice.wav', 'media/clip.mp4', 'media/frame.png', 'docs/brief.pdf'],
      agoMs: 20 * 60_000,
      durationMs: 20_000,
      items: [
        {
          type: 'message',
          role: 'assistant',
          phase: 'final_answer',
          text: 'Got all four. Starting the final pass.',
        },
      ],
    },
    {
      prompt: 'And the old exports, in case they still help.',
      attachments: [
        'render/gone.wav',
        'render/gone.mp4',
        'exports/frames.zip',
        'exports/product-teaser-final-cut-v3-approved-with-captions-and-music-bed-and-alt-ending.zip',
      ],
      agoMs: 10 * 60_000,
      durationMs: 9_000,
      items: [
        {
          type: 'message',
          role: 'assistant',
          phase: 'final_answer',
          text: 'The two renders are no longer in the project, so I used the archive only.',
        },
      ],
    },
  ],
}
