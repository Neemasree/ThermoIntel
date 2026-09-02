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
  const [events, setEvents]               = useState<ApiThermalEvent[]>([])
  const [statistics, setStatistics]       = useState<ApiStatistics | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<ApiPipelineStatus | null>(null)
  const [status, setStatus]               = useState<LiveDataStatus>('loading')
  const [error, setError]                 = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchAll = useCallback(async (signal: AbortSignal) => {
    try {
      const [eventsRes, statsRes, pipelineRes] = await Promise.all([
        // Use /events with limit=2000 sorted by acquisition_date DESC
        // This gives global geographic spread rather than 500 events
        // all from the same recently-ingested region.
        api.events({ limit: 2000 }, signal),
        api.statistics(signal),
        api.pipelineStatus(signal),
      ])

      if (signal.aborted) return

      if (eventsRes.error) throw new Error(eventsRes.error)

      const incoming = eventsRes.events ?? []

      // Merge: keep existing events not in the new batch, add/update new ones
      setEvents(prev => {
        const map = new Map(prev.map(e => [e.event_id, e]))
        for (const e of incoming) map.set(e.event_id, e)
        // Sort by acquisition_date desc, then acquisition_time desc
        return Array.from(map.values()).sort((a, b) => {
          const dateA = a.acquisition_date ?? ''
          const dateB = b.acquisition_date ?? ''
          if (dateB !== dateA) return dateB.localeCompare(dateA)
          return (b.acquisition_time ?? 0) - (a.acquisition_time ?? 0)
        })
      })

      if (!statsRes.error)    setStatistics(statsRes)
      if (pipelineRes.status) setPipelineStatus(pipelineRes)

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
