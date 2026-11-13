import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/supabase/client', () => ({ supabase: null }))
import { buildStudyAnalytics, type ResultCaption, type StudyRating } from '@/services/study-results.service'
import StudyFlavorBreakdown from './StudyFlavorBreakdown'

const caption: ResultCaption = {
  id: 1, caption_id: 'caption-1', captions: {
    content: 'Caption text', humor_flavor_id: null, humor_flavors: null,
    metadata: { flavor_name: 'Imported recipe', flavor_id: 1517 },
  },
}
const vote: StudyRating = {
  id: 1, caption_id: 'caption-1', study_caption_mapping_id: 1,
  profile_id: 'private-participant-id', vote_value: 'meh', created_datetime_utc: '2026-11-10T12:00:00Z',
}
const render = (captions: ResultCaption[], ratings: StudyRating[]) => renderToStaticMarkup(
  createElement(StudyFlavorBreakdown, { analytics: buildStudyAnalytics(captions, ratings) }),
)

describe('StudyFlavorBreakdown', () => {
  it('labels imported IDs as source IDs and renders a sparse rating distribution without a canonical link', () => {
    const html = render([caption], [vote])
    expect(html).toContain('Imported recipe')
    expect(html).toContain('Source 1517')
    expect(html).toContain('Imported label')
    expect(html).not.toContain('/humor-flavor/1517')
    expect(html).toContain('Funny')
    expect(html).toContain('Not funny')
    expect(html).not.toContain('Meh')
    expect(html).not.toContain('Very funny')
    expect(html).not.toContain('Not very funny')
    expect(html).not.toContain('private-participant-id')
    expect(html.indexOf('>Id</th>')).toBeLessThan(html.indexOf('>Humor flavor</th>'))
  })

  it('keeps an unrated Unknown group visible with a clear empty-feedback message', () => {
    const unknown = { ...caption, captions: { ...caption.captions!, metadata: null } }
    const html = render([unknown], [])
    expect(html).toContain('No flavor attribution is available')
    expect(html).toContain('No ratings yet')
    expect(html).toContain('Unknown')
    expect(html).not.toContain('NaN')
  })

  it('renders coverage and an empty composition state for a study with no captions', () => {
    const html = render([], [])
    expect(html).toContain('Attribution coverage')
    expect(html).toContain('No captions attached yet')
    expect(html).not.toContain('<table')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('Infinity')
  })
})
