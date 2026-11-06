import { describe, expect, it } from 'vitest'
import { filterStudiesByRatingCount } from './study-rating-filter'

const studies = [0, 1, 99, 100, 999, 1000].map(count => ({ id: count + 1, name: `Study with ${count} events` }))
const counts = Object.fromEntries(studies.map(study => [study.id, study.id - 1]))

describe('study rating filter', () => {
  it('keeps sparse and unrated studies accessible with All studies', () => {
    expect(filterStudiesByRatingCount(studies, counts, 0)).toEqual(studies)
    expect(filterStudiesByRatingCount(studies, {}, 0)).toEqual(studies)
  })

  it('includes a study with just one event under Has ratings', () => {
    expect(filterStudiesByRatingCount(studies, counts, 1).map(study => study.id)).toEqual([2, 100, 101, 1000, 1001])
  })

  it('includes exact threshold boundaries without changing the study order', () => {
    expect(filterStudiesByRatingCount(studies, counts, 100).map(study => study.id)).toEqual([101, 1000, 1001])
    expect(filterStudiesByRatingCount(studies, counts, 1000).map(study => study.id)).toEqual([1001])
  })

  it('does not mistake an unknown count for observed feedback', () => {
    expect(filterStudiesByRatingCount(studies, {}, 1)).toEqual([])
    expect(filterStudiesByRatingCount([], counts, 0)).toEqual([])
  })
})
