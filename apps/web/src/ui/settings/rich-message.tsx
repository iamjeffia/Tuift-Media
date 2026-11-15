import type { ReactNode } from 'react'

/**
 * A catalog sentence with one value set in bold (`<b>` or `<strong>`). The sentence stays whole
 * for the translator: `render` builds it with a marker where the value goes, and the value takes
 * the marker's place.
 */
export function withStrong(
  render: (value: string) => string,
  value: string,
  Tag: 'b' | 'strong' = 'strong',
): ReactNode {
  const marker = '\u0001'
  const [head = '', tail = ''] = render(marker).split(marker)
  return (
    <>
      {head}
      <Tag>{value}</Tag>
      {tail}
    </>
  )
}
