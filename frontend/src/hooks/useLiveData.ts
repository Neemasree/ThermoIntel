import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'
import type { ApiThermalEvent, ApiStatistics, ApiPipelineStatus } from '../types/api'

const POLL_INTERVAL_MS = 45_000

export type LiveDataStatus = 'loading' | 'live' | 'error' | 'empty'

export interface LiveData {
  events: ApiThermalEvent[]
  statistics: ApiStatistics | null
  pipelineStatus: ApiPipelineStatus | null
  status: LiveDataStatus
  error: string | null
  lastUpdatedAt: Date | null
  refresh: () => void
}

export function useLiveData(): LiveData {
  const [events,          setEvents         ] = useState<ApiThermalEvent[]>([])
  const [statistics,      setStatistics     ] = useState<ApiStatistics | null>(null)
  const [pipelineStatus,  setPipelineStatus ] = useState<ApiPipelineStatus | null>(null)
  const [status,          setStatus         ] = useState<LiveDataStatus>('loading')
  const [error,           setError          ] = useState<string | null>(null)
  const [lastUpdatedAt,   setLastUpdatedAt  ] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchAll = useCallback(async (signal: AbortSignal) => {
    try {
      // Fetch stats + pipeline first so we know total row count
      const [statsRes, pipelineRes] = await Promise.all([
        api.statistics(signal),
        api.pipelineStatus(signal),
      ])

      if (signal.aborted) return

      // Fetch global coverage: 4 regions × 2 time offsets = 8 slices × 500 = up to 4000 events
      // Two offsets per region ensures we get both recent AND spread-out detections
      const S = 500
      const week_ago = new Date(Date.now() - 7*86400000).toISOString().slice(0,10)
      const reqs = [
        // Global latest
        { limit: S, offset: 0 },
        { limit: S, offset: 500 },
        // Asia / India / Oceania  lon 60–150
        { limit: S, offset: 0,    date_from: week_ago, lon_min: 60,   lon_max: 150 },
        { limit: S, offset: 500,  date_from: week_ago, lon_min: 60,   lon_max: 150 },
        // Africa / Europe  lon -30–60
        { limit: S, offset: 0,    date_from: week_ago, lon_min: -30,  lon_max: 60  },
        { limit: S, offset: 500,  date_from: week_ago, lon_min: -30,  lon_max: 60  },
        // Americas  lon -180– -30
        { limit: S, offset: 0,    date_from: week_ago, lon_min: -180, lon_max: -30 },
        { limit: S, offset: 500,  date_from: week_ago, lon_min: -180, lon_max: -30 },
      ]
      const slices = await Promise.all(
        reqs.map(f => api.events(f, signal).catch(() => ({ events: [] as ApiThermalEvent[], total: 0, limit: S, offset: 0 })))
      )

      if (signal.aborted) return

      // Deduplicate across all slices
      const seenIds = new Set<string>()
      const incoming: ApiThermalEvent[] = []
      for (const slice of slices) {
        for (const e of (slice.events ?? [])) {
          const key = e.event_id ?? `${e.latitude},${e.longitude}`
          if (!seenIds.has(key)) {
            seenIds.add(key)
            incoming.push(e)
          }
        }
      }

      setEvents(prev => {
        const map = new Map(prev.map(e => [e.event_id ?? `${e.latitude},${e.longitude}`, e]))
        for (const e of incoming) map.set(e.event_id ?? `${e.latitude},${e.longitude}`, e)
        return Array.from(map.values()).sort((a, b) => {
          const dateA = a.acquisition_date ?? ''
          const dateB = b.acquisition_date ?? ''
          if (dateB !== dateA) return dateB.localeCompare(dateA)
          return (b.acquisition_time ?? 0) - (a.acquisition_time ?? 0)
        })
      })

      if (!(statsRes as ApiStatistics & { error?: string }).error)    setStatistics(statsRes)
      if ((pipelineRes as ApiPipelineStatus).status) setPipelineStatus(pipelineRes)

      setStatus(incoming.length === 0 ? 'empty' : 'live')
      setError(null)
      setLastUpdatedAt(new Date())
    } catch (err: unknown) {
      if (signal.aborted) return
      const msg = err instanceof Error ? err.message : String(err)
      setStatus('error')
      setError(msg)
    }
  }, [])

  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const controller = new AbortController()
    fetchAll(controller.signal)
  }, [fetchAll])

  useEffect(() => {
    let controller = new AbortController()
    const run = () => {
      controller = new AbortController()
      fetchAll(controller.signal).finally(() => {
        timerRef.current = setTimeout(run, POLL_INTERVAL_MS)
      })
    }
    run()
    return () => {
      controller.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [fetchAll])

  return { events, statistics, pipelineStatus, status, error, lastUpdatedAt, refresh }
}
