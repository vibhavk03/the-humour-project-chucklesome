export const STUDY_RATING_FILTERS = [
  { minimum: 0, label: 'All studies' },
  { minimum: 1, label: 'Has ratings (1+)' },
  { minimum: 100, label: '100+ rating events' },
  { minimum: 1000, label: '1,000+ rating events' },
] as const

export function filterStudiesByRatingCount<T extends { id: number }>(
  studies: T[], counts: Record<number, number>, minimum: number
): T[] {
  if (minimum === 0) return studies
  // Missing counts are unknown, rather than zero.
  return studies.filter(study => counts[study.id] !== undefined && counts[study.id] >= minimum)
}
