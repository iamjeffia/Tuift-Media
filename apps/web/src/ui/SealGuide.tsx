import type { CSSProperties } from 'react'
import { readSeal } from '../generated-avatar.js'
import { useI18n, type MessageKey, type MessageVars } from '../i18n/index.js'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'
const WHEEL_TICKS = ['a', 'm', 'z'] as const
const SYMMETRY_TEXT = {
  quad: 'onboarding.seal.quad',
  mirror: 'onboarding.seal.mirror',
  triple: 'onboarding.seal.triple',
} as const satisfies Record<string, MessageKey>

const SYMMETRY_CASES = [
  { symmetry: 'quad', counts: '3, 6, 9' },
  { symmetry: 'mirror', counts: '4, 7, 10' },
  { symmetry: 'triple', counts: '5, 8, 11' },
] as const

type AtStyle = CSSProperties & { '--at': number }
type InkStyle = CSSProperties & { '--ink': string }

function at(letter: string): AtStyle {
  return { '--at': ALPHABET.indexOf(letter) / (ALPHABET.length - 1) }
}

function ink(color: string): InkStyle {
  return { '--ink': color }
}

/** The colour wheel as a seal reads it: A at red, each letter 1/26 further round. */
const WHEEL: CSSProperties = {
  backgroundImage: `linear-gradient(90deg, ${Array.from({ length: 14 }, (_, stop) => {
    const share = stop / 13
    return `hsl(${Math.round((share * 25 * 360) / 26)} 28% 58%) ${(share * 100).toFixed(1)}%`
  }).join(', ')})`,
}

const BEAD_COUNT = 20

// Marks where the highlighted value sits in a translated sentence, so word order stays the
// translator's.
const SLOT = '\u0001'

/** A whole catalog sentence with `{value}` shown in the note's value style. */
function Valued(props: { message: MessageKey; value: string | number; vars?: MessageVars }) {
  const { t } = useI18n()
  const [before = '', after = ''] = t(props.message, { ...props.vars, value: SLOT }).split(SLOT)
  return (
    <>
      {before}
      <span className="seal-note__value">{props.value}</span>
      {after}
    </>
  )
}

/**
 * The "?" in the corner while a word is tried: a small coin of its own, rim
 * and beads around the question mark.
 */
export function SealGuideToggle(props: {
  open: boolean
  pinned: boolean
  notesId: string
  onHover: (hovering: boolean) => void
  onPin: (pinned: boolean) => void
}) {
  const { t } = useI18n()
  return (
    <button
      className="seal-guide"
      type="button"
      aria-label={t('onboarding.seal.toggle')}
      aria-expanded={props.open}
      aria-pressed={props.pinned}
      aria-controls={props.notesId}
      data-open={props.open || undefined}
      onPointerEnter={() => props.onHover(true)}
      onPointerLeave={() => props.onHover(false)}
      onFocus={() => props.onHover(true)}
      onBlur={() => props.onHover(false)}
      onClick={() => props.onPin(!props.pinned)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !props.open) return
        // Close the notes, not Settings.
        event.preventDefault()
        props.onHover(false)
        props.onPin(false)
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle className="seal-guide__rim" cx={12} cy={12} r={11.5} />
        {Array.from({ length: BEAD_COUNT }, (_, bead) => {
          const angle = (bead / BEAD_COUNT) * Math.PI * 2
          return (
            <circle
              key={bead}
              className="seal-guide__bead"
              cx={(12 + Math.sin(angle) * 9.4).toFixed(2)}
              cy={(12 - Math.cos(angle) * 9.4).toFixed(2)}
              r={0.55}
            />
          )
        })}
      </svg>
      <span className="seal-guide__mark" aria-hidden>
        ?
      </span>
    </button>
  )
}

/**
 * Four notes under the coin that read the struck word: what picked the
 * colour, the ground and the symmetry, and how the letters lay the tiles,
 * which the coin itself shows letter by letter.
 */
export function SealNotes(props: { id: string; word: string }) {
  const { t } = useI18n()
  const reading = readSeal(props.word)
  if (!reading) {
    return (
      <div className="seal-notes" id={props.id}>
        <p className="seal-note">{t('onboarding.seal.hashed')}</p>
      </div>
    )
  }
  const { avatar } = reading
  return (
    <div className="seal-notes" id={props.id}>
      <div className="seal-note">
        <p>
          <Valued message="onboarding.seal.colour" value={reading.colourLetter} />
        </p>
        <span className="seal-note__wheel" aria-hidden>
          <span className="seal-note__strip" style={WHEEL} />
          <span className="seal-note__pin" style={at(reading.colourLetter)} />
          {WHEEL_TICKS.map((letter) => (
            <span key={letter} className="seal-note__tick" style={at(letter)}>
              {letter}
            </span>
          ))}
        </span>
      </div>
      <div className="seal-note">
        <p>
          <Valued
            message="onboarding.seal.ground"
            value={reading.groundLetter}
            vars={{ tone: t(avatar.dark ? 'onboarding.seal.dark' : 'onboarding.seal.light') }}
          />
        </p>
        <p className="seal-note__rule">
          {t(avatar.dark ? 'onboarding.seal.endVowel' : 'onboarding.seal.endOther')}
        </p>
      </div>
      <div className="seal-note">
        <p>
          <Valued
            message="onboarding.seal.letters"
            value={reading.letters}
            vars={{ symmetry: t(SYMMETRY_TEXT[avatar.symmetry]) }}
          />
        </p>
        <p className="seal-note__rule seal-note__cases">
          {SYMMETRY_CASES.map(({ symmetry, counts }) => (
            <span key={symmetry} data-current={avatar.symmetry === symmetry || undefined}>
              {counts}: {t(SYMMETRY_TEXT[symmetry])}
            </span>
          ))}
        </p>
      </div>
      <div className="seal-note">
        <p>{t('onboarding.seal.tiles')}</p>
        <p className="seal-note__rule seal-note__key">
          <span>
            <i style={ink(avatar.inks[1])} />
            {t('onboarding.seal.vowels')}
          </span>
          <span>
            <i style={ink(avatar.inks[0])} />
            a–m
          </span>
          <span>
            <i data-gap />
            n–z
          </span>
        </p>
      </div>
    </div>
  )
}
