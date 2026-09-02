import React, { useState } from 'react'
import { Building2, AlertCircle, Loader, ChevronRight, Zap, Flame, Droplets, Mountain, Factory } from 'lucide-react'
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
function distFmt(d: number | null): string {
  if (d == null) return 'Pending'
  if (d < 1) return `${(d * 1000).toFixed(0)} m`
  return `${d.toFixed(2)} km`
}
function distColor(d: number | null): string {
  if (d == null) return 'var(--t4)'
  if (d < 2)  return 'var(--err)'
  if (d < 10) return 'var(--warn)'
  return 'var(--ok)'
}

const FACILITY_TYPES = [
  { key: 'industrial',   label: 'Industrial',   icon: Factory,   distKey: 'distance_to_industrial',   nearKey: 'near_industrial_facility' },
  { key: 'refinery',     label: 'Refinery',     icon: Droplets,  distKey: 'distance_to_refinery',     nearKey: 'near_refinery' },
  { key: 'powerplant',   label: 'Power Plant',  icon: Zap,       distKey: 'distance_to_powerplant',   nearKey: 'near_powerplant' },
  { key: 'mine',         label: 'Mine',         icon: Mountain,  distKey: 'distance_to_mine',         nearKey: 'near_mine' },
  { key: 'gas_facility', label: 'Gas Facility', icon: Flame,     distKey: 'distance_to_gas_facility', nearKey: 'near_gas_facility' },
] as const

function EventCard({ event, selected, onClick }: { event: ApiThermalEvent; selected: boolean; onClick: () => void }) {
  const c = frpColor(event.frp)
  const osmEnriched = event.osm_enrichment_status === 'enriched'

  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? 'rgba(29,232,227,0.06)' : 'var(--d3)',
        border: `1px solid ${selected ? 'var(--cyan-border)' : 'var(--b1)'}`,
        borderRadius: 9,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'all var(--ease)',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--b2)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--b1)' }}
    >
      {/* Event header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: selected ? 'var(--cyan)' : 'var(--t2)', marginBottom: 2 }}>
            {event.event_id ?? `#${event.id}`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t4)' }}>{event.satellite ?? '—'} · {event.acquisition_date ?? '—'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: c, fontWeight: 700 }}>
            {event.frp != null ? `${event.frp.toLocaleString()} MW` : '—'}
          </div>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}`, marginLeft: 'auto', marginTop: 3 }}/>
        </div>
      </div>

      {/* Facility relationship tree */}
      {osmEnriched ? (
        <div style={{ borderTop: '1px solid var(--b0)', paddingTop: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--t4)', marginBottom: 6 }}>INFRASTRUCTURE PROXIMITY</div>
          {FACILITY_TYPES.map(({ key, label, icon: Icon, distKey, nearKey }) => {
            const dist = event[distKey as keyof ApiThermalEvent] as number | null
            const near = event[nearKey as keyof ApiThermalEvent] as boolean | null
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--b0)' }}>
                <div style={{ width: 1, height: 12, background: 'var(--b2)', marginLeft: 4 }}/>
                <Icon size={10} color="var(--t4)"/>
                <span style={{ fontSize: 10, color: 'var(--t3)', flex: 1 }}>{label}</span>
                {near != null && (
                  <span style={{ fontSize: 8, fontWeight: 700, color: near ? 'var(--err)' : 'var(--ok)', letterSpacing: '0.08em' }}>
                    {near ? '●' : '○'}
                  </span>
                )}
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: distColor(dist), fontVariantNumeric: 'tabular-nums' }}>
                  {distFmt(dist)}
                </span>
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
            <div style={{ width: 1, height: 12, background: 'var(--b2)', marginLeft: 4 }}/>
            <ChevronRight size={10} color="var(--t4)"/>
            <span style={{ fontSize: 10, color: 'var(--t3)', flex: 1 }}>Road</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: distColor(event.distance_to_road), fontVariantNumeric: 'tabular-nums' }}>
              {distFmt(event.distance_to_road)}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ borderTop: '1px solid var(--b0)', paddingTop: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--t4)', fontStyle: 'italic' }}>
            {event.osm_enrichment_status === 'pending' ? 'OSM enrichment in progress…' : 'OSM enrichment pending'}
          </div>
        </div>
      )}
    </div>
  )
}

export default function FacilitiesPage() {
  const { events, pipelineStatus, status, error, selectedEvent, setSelectedEvent } = useAppContext()
  const [filter, setFilter] = useState<'all' | 'enriched' | 'pending'>('all')

  const enrichedCount = events.filter(e => e.osm_enrichment_status === 'enriched').length
  const pendingCount  = events.filter(e => e.osm_enrichment_status !== 'enriched').length

  const filtered = filter === 'enriched'
    ? events.filter(e => e.osm_enrichment_status === 'enriched')
    : filter === 'pending'
    ? events.filter(e => e.osm_enrichment_status !== 'enriched')
    : events

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--d1)' }}>

      {/* Header */}
      <div style={{ padding: '14px 20px 10px', flexShrink: 0, borderBottom: '1px solid var(--b1)' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t4)', marginBottom: 6 }}>
          Infrastructure Intelligence
        </div>

        {/* Status cards */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'OSM Enriched', value: enrichedCount.toLocaleString(), color: 'var(--ok)', border: 'var(--ok-b)' },
            { label: 'OSM Pending', value: pendingCount.toLocaleString(), color: 'var(--warn)', border: 'var(--warn-b)' },
            { label: 'WorldCover Enriched', value: events.filter(e => e.worldcover_version != null).length.toLocaleString(), color: 'var(--cyan)', border: 'var(--cyan-border)' },
            { label: 'Events Loaded', value: events.length.toLocaleString(), color: 'var(--amber)', border: 'var(--amber-border)' },
            ...(pipelineStatus?.firms ? [{ label: 'Total Records', value: pipelineStatus.firms.total_records.toLocaleString(), color: 'var(--t2)', border: 'var(--b2)' }] : []),
          ].map(({ label, value, color, border }) => (
            <div key={label} style={{ padding: '8px 14px', background: 'var(--d3)', border: `1px solid ${border}`, borderRadius: 7, minWidth: 120 }}>
              <div style={{ fontSize: 9, color: 'var(--t4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>FILTER</span>
        {(['all', 'enriched', 'pending'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`chip ${filter === f ? 'active' : ''}`} style={{ fontSize: 10, padding: '3px 10px' }}>
            {f.toUpperCase()}
          </button>
        ))}
        <span style={{ fontSize: 10, color: 'var(--t4)', marginLeft: 'auto' }}>{filtered.length.toLocaleString()} events</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {status === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, flexDirection: 'column', gap: 10, color: 'var(--t3)' }}>
            <Loader size={20} color="var(--cyan)" style={{ animation: 'spin 0.9s linear infinite' }}/>
            <span style={{ fontSize: 13 }}>Loading infrastructure data…</span>
          </div>
        )}
        {status === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, flexDirection: 'column', gap: 8, color: 'var(--err)' }}>
            <AlertCircle size={20}/>
            <span style={{ fontSize: 13 }}>Data source unavailable — {error}</span>
          </div>
        )}
        {(status === 'live' || status === 'empty') && (
          <>
            {filtered.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, flexDirection: 'column', gap: 8, color: 'var(--t4)' }}>
                <Building2 size={24}/>
                <span style={{ fontSize: 13 }}>No events match the current filter.</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
                {filtered.map(event => (
                  <EventCard
                    key={event.event_id ?? event.id}
                    event={event}
                    selected={selectedEvent?.event_id === event.event_id}
                    onClick={() => setSelectedEvent(event)}
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
