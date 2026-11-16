/**
 * Codex runs every command through a login shell, so the label would start
 * with the same `/bin/zsh -lc` on every row. The command inside is what ran.
 */
export function commandLabel(command: string | undefined): string {
  const text = inlineActivityText(command)
  const wrapped = /^(?:\S*[\\/])?(?:ba|z)?sh(?:\.exe)? -l?c (['"])([\s\S]*)\1$/.exec(text)
  const inner = wrapped?.[2]?.trim() || powerShellCommand(text) || text
  // Claude Code starts many commands with `cd "<absolute project path>" &&`.
  // In a one-line row that path used up the width and the part that does the
  // work was cut off, so the label starts at the command after it. A relative
  // cd says where in the project the command runs, so it stays.
  return inner.replace(LEADING_ABSOLUTE_CD, '') || inner
}

/**
 * On Windows the same wrapper is PowerShell, joined into one shell-quoted
 * line: `"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command '<command>'`.
 * The quoted path filled the row and cut off the command after it.
 */
function powerShellCommand(text: string): string | undefined {
  const wrapped = POWERSHELL_WRAPPER.exec(text)
  if (!wrapped) return undefined
  const [, quote, payload = ''] = wrapped
  // A double-quoted payload escapes `"`, `\`, `$` and backticks with a backslash;
  // a single-quoted one closes, quotes and reopens around each `'` it contains.
  const inner =
    quote === '"' ? payload.replace(/\\(["\\$`])/g, '$1') : payload.replace(/'"'"'|'\\''/g, "'")
  return inner.trim() || undefined
}

const POWERSHELL_WRAPPER =
  /^(?:"[^"]*[\\/](?:pwsh|powershell)(?:\.exe)?"|(?:[^\s"]*[\\/])?(?:pwsh|powershell)(?:\.exe)?)(?:\s+-(?:NoProfile|NoLogo|NonInteractive))*\s+-(?:Command|c) (['"])([\s\S]*)\1$/i

const LEADING_ABSOLUTE_CD =
  /^cd(?:\s+\/d)?\s+(?:"(?:[a-z]:|[\\/~])[^"]*"|'(?:[a-z]:|[\\/~])[^']*'|(?:[a-z]:|[\\/~])[^\s;&|]*)\s*(?:&&|;)\s*/i

export function inlineActivityText(text: string | undefined): string {
  return text?.replace(/\s+/g, ' ').trim() ?? ''
}
