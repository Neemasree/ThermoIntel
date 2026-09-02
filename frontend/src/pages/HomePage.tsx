import React from 'react'
import { Flame, Satellite, TrendingUp, Calendar, Database, WifiOff } from 'lucide-react'
import { useAppContext } from '../App'
import { frpColor, formatAcqTime, confidenceLabel, frpTier } from '../utils/eventUtils'
import EventInspector from '../components/EventInspector'
import MapPanel from '../components/MapPanel'

function StatCard({ label, value, sub, accent, icon: Icon }: {
  label: string; value: string; sub?: string; accent?: string; icon?: React.ElementType
}) {
  return (
    <div style={{
      flex: '1 1 0', minWidth: 120,
      background: 'var(--d4)', border: '1px solid var(--b1)',
      borderTop: `3px solid ${accent ?? 'var(--b2)'}`,
      borderRadius: 10, padding: '12px 16px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {Icon && <Icon size={14} color={accent ?? 'var(--t3)'} strokeWidth={1.8}/>}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ?? 'var(--t1)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t4)' }}>{sub}</div>}
    </div>
  )
}

function EventRow({ ev, selected, onSelect, isNewest }: {
  ev: ReturnType<typeof useAppContext>['events'][0]
  selected: boolean; onSelect: () => void; isNewest: boolean
}) {
  const fc = frpColor(ev.frp)
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 90px 90px 70px 1fr',
        alignItems: 'center',
        padding: '7px 16px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--b0)',
        background: selected ? 'rgba(0,229,220,0.07)' : isNewest ? 'rgba(0,229,220,0.03)' : 'transparent',
        borderLeft: `3px solid ${selected ? 'var(--cyan)' : isNewest ? 'rgba(0,229,220,0.3)' : 'transparent'}`,
        transition: 'background 120ms',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--d5)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = isNewest ? 'rgba(0,229,220,0.03)' : 'transparent' }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--t3)' }}>
        {formatAcqTime(ev.acquisition_time)}
      </span>
      <span style={{ fontSize: 13, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ev.satellite ?? '—'}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: fc, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {ev.frp != null ? `${ev.frp.toLocaleString()}` : '—'}
        <span style={{ fontSize: 10, color: 'var(--t4)', marginLeft: 3 }}>MW</span>
      </span>
      <span style={{ fontSize: 12, color: 'var(--t3)' }}>
        {confidenceLabel(ev.confidence)}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t4)', textAlign: 'right' }}>
        {ev.latitude.toFixed(2)}°, {ev.longitude.toFixed(2)}°
      </span>
    </div>
  )
}

export default function HomePage() {
  const { events, statistics, status, error, selectedEvent, setSelectedEvent } = useAppContext()
  const loading = status === 'loading'
  const isErr   = status === 'error'

  const total    = statistics?.total_detections != null ? statistics.total_detections.toLocaleString() : '—'
  const today    = statistics?.detections_today != null ? statistics.detections_today.toLocaleString() : '—'
  const peakFrp  = statistics?.max_frp          != null ? `${statistics.max_frp.toLocaleString()} MW`  : '—'
  const satCount = statistics?.by_satellite ? Object.keys(statistics.by_satellite).length.toString()   : '—'
  const latestAcq = events.length > 0 ? (events[0].acquisition_date ?? '—') : '—'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--d1)' }}>

      {/* Stats bar */}
      <div style={{
        display: 'flex', gap: 10, padding: '12px 16px',
        background: 'var(--d2)', borderBottom: '1px solid var(--b1)',
        flexShrink: 0, alignItems: 'stretch',
      }}>
        <StatCard label="Total Fires"      value={total}    sub="all time in database"   accent="var(--amber)"  icon={Flame}/>
        <StatCard label="Today"            value={today}    sub="fires in last 24 hours"  accent="var(--cyan)"/>
        <StatCard label="Strongest Fire"   value={peakFrp}  sub="highest recorded"        accent="var(--th-0)"  icon={TrendingUp}/>
        <StatCard label="Satellites"       value={satCount} sub="active platforms"        accent="var(--cyan)" icon={Satellite}/>
        <StatCard label="Latest Data"      value={latestAcq} sub="most recent acquisition" icon={Calendar}/>
        {events.length > 0 && statistics?.total_detections != null && (
          <div style={{
            flex: '0 0 auto', minWidth: 160,
            background: 'var(--d4)', border: '1px solid var(--b1)',
            borderTop: '3px solid var(--b2)', borderRadius: 10, padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Database size={13} color="var(--t3)" strokeWidth={1.8}/>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Showing</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--cyan)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', lineHeight: 1, marginBottom: 4 }}>
              {events.length.toLocaleString()}
            </div>
            <div style={{ height: 3, background: 'var(--d6)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (events.length / statistics.total_detections) * 100)}%`,
                background: 'linear-gradient(90deg, var(--cyan-2), var(--cyan))',
                borderRadius: 2,
              }}/>
            </div>
            <div style={{ fontSize: 11, color: 'var(--t4)' }}>
              of {statistics.total_detections.toLocaleString()} total
            </div>
          </div>
        )}
      </div>

      {/* Map + Inspector */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Map */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <MapPanel
            events={events}
            selectedEvent={selectedEvent}
            onSelect={setSelectedEvent}
            status={status}
            error={error}
          />
        </div>

        {/* Inspector panel */}
        <div style={{
          width: 300, minWidth: 300, flexShrink: 0,
          background: 'var(--d3)', borderLeft: '1px solid var(--b1)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--b1)',
            background: 'var(--d4)', flexShrink: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 16, background: 'var(--cyan)', borderRadius: 2, boxShadow: '0 0 6px var(--cyan)' }}/>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)' }}>Fire Details</span>
            </div>
            {selectedEvent
              ? <span style={{ fontSize: 11, color: 'var(--cyan)', background: 'var(--cyan-bg)', border: '1px solid var(--cyan-border)', borderRadius: 4, padding: '2px 8px' }}>Selected</span>
              : <span style={{ fontSize: 11, color: 'var(--t4)' }}>Click a fire</span>
            }
          </div>
          <EventInspector event={selectedEvent} status={status}/>
        </div>
      </div>

      {/* Recent fires stream */}
      <div style={{ flexShrink: 0, padding: '0 16px 12px' }}>
        <div style={{
          background: 'var(--d3)', border: '1px solid var(--b1)',
          borderRadius: 10, overflow: 'hidden',
          maxHeight: 220, display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '8px 16px', borderBottom: '1px solid var(--b1)',
            background: 'var(--d4)', flexShrink: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="live-dot" style={{ width: 7, height: 7 }}/>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)' }}>Recent Fire Events</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--t4)' }}>
              {events.length.toLocaleString()} loaded
              {statistics?.total_detections != null && ` · ${statistics.total_detections.toLocaleString()} total`}
            </span>
          </div>

          {/* Column headers */}
          {events.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: '80px 90px 90px 70px 1fr',
              padding: '5px 16px', background: 'var(--d4)',
              borderBottom: '1px solid var(--b1)', flexShrink: 0,
            }}>
              {['Time', 'Satellite', 'Intensity', 'Confidence', 'Location'].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
              ))}
            </div>
          )}

          {/* Rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && (
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 32, borderRadius: 4 }}/>)}
              </div>
            )}
            {isErr && (
              <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--err)', fontSize: 13 }}>
                <WifiOff size={14}/> Could not load fire data from the backend
              </div>
            )}
            {!loading && !isErr && events.length === 0 && (
              <div style={{ padding: '16px', fontSize: 13, color: 'var(--t4)' }}>
                No events found. Check that the backend is running and data has been ingested.
              </div>
            )}
            {!loading && events.slice(0, 120).map((ev, idx) => (
              <EventRow
                key={ev.event_id ?? `${ev.latitude},${ev.longitude}`}
                ev={ev}
                selected={selectedEvent?.event_id === ev.event_id}
                onSelect={() => setSelectedEvent(ev)}
                isNewest={idx === 0}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
