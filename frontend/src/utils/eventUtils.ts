// Utilities for ApiThermalEvent display — no ML, no mock data

/** FRP colour thresholds (MW) — matches risk scale */
export function frpColor(frp: number | null): string {
  if (frp == null) return '#4E5F7A'
  if (frp > 1000)  return '#DC2626'
  if (frp > 500)   return '#EF4444'
  if (frp > 200)   return '#F97316'
  if (frp > 50)    return '#F59E0B'
  return '#10B981'
}

/** Leaflet CircleMarker radius scaled to FRP */
export function markerRadius(frp: number | null): number {
  if (frp == null) return 4
  if (frp > 2000)  return 12
  if (frp > 1000)  return 9
  if (frp > 500)   return 7
  if (frp > 100)   return 5
  return 4
}

/**
 * Format FIRMS acquisition_time integer (HHMM) → "HH:MM UTC"
 * e.g. 1842 → "18:42 UTC"
 */
export function formatAcqTime(t: number | null): string {
  if (t == null) return '—'
  const s = String(t).padStart(4, '0')
  return `${s.slice(0, 2)}:${s.slice(2)} UTC`
}

/**
 * Normalise FIRMS confidence for display.
 * MODIS: numeric string "0"–"100" → append %
 * VIIRS: 'l' | 'n' | 'h' → Low / Nominal / High
 */
export function confidenceLabel(c: string | null): string {
  if (c == null) return '—'
  const lower = c.toLowerCase().trim()
  if (lower === 'l') return 'Low'
  if (lower === 'n') return 'Nominal'
  if (lower === 'h') return 'High'
  const n = Number(c)
  if (!isNaN(n)) return `${n}%`
  return c
}

/** Short display label for an event — satellite + truncated ID */
export function eventLabel(satellite: string | null, eventId: string | null): string {
  if (!eventId) return satellite ?? 'Unknown'
  const shortId = eventId.length > 14 ? `${eventId.slice(0, 8)}…` : eventId
  return satellite ? `${satellite} · ${shortId}` : shortId
}

/** Format a UTC ISO timestamp to a readable local string */
export function formatIso(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  } catch {
    return iso
  }
}

/** Returns a terse FRP tier label */
export function frpTier(frp: number | null): string {
  if (frp == null) return 'Unknown'
  if (frp > 1000)  return 'Extreme'
  if (frp > 500)   return 'Critical'
  if (frp > 200)   return 'High'
  if (frp > 50)    return 'Moderate'
  return 'Low'
}
