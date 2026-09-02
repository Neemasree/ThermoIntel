// Re-export all API types from the canonical single source
export type {
  ApiThermalEvent,
  ApiEventsResponse,
  ApiLatestEventsResponse,
  ApiStatistics,
  ApiPipelineStatus,
  ApiFirmsStatus,
  ApiWorldCoverStatus,
  ApiHealth,
  EventFilters,
} from './api'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'EXTREME'
