import type {
  ApiEventsResponse,
  ApiLatestEventsResponse,
  ApiStatistics,
  ApiPipelineStatus,
  ApiHealth,
  EventFilters,
} from '../types/api'

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${path}`)
  return res.json() as Promise<T>
}

function buildQuery(filters: EventFilters): string {
  const p = new URLSearchParams()
  if (filters.limit    != null) p.set('limit',        String(filters.limit))
  if (filters.offset   != null) p.set('offset',       String(filters.offset))
  if (filters.date_from)        p.set('date_from',    filters.date_from)
  if (filters.date_to)          p.set('date_to',      filters.date_to)
  if (filters.satellite)        p.set('satellite',    filters.satellite)
  if (filters.daynight)         p.set('daynight',     filters.daynight)
  if (filters.min_frp  != null) p.set('min_frp',      String(filters.min_frp))
  if (filters.firms_source)     p.set('firms_source', filters.firms_source)
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

export const api = {
  health:         (signal?: AbortSignal) =>
    get<ApiHealth>('/health', signal),

  pipelineStatus: (signal?: AbortSignal) =>
    get<ApiPipelineStatus>('/pipeline-status', signal),

  statistics:     (signal?: AbortSignal) =>
    get<ApiStatistics>('/statistics', signal),

  events:         (filters: EventFilters = {}, signal?: AbortSignal) =>
    get<ApiEventsResponse>(`/events${buildQuery(filters)}`, signal),

  latestEvents:   (limit = 200, signal?: AbortSignal) =>
    get<ApiLatestEventsResponse>(`/latest-events?limit=${limit}`, signal),
}
