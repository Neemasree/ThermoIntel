import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Loader, Filter } from 'lucide-react'
import { useAppContext } from '../App'
import { formatAcqTime, confidenceLabel } from '../utils/eventUtils'

function frpColor(frp: number | null): string {
  if (frp == null) return '#38BDF8'
  if (frp > 2000)  return '#DC2626'
  if (frp > 1000)  return '#EF4444'
  if (frp > 500)   return '#F97316'
  if (frp > 200)   return '#FB923C'
  if (frp > 50)    return '#FCD34D'
  return '#38BDF8'
}

export default function HistoryPage() {
  const { events, status, error, selectedEvent, setSelectedEvent } = useAppContext()
  const navigate = useNavigate()

  const [filterDaynight, setFilterDaynight] = useState<'all' | 'D' | 'N'>('all')
  const [filterSource, setFilterSource] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)

  const sources = useMemo(() => {
    const s = new Set(events.map(e => e.firms_source).filter(Boolean) as string[])
    return ['all', ...Array.from(s)]
  }, [events])

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (filterDaynight !== 'all' && e.daynight !== filterDaynight) return false
      if (filterSource !== 'all' && e.firms_source !== filterSource) return false
      return true
    })
  }, [events, filterDaynight, filterSource])

  // Group by date
  const grouped = useMemo(() => {
    const g: Record<string, typeof filtered> = {}
    for (const e of filtered) {
      const key = e.acquisition_date ?? 'Unknown'
      if (!g[key]) g[key] = []
      g[key].push(e)
    }
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  function handleSelect(event: typeof events[0]) {
    setSelectedEvent(event)
    navigate('/risk')
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--d1)' }}>

      {/* Header */}
      <div style={{ padding: '12px 20px 8px', flexShrink: 0, borderBottom: '1px solid var(--b1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t4)', marginBottom: 1 }}>Observation Log</div>
            <div style={{ fontSize: 11, color: 'var(--t4)' }}>FIRMS Detection Archive · {filtered.length.toLocaleString()} observations</div>
          </div>
          <button
            onClick={() => setShowFilters(p => !p)}
            className={`btn ${showFilters ? 'btn-cyan' : ''}`}
            style={{ fontSize: 10, padding: '4px 10px' }}
          >
            <Filter size={10}/> Filters
          </button>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>DAY/NIGHT</span>
              {(['all', 'D', 'N'] as const).map(f => (
                <button key={f} onClick={() => setFilterDaynight(f)} className={`chip ${filterDaynight === f ? 'active' : ''}`} style={{ fontSize: 9, padding: '2px 8px' }}>
                  {f === 'all' ? 'ALL' : f === 'D' ? 'DAY' : 'NIGHT'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>SOURCE</span>
              {sources.map(s => (
                <button key={s} onClick={() => setFilterSource(s)} className={`chip ${filterSource === s ? 'active' : ''}`} style={{ fontSize: 9, padding: '2px 8px' }}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '72px 90px 120px 90px 80px 80px 110px 110px 1fr', padding: '6px 20px', borderBottom: '1px solid var(--b1)', background: 'var(--d3)', flexShrink: 0 }}>
        {['Time', 'FRP', 'Event ID', 'Brightness', 'Conf.', 'D/N', 'Satellite', 'Source', 'Land Cover'].map(col => (
          <div key={col} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>{col}</div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {status === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, flexDirection: 'column', gap: 10, color: 'var(--t3)' }}>
            <Loader size={20} color="var(--cyan)" style={{ animation: 'spin 0.9s linear infinite' }}/>
            <span style={{ fontSize: 13 }}>Loading thermal observations…</span>
          </div>
        )}
        {status === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, flexDirection: 'column', gap: 8, color: 'var(--err)' }}>
            <AlertCircle size={20}/>
            <span style={{ fontSize: 13 }}>Data source unavailable — {error}</span>
          </div>
        )}
        {(status === 'live' || status === 'empty') && grouped.map(([date, dateEvents]) => (
          <div key={date}>
            {/* Date group header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px 4px', background: 'var(--d2)', borderBottom: '1px solid var(--b0)', position: 'sticky', top: 0, zIndex: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>{date}</span>
              <div style={{ flex: 1, height: 1, background: 'var(--b0)' }}/>
              <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>{dateEvents.length.toLocaleString()} detections</span>
            </div>

            {/* Event rows */}
            {dateEvents.map((event, idx) => {
              const isSelected = selectedEvent?.event_id === event.event_id
              const c = frpColor(event.frp)
              return (
                <div
                  key={event.event_id ?? event.id}
                  onClick={() => handleSelect(event)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '72px 90px 120px 90px 80px 80px 110px 110px 1fr',
                    padding: '5px 20px',
                    borderBottom: '1px solid var(--b0)',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(29,232,227,0.06)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    borderLeft: `2px solid ${isSelected ? 'var(--cyan)' : 'transparent'}`,
                    transition: 'background var(--ease)',
                    alignItems: 'center',
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--d4)' }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                >
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--t4)' }}>{formatAcqTime(event.acquisition_time)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: c, boxShadow: `0 0 4px ${c}`, flexShrink: 0 }}/>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: c, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {event.frp != null ? `${event.frp.toLocaleString()}` : '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: isSelected ? 'var(--cyan)' : 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {event.event_id ?? `#${event.id}`}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
                    {event.brightness != null ? `${event.brightness.toFixed(1)} K` : '—'}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--t3)' }}>{confidenceLabel(event.confidence)}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>{event.daynight ?? '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.satellite ?? '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.firms_source ?? '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.worldcover_class_name ?? '—'}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
