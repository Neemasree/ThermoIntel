/**
 * FacilitiesPage — Geospatial infrastructure intelligence.
 * Real pipeline stats + enrichment status. No fabricated facilities.
 */
import React from 'react'
import { useAppContext } from '../App'
import { AlertCircle, Building2, CheckCircle2, Clock, Zap, Layers } from 'lucide-react'
import { frpColor, formatAcqTime, confidenceLabel } from '../utils/eventUtils'

/* ── Pipeline stat card ── */
function PipelineStat({ label, value, sub, accent, icon: Icon }: {
  label: string; value: string; sub?: string; accent?: string
  icon?: React.FC<{ size: number; color?: string; strokeWidth?: number }>
}) {
  return (
    <div style={{
      padding: '10px 14px',
      background: 'var(--d4)', border: '1px solid var(--b1)',
      borderTop: `2px solid ${accent ?? 'var(--b2)'}`,
      borderRadius: 'var(--r-md)',
      minWidth: 150,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        {Icon && <Icon size={10} color="var(--t4)" strokeWidth={1.5}/>}
        <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 800, color: accent ?? 'var(--t1)', lineHeight: 1, marginBottom: 3, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 8.5, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>{sub}</div>}
    </div>
  )
}

/* ── Event card ── */
function EventCard({ event, selected, onSelect }: {
  event: ReturnType<typeof useAppContext>['events'][0]
  selected: boolean; onSelect: () => void
}) {
  const fc = frpColor(event.frp)
  const wcOk = event.worldcover_version != null

  return (
    <div
      onClick={onSelect}
      style={{
        background: selected ? 'var(--d7)' : 'var(--d4)',
        border: `1px solid ${selected ? 'var(--cyan-border)' : 'var(--b1)'}`,
        borderLeft: `3px solid ${fc}`,
        borderRadius: 'var(--r-md)',
        padding: '10px 12px',
        cursor: 'pointer',
        transition: 'all var(--ease)',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--b3)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--b1)' }}
    >
      {/* FRP glow strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
        background: fc, opacity: 0.6,
      }}/>

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 7, paddingLeft: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 600,
            color: selected ? 'var(--cyan)' : 'var(--t2)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2,
          }}>
            {event.event_id ?? '—'}
          </div>
          <div style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
            {event.satellite ?? '—'} · {event.firms_source ?? '—'}
          </div>
        </div>
        {/* FRP value */}
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800, color: fc, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {event.frp != null ? event.frp.toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 7.5, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>MW FRP</div>
        </div>
      </div>

      {/* Data rows */}
      <div style={{ paddingLeft: 6 }}>
        {[
          { l: 'Brightness', v: event.brightness != null ? `${event.brightness.toFixed(1)} K` : '—' },
          { l: 'Confidence', v: confidenceLabel(event.confidence) },
          { l: 'Time',       v: `${event.acquisition_date ?? '—'} ${formatAcqTime(event.acquisition_time)}` },
          { l: 'Location',   v: `${event.latitude.toFixed(3)}°, ${event.longitude.toFixed(3)}°` },
        ].map(({ l, v }) => (
          <div key={l} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '2px 0', borderBottom: '1px solid var(--b0)',
          }}>
            <span style={{ fontSize: 8.5, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{l}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t2)', fontWeight: 500 }}>{v}</span>
          </div>
        ))}

        {/* Enrichment status row */}
        <div style={{ marginTop: 7, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 7.5, fontWeight: 700, letterSpacing: '0.10em',
            color: wcOk ? 'var(--ok)' : 'var(--t4)',
            background: wcOk ? 'var(--ok-bg)' : 'var(--d5)',
            border: `1px solid ${wcOk ? 'var(--ok-b)' : 'var(--b1)'}`,
            borderRadius: 'var(--r-xs)', padding: '2px 6px',
            fontFamily: 'var(--font-mono)',
          }}>
            {wcOk ? 'WC ENRICHED' : 'WC PENDING'}
          </span>
          {event.worldcover_class_name && (
            <span style={{
              fontSize: 7.5, color: 'var(--t4)',
              background: 'var(--d6)', border: '1px solid var(--b1)',
              borderRadius: 'var(--r-xs)', padding: '2px 6px',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
            }}>
              {event.worldcover_class_name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FacilitiesPage() {
  const { events, pipelineStatus, status, error, selectedEvent, setSelectedEvent } = useAppContext()

  const enriched = events.filter(e => e.worldcover_version != null).length
  const pending  = events.filter(e => e.worldcover_version == null).length
  const wc       = pipelineStatus?.worldcover
  const firms    = pipelineStatus?.firms

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--d1)' }}>

      {/* ── Header ── */}
      <div style={{
        padding: '10px 16px 12px',
        background: 'var(--d2)',
        borderBottom: '1px solid var(--b1)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 2, height: 14, background: 'var(--sky)', borderRadius: 1 }}/>
          <h1 style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.01em' }}>
            Facilities &amp; Enrichment
          </h1>
        </div>
        <p style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', marginBottom: 12 }}>
          INFRASTRUCTURE CONTEXT · PIPELINE ENRICHMENT STATUS
        </p>

        {/* Pipeline stats */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <PipelineStat
            label="WorldCover Enriched" icon={CheckCircle2}
            value={wc ? wc.enriched.toLocaleString() : '—'}
            sub={wc ? `${wc.pending.toLocaleString()} pending · ${wc.version}` : 'Awaiting pipeline'}
            accent="var(--ok)"/>
          <PipelineStat
            label="FIRMS Records"
            value={firms ? firms.total_records.toLocaleString() : '—'}
            sub={firms ? `${firms.new_records_24h.toLocaleString()} new in 24h` : 'Awaiting pipeline'}
            accent="var(--amber)"/>
          <PipelineStat
            label="Batch Loaded" icon={Clock}
            value={events.length.toLocaleString()}
            sub={`${enriched} enriched · ${pending} pending`}/>
          {/* OSM — pending */}
          <div style={{
            padding: '10px 14px', background: 'var(--d5)',
            border: '1px solid var(--b1)', borderTop: '2px solid var(--b2)',
            borderRadius: 'var(--r-md)', minWidth: 180, opacity: 0.55,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
              <Building2 size={10} color="var(--t4)" strokeWidth={1.5}/>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
                OSM Enrichment
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 800, color: 'var(--t4)', lineHeight: 1, marginBottom: 3 }}>—</div>
            <div style={{ fontSize: 8.5, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>Pending pipeline integration</div>
          </div>
        </div>
      </div>

      {/* ── OSM notice ── */}
      <div style={{
        margin: '10px 16px 0', padding: '10px 13px',
        background: 'rgba(56,189,248,0.06)',
        border: '1px solid rgba(56,189,248,0.18)',
        borderLeft: '3px solid var(--sky)',
        borderRadius: 'var(--r-md)',
        display: 'flex', alignItems: 'flex-start', gap: 9,
        flexShrink: 0,
      }}>
        <Layers size={12} color="var(--sky)" style={{ marginTop: 1, flexShrink: 0 }}/>
        <div style={{ fontSize: 10, color: 'var(--t3)', lineHeight: 1.7, fontFamily: 'var(--font-sans)' }}>
          <strong style={{ color: 'var(--t1)', fontWeight: 600 }}>Infrastructure proximity</strong> requires the OSM enrichment pipeline.
          Once integrated, this page will display facility distances, proximity flags, and threat scores for each thermal event.
          Events below show current FIRMS batch with WorldCover status.
        </div>
      </div>

      {/* ── Event grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
        {status === 'loading' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {[...Array(9)].map((_, i) => <div key={i} className="skeleton" style={{ height: 160, borderRadius: 8 }}/>)}
          </div>
        )}

        {status === 'error' && (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <AlertCircle size={18} color="var(--err)" style={{ marginBottom: 8 }}/>
            <div style={{ fontSize: 11, color: 'var(--err)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.08em' }}>
              DATA CONNECTION LOST
            </div>
            <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 4 }}>{error}</div>
          </div>
        )}

        {(status === 'live' || status === 'empty') && (
          <>
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.14em',
              color: 'var(--t4)', fontFamily: 'var(--font-mono)',
              marginBottom: 10, textTransform: 'uppercase',
            }}>
              Current Batch — {events.length.toLocaleString()} events · {enriched} WorldCover enriched
            </div>
            {events.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t4)', letterSpacing: '0.10em' }}>
                NO EVENTS IN CURRENT BATCH
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
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
