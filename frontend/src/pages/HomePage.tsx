/**
 * HomePage — Global Map flagship.
 * Immersive map hero. Floating glass KPI rail. Right-docked intel panel. Live stream.
 * Zero fabricated data.
 */
import React from 'react'
import { WifiOff } from 'lucide-react'
import { useAppContext } from '../App'
import { frpColor, formatAcqTime, confidenceLabel } from '../utils/eventUtils'
import EventInspector from '../components/EventInspector'
import MapPanel from '../components/MapPanel'

/* ── KPI telemetry module ── */
function KpiModule({
  label, value, sub, accent, skeleton,
}: {
  label: string; value: string; sub?: string; accent?: string; skeleton?: boolean
}) {
  return (
    <div className="kpi-module" style={{ minWidth: 120, flex: '1 1 0' }}>
      <div className="kpi-label">{label}</div>
      {skeleton ? (
        <div className="skeleton" style={{ height: 28, width: '70%', borderRadius: 3 }}/>
      ) : (
        <div className="kpi-value" style={{ color: accent ?? 'var(--t1)', fontSize: 22 }}>{value}</div>
      )}
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

/* ── Scope module (loaded vs total) ── */
function ScopeModule({ loaded, total }: { loaded: number; total: number }) {
  const pct = total > 0 ? ((loaded / total) * 100).toFixed(1) : '0'
  return (
    <div className="kpi-module" style={{ minWidth: 150, flexShrink: 0 }}>
      <div className="kpi-label">View Scope</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 2 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--cyan)', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>
          {loaded.toLocaleString()}
        </span>
        <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>/ {total.toLocaleString()}</span>
      </div>
      {/* Progress bar */}
      <div style={{ height: 2, background: 'var(--d6)', borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
        <div style={{
          height: '100%', width: `${Math.min(100, parseFloat(pct))}%`,
          background: 'linear-gradient(90deg, var(--cyan-2), var(--cyan))',
          borderRadius: 2, transition: 'width 0.5s ease',
        }}/>
      </div>
      <div className="kpi-sub">{pct}% loaded · {total.toLocaleString()} in DB</div>
    </div>
  )
}

/* ── Stream row ── */
function StreamRow({ ev, selected, onSelect, isNewest }: {
  ev: ReturnType<typeof useAppContext>['events'][0]
  selected: boolean; onSelect: () => void; isNewest: boolean
}) {
  const fc = frpColor(ev.frp)
  return (
    <div
      className={`stream-row${selected ? ' selected' : isNewest ? ' newest' : ''}`}
      onClick={onSelect}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t3)', alignSelf: 'center', letterSpacing: '0.02em' }}>
        {formatAcqTime(ev.acquisition_time)}
      </span>
      <span style={{ fontSize: 10, color: 'var(--t2)', alignSelf: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ev.satellite ?? '—'}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10,
        color: fc, fontWeight: 600, alignSelf: 'center',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {ev.frp != null ? `${ev.frp.toLocaleString()}` : '—'}
        <span style={{ fontSize: 8, color: 'var(--t4)', marginLeft: 2 }}>MW</span>
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t3)', alignSelf: 'center' }}>
        {confidenceLabel(ev.confidence)}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t4)', alignSelf: 'center', textAlign: 'right' }}>
        {ev.latitude.toFixed(2)}°, {ev.longitude.toFixed(2)}°
      </span>
    </div>
  )
}

export default function HomePage() {
  const { events, statistics, status, error, selectedEvent, setSelectedEvent } = useAppContext()

  const loading = status === 'loading'
  const isErr   = status === 'error'

  const total    = statistics?.total_detections != null ? statistics.total_detections.toLocaleString()  : '—'
  const today    = statistics?.detections_today != null ? statistics.detections_today.toLocaleString()  : '—'
  const maxFrp   = statistics?.max_frp          != null ? statistics.max_frp.toLocaleString()           : '—'
  const activeSats = statistics?.by_satellite ? Object.keys(statistics.by_satellite).length.toString() : '—'
  const latestAcq  = events.length > 0 ? (events[0].acquisition_date ?? '—') : '—'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--d1)' }}>

      {/* ── KPI telemetry rail ── */}
      <div style={{
        display: 'flex', gap: 6, padding: '8px 12px',
        flexShrink: 0,
        background: 'var(--d2)',
        borderBottom: '1px solid var(--b1)',
        alignItems: 'stretch',
      }}>
        <KpiModule
          label="Total Detections"
          value={total}
          sub="all-time in database"
          accent="var(--amber)"
          skeleton={loading}
        />
        <KpiModule
          label="24h Detections"
          value={today}
          sub="database count today"
          skeleton={loading}
        />
        <KpiModule
          label="Peak FRP"
          value={maxFrp !== '—' ? `${maxFrp} MW` : '—'}
          sub="all-time maximum"
          accent="var(--th-0)"
          skeleton={loading}
        />
        <KpiModule
          label="Satellites"
          value={activeSats}
          sub="active platforms"
          accent="var(--cyan)"
          skeleton={loading}
        />
        <KpiModule
          label="Latest Acq."
          value={latestAcq}
          sub="most recent date"
          skeleton={loading}
        />
        {events.length > 0 && statistics?.total_detections != null && (
          <ScopeModule loaded={events.length} total={statistics.total_detections}/>
        )}
      </div>

      {/* ── Map + inspector ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, position: 'relative' }}>

        {/* Map — dominates the viewport */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <MapPanel
            events={events}
            selectedEvent={selectedEvent}
            onSelect={setSelectedEvent}
            status={status}
            error={error}
          />
        </div>

        {/* Right intel panel — docked over the right edge */}
        <div style={{
          width: 272,
          minWidth: 272,
          flexShrink: 0,
          background: 'var(--d3)',
          borderLeft: '1px solid var(--b1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '7px 14px',
            borderBottom: '1px solid var(--b1)',
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--d4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 2, height: 12,
                background: 'var(--cyan)',
                borderRadius: 1,
                boxShadow: '0 0 4px var(--cyan)',
              }}/>
              <span style={{
                fontSize: 8, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.16em',
                color: 'var(--t3)', fontFamily: 'var(--font-mono)',
              }}>
                Event Intelligence
              </span>
            </div>
            {selectedEvent && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 8,
                color: 'var(--cyan)',
                background: 'var(--cyan-bg)',
                border: '1px solid var(--cyan-border)',
                borderRadius: 'var(--r-xs)',
                padding: '1px 6px',
                letterSpacing: '0.06em',
              }}>
                SELECTED
              </span>
            )}
          </div>
          <EventInspector event={selectedEvent} status={status}/>
        </div>
      </div>

      {/* ── Live observation stream ── */}
      <div style={{ flexShrink: 0, padding: '0 12px 8px' }}>
        <div style={{
          background: 'var(--d3)',
          border: '1px solid var(--b1)',
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
          maxHeight: 196,
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Stream header */}
          <div style={{
            padding: '6px 12px',
            borderBottom: '1px solid var(--b1)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
            background: 'var(--d4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="live-dot" style={{ width: 5, height: 5 }}/>
              <span style={{
                fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.16em', color: 'var(--t3)',
                fontFamily: 'var(--font-mono)',
              }}>
                Live Observation Stream
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
                {events.length.toLocaleString()} LOADED
              </span>
              {statistics?.total_detections != null && (
                <span style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
                  {statistics.total_detections.toLocaleString()} TOTAL
                </span>
              )}
            </div>
          </div>

          {/* Col headers */}
          {events.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '68px 72px 74px 60px 1fr',
              gap: 0,
              padding: '4px 12px',
              borderBottom: '1px solid var(--b1)',
              background: 'var(--d4)',
              flexShrink: 0,
            }}>
              {['TIME', 'SAT', 'FRP', 'CONF', 'LOCATION'].map(h => (
                <span key={h} style={{
                  fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.12em', color: 'var(--t4)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {h}
                </span>
              ))}
            </div>
          )}

          {/* Rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && (
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[...Array(5)].map((_, i) => <div key={i} className="skeleton skeleton-row"/>)}
              </div>
            )}
            {isErr && (
              <div style={{
                padding: '14px 12px', display: 'flex', alignItems: 'center', gap: 8,
                color: 'var(--err)', fontSize: 11,
              }}>
                <WifiOff size={12}/>
                Data connection lost — unable to retrieve live ThermalWatch telemetry
              </div>
            )}
            {!loading && !isErr && events.length === 0 && (
              <div style={{ padding: '14px 12px', fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
                NO EVENTS IN RANGE — pipeline may still be ingesting
              </div>
            )}
            {!loading && events.slice(0, 120).map((ev, idx) => (
              <StreamRow
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
