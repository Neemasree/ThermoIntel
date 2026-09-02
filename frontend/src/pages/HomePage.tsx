import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, Satellite, AlertCircle, Loader, TrendingUp, Globe } from 'lucide-react'
import { useAppContext } from '../App'
import { formatAcqTime, confidenceLabel } from '../utils/eventUtils'
import type { ApiThermalEvent } from '../types/api'

function frpColor(frp: number | null): string {
  if (frp == null) return '#38BDF8'
  if (frp > 2000)  return '#DC2626'
  if (frp > 1000)  return '#EF4444'
  if (frp > 500)   return '#F97316'
  if (frp > 200)   return '#FB923C'
  if (frp > 50)    return '#FCD34D'
  return '#38BDF8'
}

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="kpi-module" style={{ flex: 1, minWidth: 0 }}>
      {icon && <div style={{ position: 'absolute', top: 12, right: 14, opacity: 0.15 }}>{icon}</div>}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: color ?? 'var(--t1)', fontSize: 26 }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export default function HomePage() {
  const { events, statistics, status, error, selectedEvent, setSelectedEvent } = useAppContext()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | 'day' | 'night'>('all')

  const filtered = filter === 'all' ? events
    : events.filter(e => e.daynight === (filter === 'day' ? 'D' : 'N'))

  function handleSelect(e: ApiThermalEvent) {
    setSelectedEvent(e)
    navigate('/risk')
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--d1)' }}>

      {/* ── KPI strip ── */}
      <div style={{ padding: '14px 20px 10px', flexShrink: 0, borderBottom: '1px solid var(--b1)' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <KpiCard
            label="Total Detections"
            value={statistics?.total_detections != null ? statistics.total_detections.toLocaleString() : '—'}
            sub="all time"
            color="var(--amber)"
            icon={<Flame size={32}/>}
          />
          <KpiCard
            label="Today"
            value={statistics?.detections_today != null ? statistics.detections_today.toLocaleString() : '—'}
            sub="current date"
            icon={<TrendingUp size={32}/>}
          />
          <KpiCard
            label="Last 7 Days"
            value={statistics?.detections_last_7d != null ? statistics.detections_last_7d.toLocaleString() : '—'}
            sub="rolling window"
            icon={<Globe size={32}/>}
          />
          <KpiCard
            label="Peak FRP"
            value={statistics?.max_frp != null ? `${statistics.max_frp.toLocaleString()} MW` : '—'}
            sub="all-time maximum"
            color="var(--err)"
            icon={<Flame size={32}/>}
          />
          <KpiCard
            label="Avg FRP"
            value={statistics?.avg_frp != null ? `${statistics.avg_frp.toFixed(0)} MW` : '—'}
            sub="mean fire radiative power"
            icon={<Satellite size={32}/>}
          />
          <KpiCard
            label="Avg Brightness"
            value={statistics?.avg_brightness != null ? `${statistics.avg_brightness.toFixed(0)} K` : '—'}
            sub="mean brightness temp"
          />
        </div>
      </div>

      {/* ── Event stream ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 20px 16px' }}>

        {/* Table header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)' }}>Event Stream</div>
            <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 1 }}>{events.length.toLocaleString()} events loaded</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'day', 'night'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`chip ${filter === f ? 'active' : ''}`}
                style={{ fontSize: 10, padding: '3px 10px' }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Status states */}
        {status === 'loading' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--t3)' }}>
            <Loader size={20} color="var(--cyan)" style={{ animation: 'spin 0.9s linear infinite' }}/>
            <span style={{ fontSize: 13 }}>Loading thermal observations…</span>
          </div>
        )}
        {status === 'error' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--err)' }}>
            <AlertCircle size={20}/>
            <span style={{ fontSize: 13 }}>Data source unavailable</span>
            <span style={{ fontSize: 11, color: 'var(--t4)' }}>{error}</span>
          </div>
        )}

        {(status === 'live' || status === 'empty') && (
          <div style={{ flex: 1, overflow: 'hidden', background: 'var(--d3)', border: '1px solid var(--b1)', borderRadius: 9 }}>
            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '130px 90px 72px 90px 80px 80px 110px 110px 1fr', padding: '7px 14px', borderBottom: '1px solid var(--b1)', background: 'var(--d4)' }}>
              {['Event ID', 'Date', 'Time', 'FRP', 'Brightness', 'Conf.', 'Satellite', 'Source', 'Land Cover'].map(col => (
                <div key={col} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>{col}</div>
              ))}
            </div>

            {/* Rows */}
            <div style={{ overflowY: 'auto', height: 'calc(100% - 34px)' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t4)', fontSize: 13 }}>
                  No thermal detections found.
                </div>
              ) : filtered.map((event, idx) => {
                const isSelected = selectedEvent?.event_id === event.event_id
                const c = frpColor(event.frp)
                return (
                  <div
                    key={event.event_id ?? event.id}
                    onClick={() => handleSelect(event)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '130px 90px 72px 90px 80px 80px 110px 110px 1fr',
                      padding: '6px 14px',
                      borderBottom: '1px solid var(--b0)',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(29,232,227,0.06)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      borderLeft: `2px solid ${isSelected ? 'var(--cyan)' : 'transparent'}`,
                      transition: 'background var(--ease)',
                      alignItems: 'center',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--d5)' }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                  >
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: isSelected ? 'var(--cyan)' : 'var(--t2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {event.event_id ?? `#${event.id}`}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>{event.acquisition_date ?? '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>{formatAcqTime(event.acquisition_time)}</div>
                    <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: c, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {event.frp != null ? `${event.frp.toLocaleString()} MW` : '—'}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
                      {event.brightness != null ? `${event.brightness.toFixed(1)} K` : '—'}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--t3)' }}>{confidenceLabel(event.confidence)}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.satellite ?? '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--t4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.firms_source ?? '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--t4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.worldcover_class_name ?? '—'}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
