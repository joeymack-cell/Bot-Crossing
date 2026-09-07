/** Shared by the suits, legend, and task details; age means last recorded activity. */
export const RECENCY_BANDS = Object.freeze([
  { id: 'fresh', label: 'Under 1 hour', shortLabel: '<1h', maxAge: 3600000, color: 0x48d8c8, css: '#48d8c8' },
  { id: 'today', label: '1–24 hours', shortLabel: '1–24h', maxAge: 86400000, color: 0x61a8f5, css: '#61a8f5' },
  { id: 'week', label: '1–7 days', shortLabel: '1–7d', maxAge: 604800000, color: 0xb49bd8, css: '#b49bd8' },
  { id: 'older', label: 'Over 7 days', shortLabel: '7d+', maxAge: Infinity, color: 0x8a939c, css: '#8a939c' },
])
const UNKNOWN = { ...RECENCY_BANDS[3], id: 'unknown', label: 'Activity time unknown' }
export function recencyFor(thread, now = Date.now()) {
  const at = Number(thread?.lastActivityAt)
  if (!Number.isFinite(at) || at <= 0) return UNKNOWN
  const age = Math.max(0, now - at)
  return RECENCY_BANDS.find(band => age < band.maxAge)
}
