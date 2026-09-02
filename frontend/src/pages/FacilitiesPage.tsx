import React from 'react'
import { useAppContext } from '../App'
import { AlertCircle, CheckCircle2, Clock, Building2, Layers, WifiOff } from 'lucide-react'
import { frpColor, formatAcqTime, confidenceLabel, frpTier } from '../utils/eventUtils'

function StatCard({ label, value, sub, accent, icon: Icon }: {
  label: string; value: string; sub?: string; accent?: string
  icon?: React.FC<{ size: number; color?: string; strokeWidth?: number }>
}) {
  return (
    <div style={{
      padding: '14px 18px', background: 'var(--d4)', border: '1px solid var(--b1)',
      borderTop: `3px solid ${accent ?? 'var(--b2)'}`, borderRadius: 10, minWidth: 160,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        {Icon && <Icon size={13} color={accent ?? 'var(--t3)'} strokeWidth={1.8}/>}
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ?? 'var(--t1)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', marginBottom: 4 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--t4)' }}>{sub}</div>}
    </div>
  )
}

function EventCard({ event, selected, onSelect }: {
  event: ReturnType<typeof useAppContext>['events'][0]; selected: boolean; onSelect: () => void
}) {
  const fc  = frpColor(event.frp)
  const wcOk = event.worldcover_version != null
  return (
    <div
      onClick={onSelect}
      style={{
        background: selected ? 'rgba(0,229,220,0.07)' : 'var(--d4)',
        border: `1px solid ${selected ? 'var(--cyan-border)' : 'var(--b1)'}`,
        borderLeft: `4px solid ${fc}`,
        borderRadius: 10, padding: '12px 14px',
        cursor: 'pointer', transition: 'all var(--ease)',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--b3)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--b1)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: selected ? 'var(--cyan)' : 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
            {event.event_id ?? '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t4)' }}>{event.satellite ?? '—'} · {event.firms_source ?? '—'}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 800, color: fc, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {event.frp != null ? event.frp.toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t4)' }}>MW FRP</div>
        </div>
      </div>
      {[
        { l: 'Brightness', v: event.brightness != null ? `${event.brightness.toFixed(1)} K` : '—' },
        { l: 'Confidence', v: confidenceLabel(event.confidence) },
        { l: 'Time',       v: `${event.acquisition_date ?? '—'} ${formatAcqTime(event.acquisition_time)}` },
        { l: 'Location',   v: `${event.latitude.toFixed(3)}°, ${event.longitude.toFixed(3)}°` },
      ].map(({ l, v }) => (
        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--b0)' }}>
          <span style={{ fontSize: 12, color: 'var(--t4)' }}>{l}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--t2)', fontWeight: 500 }}>{v}</span>
        </div>
      ))}
      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: wcOk ? 'var(--ok)' : 'var(--t4)',
          background: wcOk ? 'var(--ok-bg)' : 'var(--d5)',
          border: `1px solid ${wcOk ? 'var(--ok-b)' : 'var(--b1)'}`,
          borderRadius: 4, padding: '2px 8px',
        }}>
          {wcOk ? '✓ Land cover' : 'Land cover pending'}
        </span>
        {event.worldcover_class_name && (
          <span style={{ fontSize: 11, color: 'var(--t4)', background: 'var(--d6)', border: '1px solid var(--b1)', borderRadius: 4, padding: '2px 8px' }}>
            {event.worldcover_class_name}
          </span>
        )}
      </div>
    </div>
  )
}

export default function FacilitiesPage() {
  const { events, pipelineStatus, status, error, selectedEvent, setSelectedEvent } = useAppContext()
  const enriched = events.filter(e => e.worldcover_version != null).length
  const pending  = events.filter(e => e.worldcover_version == null).length
  const wc    = pipelineStatus?.worldcover
  const firms = pipelineStatus?.firms

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--d1)' }}>

      {/* Header */}
      <div style={{ padding: '14px 20px 14px', background: 'var(--d2)', borderBottom: '1px solid var(--b1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 3, height: 18, background: 'var(--cyan)', borderRadius: 2 }}/>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)' }}>Facilities & Enrichment</h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--t4)', marginBottom: 14 }}>
          Infrastructure proximity data and pipeline enrichment status
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StatCard label="Land Cover Enriched" icon={CheckCircle2}
            value={wc ? wc.enriched.toLocaleString() : '—'}
            sub={wc ? `${wc.pending.toLocaleString()} pending · ${wc.version}` : 'Awaiting pipeline'}
            accent="var(--ok)"/>
          <StatCard label="Total FIRMS Records"
            value={firms ? firms.total_records.toLocaleString() : '—'}
            sub={firms ? `${firms.new_records_24h.toLocaleString()} new today` : 'Awaiting pipeline'}
            accent="var(--amber)"/>
          <StatCard label="Loaded in View" icon={Clock}
            value={events.length.toLocaleString()}
            sub={`${enriched} enriched · ${pending} pending`}/>
          {/* OSM Facilities — intentional pending state, not broken */}
          <div style={{
            padding: '14px 18px',
            background: 'var(--d4)',
            border: '1px solid var(--violet-border)',
            borderTop: '3px solid var(--violet)',
            borderRadius: 10, minWidth: 180,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <Building2 size={13} color="var(--violet)" strokeWidth={1.8}/>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>OSM Facilities</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.10em',
                color: 'var(--violet)', background: 'var(--violet-bg)',
                border: '1px solid var(--violet-border)',
                borderRadius: 4, padding: '2px 8px', fontFamily: 'var(--font-mono)',
              }}>PENDING</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t4)', lineHeight: 1.5 }}>Proximity enrichment in progress</div>
          </div>
        </div>
      </div>

      {/* Info notice */}
      <div style={{
        margin: '12px 20px 0', padding: '12px 16px',
        background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.20)',
        borderLeft: '4px solid var(--sky)', borderRadius: 10,
        display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0,
      }}>
        <Layers size={14} color="var(--sky)" style={{ marginTop: 2, flexShrink: 0 }}/>
        <p style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--t1)', fontWeight: 600 }}>Facility proximity data</strong> is being enriched in the background using OpenStreetMap. 
          Once complete, each fire event will show distances to the nearest industrial zones, refineries, power plants, mines, and gas facilities.
        </p>
      </div>

      {/* Event grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {status === 'loading' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 10 }}>
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 180, borderRadius: 10 }}/>)}
          </div>
        )}
        {status === 'error' && (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <AlertCircle size={22} color="var(--err)" style={{ marginBottom: 10 }}/>
            <div style={{ fontSize: 15, color: 'var(--err)', fontWeight: 700, marginBottom: 6 }}>Could not load data</div>
            <div style={{ fontSize: 13, color: 'var(--t4)' }}>{error}</div>
          </div>
        )}
        {(status === 'live' || status === 'empty') && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t4)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {events.length.toLocaleString()} events · {enriched} with land cover data
            </div>
            {events.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', fontSize: 14, color: 'var(--t4)' }}>
                No events in current batch
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 10 }}>
                {events.map(ev => (
                  <EventCard
                    key={ev.event_id ?? `${ev.latitude}-${ev.longitude}`}
                    event={ev}
                    selected={selectedEvent?.event_id === ev.event_id}
                    onSelect={() => setSelectedEvent(ev)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
