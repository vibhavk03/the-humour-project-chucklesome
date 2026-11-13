import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/supabase/client', () => ({ supabase: null }))
import { buildStudyAnalytics, type ResultCaption, type StudyRating } from '@/services/study-results.service'
import StudyOverview from './StudyOverview'

const caption: ResultCaption = {
  id: 1, caption_id: 'caption-1', captions: { content: 'Caption', humor_flavor_id: null, humor_flavors: null },
}

describe('StudyOverview binary distribution', () => {
  it('renders Funny and Not funny with combined counts and percentages for historical values', () => {
    const values: StudyRating['vote_value'][] = ['didnt get it', 'not funny at all', 'not very funny', 'meh', 'funny', 'very funny']
    const analytics = buildStudyAnalytics([caption], values.map((value, index) => ({
      id: index + 1, caption_id: 'caption-1', study_caption_mapping_id: 1, profile_id: `participant-${index}`,
      vote_value: value, created_datetime_utc: '2026-11-13T12:00:00Z',
    })))
    const html = renderToStaticMarkup(createElement(StudyOverview, { analytics }))
    expect(html).toContain('Funny')
    expect(html).toContain('Not funny')
    expect(html).toContain('33.3%')
    expect(html).toContain('66.7%')
    for (const label of ['Didn’t get it', 'Not funny at all', 'Not very funny', 'Meh', 'Very funny']) {
      expect(html).not.toContain(label)
    }
  })

  it('shows both categories at zero when the study has no ratings', () => {
    const html = renderToStaticMarkup(createElement(StudyOverview, { analytics: buildStudyAnalytics([caption], []) }))
    expect(html).toContain('Not funny')
    expect(html).toContain('Funny')
    expect(html).toContain('No ratings yet')
    expect(html).not.toContain('NaN')
  })
})
