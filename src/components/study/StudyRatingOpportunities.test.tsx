import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/supabase/client', () => ({ supabase: null }))
import { buildStudyAnalytics, type ResultCaption, type StudyRating } from '@/services/study-results.service'
import StudyRatingOpportunities from './StudyRatingOpportunities'

const caption = (id: number): ResultCaption => ({ id, caption_id: `caption-${id}`, captions: null })
const vote: StudyRating = { id: 1, caption_id: 'caption-1', profile_id: 'rater', study_caption_mapping_id: 1,
  vote_value: 'funny', created_datetime_utc: '2026-11-13T12:00:00Z' }

describe('StudyRatingOpportunities', () => {
  it('labels potential opportunities as estimates and shows both Funny denominators', () => {
    const analytics = buildStudyAnalytics([caption(1), caption(2)], [vote], ['starter'])
    const html = renderToStaticMarkup(createElement(StudyRatingOpportunities, { analytics }))
    expect(html).toContain('Available captions')
    expect(html).toContain('Potential rating opportunities')
    expect(html).toContain('2 captions × 2 known participants · Estimate')
    expect(html).toContain('25.0%')
    expect(html).toContain('100.0%')
    expect(html).toContain('Potential unrated opportunities')
    expect(html).toContain('does not measure actual views')
  })

  it('explains unavailable participation data without showing a made-up percentage', () => {
    const analytics = buildStudyAnalytics([caption(1)], [vote], null)
    const html = renderToStaticMarkup(createElement(StudyRatingOpportunities, { analytics }))
    expect(html).toContain('Participation records could not be loaded')
    expect(html).toContain('Participant cohort unavailable')
    expect(html).not.toContain('Outcomes across potential opportunities')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('Infinity')
  })

  it('handles an unrated study with no known participants', () => {
    const html = renderToStaticMarkup(createElement(StudyRatingOpportunities, { analytics: buildStudyAnalytics([caption(1)], []) }))
    expect(html).toContain('No starters or raters are recorded yet')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('Infinity')
  })
})
