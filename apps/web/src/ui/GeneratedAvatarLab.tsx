import { useId, useMemo, useState } from 'react'
import { IconArrowsShuffle as Shuffle } from '@tabler/icons-react'
import {
  AVATAR_STYLES,
  DEFAULT_AVATAR_STYLE,
  generatedAvatar,
  type AvatarStyle,
  type GeneratedAvatar as Model,
} from '../generated-avatar.js'
import { t as tNow, tp as tpNow, useI18n, type MessageKey } from '../i18n/index.js'
import { GeneratedAvatar } from './GeneratedAvatar.js'

/** The three sizes the picture actually ships at: profile page, account menu, rail. */
const PREVIEW_SIZES = [
  { size: 88, label: 'settings.debug.avatarLab.sizeProfile' },
  { size: 32, label: 'settings.debug.avatarLab.sizeMenu' },
  { size: 18, label: 'settings.debug.avatarLab.sizeRail' },
] as const satisfies ReadonlyArray<{ size: number; label: MessageKey }>

const STYLE_LABELS = {
  mandala: 'Mandala',
  orb: 'Orb',
  marble: 'Marble',
} satisfies Record<AvatarStyle, string>

const SAMPLE_NAMES = [
  'Leon',
  'Bluedev',
  'octocat',
  'Ada Lovelace',
  'Grace Hopper',
  'Linus',
  'Margaret Hamilton',
  'Alan Turing',
] as const

const RANDOM_PARTS = [
  ['swift', 'quiet', 'amber', 'north', 'pixel', 'lunar', 'brisk', 'velvet'],
  ['fox', 'otter', 'heron', 'lynx', 'maple', 'comet', 'harbor', 'cedar'],
] as const

function randomName(): string {
  const pick = (words: readonly string[]) => words[Math.floor(Math.random() * words.length)]
  return `${pick(RANDOM_PARTS[0])} ${pick(RANDOM_PARTS[1])} ${Math.floor(Math.random() * 100)}`
}

export function avatarRecipe(avatar: Model): string {
  const tone = tNow('settings.debug.avatarLab.tone', {
    mode: tNow(avatar.dark ? 'settings.debug.avatarLab.dark' : 'settings.debug.avatarLab.light'),
    hue: avatar.hue,
  })
  switch (avatar.style) {
    case 'mandala':
      return `${STYLE_LABELS.mandala} · ${avatar.symmetry} · ${tone}`
    case 'orb':
      return `${STYLE_LABELS.orb} · ${avatar.angle}° · ${tone}`
    case 'marble':
      return `${STYLE_LABELS.marble} · ${tpNow('settings.debug.avatarLab.drops', avatar.drops.length)} · ${tone}`
  }
}

/**
 * Debug-only playground for the name-based avatar: type any name, switch
 * between the candidate styles, see the picture at every size it ships at,
 * and compare it against a fixed set of samples so form and color variety
 * can be judged at a glance.
 */
export function GeneratedAvatarLab(props: { initialName?: string | undefined }) {
  const { t } = useI18n()
  const [name, setName] = useState(props.initialName?.trim() || 'Local profile')
  const [style, setStyle] = useState<AvatarStyle>(DEFAULT_AVATAR_STYLE)
  const inputId = useId()
  const avatar = useMemo(() => generatedAvatar(name, style), [name, style])

  return (
    <div className="avatar-lab">
      <div className="avatar-lab__controls">
        <label className="avatar-lab__field" htmlFor={inputId}>
          <span>{t('settings.debug.avatarLab.name')}</span>
          <input
            className="set-input"
            id={inputId}
            type="text"
            maxLength={64}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button className="set-button" type="button" onClick={() => setName(randomName())}>
          <Shuffle size={14} aria-hidden />
          <span>{t('settings.debug.avatarLab.randomName')}</span>
        </button>
      </div>
      <div
        className="avatar-lab__styles"
        role="group"
        aria-label={t('settings.debug.avatarLab.styles')}
      >
        {AVATAR_STYLES.map((candidate) => (
          <button
            key={candidate}
            className={`avatar-lab__style${candidate === style ? ' is-active' : ''}`}
            type="button"
            aria-pressed={candidate === style}
            onClick={() => setStyle(candidate)}
          >
            <span className="avatar-lab__frame">
              <GeneratedAvatar name={name} style={candidate} />
            </span>
            <span>
              {STYLE_LABELS[candidate]}
              {candidate === DEFAULT_AVATAR_STYLE ? (
                <small> · {t('settings.debug.avatarLab.shipping')}</small>
              ) : null}
            </span>
          </button>
        ))}
      </div>
      <div className="avatar-lab__previews" aria-label={t('settings.debug.avatarLab.previews')}>
        {PREVIEW_SIZES.map((preview) => (
          <figure key={preview.size} className="avatar-lab__preview">
            <span
              className="avatar-lab__frame"
              style={{ width: preview.size, height: preview.size }}
            >
              <GeneratedAvatar name={name} style={style} />
            </span>
            <figcaption>
              {t('settings.debug.avatarLab.size', {
                label: t(preview.label),
                size: preview.size,
              })}
            </figcaption>
          </figure>
        ))}
        <p className="avatar-lab__meta">
          <code>{avatarRecipe(avatar)}</code>
        </p>
      </div>
      <ul className="avatar-lab__samples" aria-label={t('settings.debug.avatarLab.samples')}>
        {SAMPLE_NAMES.map((sample) => (
          <li key={sample}>
            <button
              className={`avatar-lab__sample${sample === name ? ' is-active' : ''}`}
              type="button"
              aria-pressed={sample === name}
              onClick={() => setName(sample)}
            >
              <span className="avatar-lab__frame">
                <GeneratedAvatar name={sample} style={style} />
              </span>
              <span>{sample}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
