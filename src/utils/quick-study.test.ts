import { describe, expect, it } from 'vitest'
import { buildQuickStudyName, getImportedFlavorName } from './quick-study'

const date = new Date('2026-01-03T01:00:00Z')
const timeZone = 'America/New_York'

describe('Quick Study names', () => {
  it('prefixes the local date before the selected caption count and complete imported flavor name', () => {
    const row = { meta: { flavor_name: 'multi-person-scene-SAD-GIRL' } }
    expect(buildQuickStudyName([row, row], date, timeZone)).toBe(
      '01-02-2-captions-multi-person-scene-SAD-GIRL'
    )
    expect(buildQuickStudyName([row], date, timeZone)).toBe(
      '01-02-1-captions-multi-person-scene-SAD-GIRL'
    )
  })

  it('includes each flavor once for mixed imports', () => {
    expect(
      buildQuickStudyName(
        [
          { meta: { flavor_name: 'dry-humor' } },
          { meta: { flavor_name: 'wordplay' } },
          { meta: { flavor_name: 'dry-humor' } },
        ],
        date,
        timeZone
      )
    ).toBe('01-02-3-captions-dry-humor-and-wordplay')
  })

  it('handles manual captions and missing or malformed flavor names', () => {
    expect(
      getImportedFlavorName({ flavorId: 42, meta: { flavor_name: 42 } })
    ).toBe('flavor-42')
    expect(buildQuickStudyName([{}], date, timeZone)).toBe(
      '01-02-1-captions-unspecified-flavor'
    )
    expect(buildQuickStudyName([], date, timeZone)).toBe(
      '01-02-0-captions-unspecified-flavor'
    )
  })
})
