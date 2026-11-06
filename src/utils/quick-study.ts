type FlavorSource = {
  meta?: Record<string, unknown> | null
  flavorId?: number | null
}

export function getImportedFlavorName(row: FlavorSource): string {
  const name = row.meta?.flavor_name
  if (typeof name === 'string' && name.trim()) return name.trim()
  return row.flavorId != null ? `flavor-${row.flavorId}` : 'unspecified-flavor'
}

export function buildQuickStudyName(
  rows: FlavorSource[],
  date: Date,
  timeZone: string
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const month = parts.find((part) => part.type === 'month')!.value
  const day = parts.find((part) => part.type === 'day')!.value
  const flavors = [...new Set(rows.map(getImportedFlavorName))]
  return `${month}-${day}-${rows.length}-captions-${flavors.join('-and-') || 'unspecified-flavor'}`
}
