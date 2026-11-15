import { useI18n } from '../i18n/index.js'
import type { ModelChoice } from '../model-catalog.js'
import { formatModelName } from './model-selector-utils.js'
import { SettingsRow } from './settings/SettingsLayout.js'
import '../styles/switch.css'

/**
 * All and None for a run of model rows. Each changes every row that differs
 * in one call, never row by row; the one that would change nothing is dimmed.
 * `name` completes "Show all … in model picker", e.g. "Grok models".
 */
export function ModelBulkActions(props: {
  name: string
  groupLabel: string
  choices: readonly ModelChoice[]
  hiddenModels: ReadonlySet<string>
  onModelsVisibilityChange: (keys: readonly string[], visible: boolean) => void
}) {
  const { t } = useI18n()
  const visibleCount = props.choices.filter((choice) => !props.hiddenModels.has(choice.key)).length
  const allVisible = visibleCount === props.choices.length
  const noneVisible = visibleCount === 0

  const setAllVisible = (visible: boolean) => {
    props.onModelsVisibilityChange(
      props.choices
        .filter((choice) => props.hiddenModels.has(choice.key) === visible)
        .map((choice) => choice.key),
      visible,
    )
  }

  return (
    <div className="model-visibility__bulk-actions" role="group" aria-label={props.groupLabel}>
      <button
        type="button"
        aria-label={t('settings.modelVisibility.showAll', { name: props.name })}
        disabled={allVisible}
        onClick={() => setAllVisible(true)}
      >
        {t('settings.modelVisibility.all')}
      </button>
      <button
        type="button"
        aria-label={t('settings.modelVisibility.hideAll', { name: props.name })}
        disabled={noneVisible}
        onClick={() => setAllVisible(false)}
      >
        {t('settings.modelVisibility.none')}
      </button>
    </div>
  )
}

/** One model as a leader row whose value is its picker switch; a hidden model's row is muted. */
export function ModelVisibilityRow(props: {
  choice: ModelChoice
  visible: boolean
  onModelVisibilityChange: (key: string, visible: boolean) => void
}) {
  const { t } = useI18n()
  const { choice, visible } = props
  const name = formatModelName(choice.model.displayName)
  return (
    <SettingsRow
      className="model-visibility__model"
      name={name}
      tone={visible ? undefined : 'muted'}
    >
      <button
        className={`switch${visible ? ' is-on' : ''}`}
        type="button"
        role="switch"
        aria-label={t('settings.modelVisibility.include', { name })}
        aria-checked={visible}
        onClick={() => props.onModelVisibilityChange(choice.key, !visible)}
      >
        <span className="switch__thumb" />
      </button>
    </SettingsRow>
  )
}
