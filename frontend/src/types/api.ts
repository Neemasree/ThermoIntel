// ============================================================
// THERMALWATCH — API TYPES
// Derived from the actual thermal_events PostgreSQL schema.
// No ML fields. No invented fields.
// ============================================================

export interface ApiThermalEvent {
  event_id: string | null
  latitude: number
  longitude: number
  frp: number | null
  brightness: number | null
  confidence: string | null       // MODIS: numeric string; VIIRS: 'l'|'n'|'h'
  acquisition_date: string | null // 'YYYY-MM-DD'
  acquisition_time: number | null // HHMM integer
  satellite: string | null
  instrument: string | null
  daynight: string | null         // 'D' | 'N'
  firms_source: string | null
  version: string | null
  // WorldCover enrichment
  worldcover_class_code: number | null
  worldcover_class_name: string | null
  worldcover_version: string | null
  worldcover_enriched_at: string | null
  worldcover_enrichment_status: string | null
  // OSM enrichment — distances in metres
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
  osm_enrichment_status: string | null
  osm_enriched_at: string | null
  osm_source_version: string | null
  // Operational
  firms_synced_at: string | null
  created_at: string | null
  last_error: string | null
}

export interface ApiEventsResponse {
  total: number
  limit: number
  offset: number
  events: ApiThermalEvent[]
  error?: string
}

export interface ApiLatestEventsResponse {
  events: ApiThermalEvent[]
  count: number
  error?: string
}

export interface ApiStatistics {
  total_detections: number
  detections_today: number
  detections_last_7d: number
  avg_frp: number | null
  max_frp: number | null
  avg_brightness: number | null
  by_satellite: Record<string, number>
  by_source: Record<string, number>
  by_daynight: Record<string, number>
  last_sync_at: string | null
  error?: string
}

export interface ApiFirmsStatus {
  total_records: number
  latest_acquisition_date: string | null
  latest_sync_at: string | null
  new_records_24h: number
  sources: Record<string, number>
}

export interface ApiWorldCoverStatus {
  enriched: number
  pending: number
  version: string
}

export interface ApiPipelineStatus {
  status: 'ok' | 'error'
  firms: ApiFirmsStatus | null
  worldcover: ApiWorldCoverStatus | null
  error?: string
}

export interface ApiHealth {
  status: string
  service: string
  database: string
}

export interface EventFilters {
  limit?: number
  offset?: number
  date_from?: string
  date_to?: string
  satellite?: string
  daynight?: string
  min_frp?: number
  firms_source?: string
}
