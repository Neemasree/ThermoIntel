import type {
  ApiEventsResponse,
  ApiLatestEventsResponse,
  ApiStatistics,
  ApiPipelineStatus,
  ApiHealth,
  ApiPrediction,
  EventFilters,
} from '../types/api'

export interface ApiShapExplanation {
  event_id: string | null
  predicted_class: string
  top_features: { feature: string; shap_value: number }[]
  all_features: { feature: string; shap_value: number }[]
  status: string
}

export interface ApiEventFeatures {
  db_id: number
  event_id: string | null
  acquisition_date: string | null
  acquisition_time: number | null
  latitude: number
  longitude: number
  satellite: string | null
  instrument: string | null
  firms_source: string | null
  // Thermal
  brightness: number | null
  frp: number | null
  confidence: string | null
  daynight: string | null
  scan: number | null
  track: number | null
  bright_ti4: number | null
  bright_ti5: number | null
  bright_t31: number | null
  // OSM distances (km)
  distance_to_industrial: number | null
  distance_to_refinery: number | null
  distance_to_powerplant: number | null
  distance_to_mine: number | null
  distance_to_gas_facility: number | null
  distance_to_road: number | null
  near_industrial_facility: boolean | null
  near_refinery: boolean | null
  near_powerplant: boolean | null
  near_mine: boolean | null
  near_gas_facility: boolean | null
  // WorldCover pct
  wc_forest_pct: number | null
  wc_shrubland_pct: number | null
  wc_grassland_pct: number | null
  wc_cropland_pct: number | null
  wc_builtup_pct: number | null
  wc_water_pct: number | null
  wc_other_pct: number | null
  wc_nodata_pct: number | null
  wc_sample_pixels: number | null
  wc_sample_radius_km: number | null
  worldcover_class_code: number | null
  worldcover_class_name: string | null
  worldcover_version: string | null
  // Temporal
  detections_7d: number | null
  detections_30d: number | null
  detections_90d: number | null
  mean_frp_30d: number | null
  max_frp_30d: number | null
  mean_brightness_30d: number | null
  days_active_30d: number | null
  persistence_score: number | null
  // Anomaly
  frp_deviation: number | null
  frp_ratio: number | null
  brightness_deviation: number | null
  brightness_ratio: number | null
  // Status
  osm_enrichment_status: string | null
  worldcover_enrichment_status: string | null
  firms_synced_at: string | null
  created_at: string | null
}

export interface ApiFeatureCompleteness {
  total_events: number
  features: Record<string, { populated: number; null: number; pct: number }>
  summary: {
    osm_enriched: number
    osm_pending: number
    osm_error: number
    wc_enriched: number
    wc_pending: number
    temporal_computed: number
    temporal_pending: number
    fully_ml_ready: number
  }
}

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status} \u2014 ${path}`)
  return res.json() as Promise<T>
}

function buildQuery(filters: EventFilters & { lat_min?: number; lat_max?: number; lon_min?: number; lon_max?: number }): string {
  const p = new URLSearchParams()
  if (filters.limit    != null) p.set('limit',        String(filters.limit))
  if (filters.offset   != null) p.set('offset',       String(filters.offset))
  if (filters.date_from)        p.set('date_from',    filters.date_from)
  if (filters.date_to)          p.set('date_to',      filters.date_to)
  if (filters.satellite)        p.set('satellite',    filters.satellite)
  if (filters.daynight)         p.set('daynight',     filters.daynight)
  if (filters.min_frp  != null) p.set('min_frp',      String(filters.min_frp))
  if (filters.firms_source)     p.set('firms_source', filters.firms_source)
  if (filters.lat_min  != null) p.set('lat_min',      String(filters.lat_min))
  if (filters.lat_max  != null) p.set('lat_max',      String(filters.lat_max))
  if (filters.lon_min  != null) p.set('lon_min',      String(filters.lon_min))
  if (filters.lon_max  != null) p.set('lon_max',      String(filters.lon_max))
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

export const api = {
  health: (signal?: AbortSignal) =>
    get<ApiHealth>('/health', signal),

  pipelineStatus: (signal?: AbortSignal) =>
    get<ApiPipelineStatus>('/pipeline-status', signal),

  statistics: (signal?: AbortSignal) =>
    get<ApiStatistics>('/statistics', signal),

  events: (filters: EventFilters & { lat_min?: number; lat_max?: number; lon_min?: number; lon_max?: number } = {}, signal?: AbortSignal) =>
    get<ApiEventsResponse>(`/events${buildQuery(filters)}`, signal),

  latestEvents: (limit = 200, signal?: AbortSignal) =>
    get<ApiLatestEventsResponse>(`/latest-events?limit=${limit}`, signal),

  eventById: (dbId: number, signal?: AbortSignal) =>
    get<ApiEventFeatures>(`/events/${dbId}`, signal),

  eventFeatures: (dbId: number, signal?: AbortSignal) =>
    get<ApiEventFeatures>(`/events/${dbId}/features`, signal),

  featureCompleteness: (signal?: AbortSignal) =>
    get<ApiFeatureCompleteness>('/feature-completeness', signal),

  predict: (dbId: number, signal?: AbortSignal) =>
    get<ApiPrediction>(`/events/${dbId}/predict`, signal),

  explain: (dbId: number, signal?: AbortSignal) =>
    get<ApiShapExplanation>(`/events/${dbId}/explain`, signal),
}
