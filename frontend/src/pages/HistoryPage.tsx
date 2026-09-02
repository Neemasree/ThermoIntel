import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { WifiOff, SlidersHorizontal, X } from 'lucide-react'
import { useAppContext } from '../App'
import { frpColor, formatAcqTime, confidenceLabel, frpTier } from '../utils/eventUtils'
import type { ApiThermalEvent } from '../types/api'

interface Filters {
  satellite: string; source: string; daynight: '' | 'D' | 'N'
  minFrp: number | null; worldcover: '' | 'enriched' | 'pending'
}
const DEFAULT: Filters = { satellite: '', source: '', daynight: '', minFrp: null, worldcover: '' }

/* Fixed column layout — every column has an explicit size to prevent collision */
const GRID = '4px 140px minmax(160px,1fr) 100px 68px 90px 100px'

function ObsRow({ ev, selected, onSelect }: {
  ev: ApiThermalEvent; selected: boolean; onSelect: () => void
}) {
  const fc = frpColor(ev.frp)
  const barW = ev.frp != null ? Math.min(100, (ev.frp / 3000) * 100) : 0

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        alignItems: 'center',
        minHeight: 52,
        cursor: 'pointer',
        borderBottom: '1px solid var(--b0)',
        background: selected ? 'var(--d7)' : 'transparent',
        borderLeft: `3px solid ${selected ? 'var(--cyan)' : 'transparent'}`,
        transition: 'background var(--ease), border-color var(--ease)',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--d5)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {/* FRP colour swatch */}
      <div style={{ width: 4, alignSelf: 'stretch', background: fc, opacity: 0.75 }}/>

      {/* Time + date */}
      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--t1)', fontWeight: 500, letterSpacing: '0.03em' }}>
          {formatAcqTime(ev.acquisition_time)}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t4)' }}>
          {ev.acquisition_date ?? '—'}
        </span>
      </div>

      {/* Satellite + FRP bar */}
      <div style={{ padding: '10px 14px 10px 0', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
            {ev.satellite ?? '—'}
          </span>
          {ev.instrument && (
            <span style={{ fontSize: 11, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
              {ev.instrument}
            </span>
          )}
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.10em',
            color: 'var(--t3)', fontFamily: 'var(--font-mono)',
            background: 'var(--d6)', border: '1px solid var(--b1)',
            borderRadius: 2, padding: '1px 6px',
          }}>
            {ev.daynight === 'D' ? 'DAY' : ev.daynight === 'N' ? 'NIGHT' : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 3, background: 'var(--d6)', borderRadius: 1, overflow: 'hidden', maxWidth: 130 }}>
            <div style={{ height: '100%', width: `${barW}%`, background: fc, borderRadius: 1, transition: 'width 0.4s ease' }}/>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: fc, fontVariantNumeric: 'tabular-nums' }}>
            {ev.frp != null ? `${ev.frp.toLocaleString()} MW` : '—'}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: fc, opacity: 0.75, fontFamily: 'var(--font-mono)' }}>
            {frpTier(ev.frp).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Confidence */}
      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
        <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>Conf.</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--t2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={confidenceLabel(ev.confidence)}>
          {confidenceLabel(ev.confidence)}
        </span>
      </div>

      {/* Brightness */}
      <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
        <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>K</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--t2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={ev.brightness != null ? `${ev.brightness.toFixed(1)} K` : '\u2014'}>
          {ev.brightness != null ? ev.brightness.toFixed(1) : '\u2014'}
        </span>
      </div>

      {/* Coords */}
      <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}
        title={`${ev.latitude.toFixed(4)}\u00b0, ${ev.longitude.toFixed(4)}\u00b0`}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ev.latitude.toFixed(2)}\u00b0
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ev.longitude.toFixed(2)}\u00b0
        </span>
      </div>

      {/* Event ID */}
      <div style={{ padding: '0 10px', overflow: 'hidden' }}>
        <span
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: selected ? 'var(--cyan)' : 'var(--t4)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={ev.event_id ?? '\u2014'}>
          {ev.event_id ?? '\u2014'}
        </span>
        {ev.worldcover_class_name && (
          <span style={{ fontSize: 10, color: 'var(--t4)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={ev.worldcover_class_name}>
            {ev.worldcover_class_name}
          </span>
        )}
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const { events, status, error, selectedEvent, setSelectedEvent } = useAppContext()
  const navigate = useNavigate()
  const [filters, setFilters] = useState<Filters>(DEFAULT)

  const satellites = useMemo(() => [...new Set(events.map(e => e.satellite).filter(Boolean) as string[])].sort(), [events])
  const sources    = useMemo(() => [...new Set(events.map(e => e.firms_source).filter(Boolean) as string[])].sort(), [events])

  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters(p => ({ ...p, [k]: v }))
  const reset = () => setFilters(DEFAULT)

  const filtered = useMemo(() => events.filter(ev => {
    if (filters.satellite && ev.satellite !== filters.satellite) return false
    if (filters.source    && ev.firms_source !== filters.source) return false
    if (filters.daynight  && ev.daynight !== filters.daynight)   return false
    if (filters.minFrp != null && (ev.frp == null || ev.frp < filters.minFrp)) return false
    if (filters.worldcover === 'enriched' && ev.worldcover_version == null) return false
    if (filters.worldcover === 'pending'  && ev.worldcover_version != null) return false
    return true
  }), [events, filters])

  const anyFilter = !!(filters.satellite || filters.source || filters.daynight || filters.minFrp != null || filters.worldcover)

  function handleSelect(evId: string | null) {
    if (!evId) return
    const found = events.find(e => e.event_id === evId)
    if (found) { setSelectedEvent(found); navigate('/risk') }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--d1)' }}>

      {/* Header */}
      <div style={{ padding: '12px 18px 10px', background: 'var(--d2)', borderBottom: '1px solid var(--b1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
              <div style={{ width: 3, height: 16, background: 'var(--cyan)', borderRadius: 1, boxShadow: '0 0 6px var(--cyan)' }}/>
              <h1 style={{ fontSize: 17, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.01em' }}>
                Observation Log
              </h1>
            </div>
            <p style={{ fontSize: 12, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              FIRMS DETECTION ARCHIVE ·{' '}
              <span style={{ color: 'var(--t2)' }}>{events.length.toLocaleString()}</span> LOADED
              {filtered.length !== events.length && (
                <span style={{ color: 'var(--cyan)' }}> · {filtered.length.toLocaleString()} FILTERED</span>
              )}
            </p>
          </div>
          {anyFilter && (
            <button className="btn" onClick={reset} style={{ gap: 6, fontSize: 11 }}>
              <X size={10}/> Clear filters
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4, flexShrink: 0 }}>
            <SlidersHorizontal size={12} color="var(--t4)"/>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
              FILTER
            </span>
          </div>
          {satellites.map(s => (
            <button key={s} className={`chip${filters.satellite === s ? ' active' : ''}`}
              onClick={() => setF('satellite', filters.satellite === s ? '' : s)}>{s}</button>
          ))}
          {satellites.length > 0 && <div style={{ width: 1, height: 16, background: 'var(--b1)', flexShrink: 0 }}/>}
          {sources.map(s => (
            <button key={s} className={`chip${filters.source === s ? ' active' : ''}`}
              onClick={() => setF('source', filters.source === s ? '' : s)}>{s}</button>
          ))}
          {sources.length > 0 && <div style={{ width: 1, height: 16, background: 'var(--b1)', flexShrink: 0 }}/>}
          <button className={`chip${filters.daynight === 'D' ? ' active' : ''}`}
            onClick={() => setF('daynight', filters.daynight === 'D' ? '' : 'D')}>Daytime</button>
          <button className={`chip${filters.daynight === 'N' ? ' active' : ''}`}
            onClick={() => setF('daynight', filters.daynight === 'N' ? '' : 'N')}>Nighttime</button>
          <div style={{ width: 1, height: 16, background: 'var(--b1)', flexShrink: 0 }}/>
          {[50, 200, 500, 1000].map(f => (
            <button key={f} className={`chip${filters.minFrp === f ? ' active' : ''}`}
              onClick={() => setF('minFrp', filters.minFrp === f ? null : f)}>FRP ≥ {f}</button>
          ))}
          <div style={{ width: 1, height: 16, background: 'var(--b1)', flexShrink: 0 }}/>
          <button className={`chip${filters.worldcover === 'enriched' ? ' active' : ''}`}
            onClick={() => setF('worldcover', filters.worldcover === 'enriched' ? '' : 'enriched')}>WC Enriched</button>
          <button className={`chip${filters.worldcover === 'pending' ? ' active' : ''}`}
            onClick={() => setF('worldcover', filters.worldcover === 'pending' ? '' : 'pending')}>WC Pending</button>
        </div>
      </div>

      {/* Column headers — same grid as rows */}
      <div style={{
        display: 'grid', gridTemplateColumns: GRID,
        alignItems: 'center',
        padding: '6px 0', background: 'var(--d4)',
        borderBottom: '1px solid var(--b1)', flexShrink: 0,
        minWidth: 0,
      }}>
        <div/>
        {[
          { label: 'TIME / DATE',       pad: '0 14px' },
          { label: 'SATELLITE \u00b7 SIGNAL', pad: '0 14px 0 0' },
          { label: 'CONF.',             pad: '0 12px' },
          { label: 'BRIGHT (K)',        pad: '0 10px' },
          { label: 'COORDS',            pad: '0 10px' },
          { label: 'EVENT ID',          pad: '0 10px' },
        ].map(({ label, pad }) => (
          <div key={label} style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.10em', color: 'var(--t3)',
            fontFamily: 'var(--font-mono)', padding: pad,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{label}</div>
        ))}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {status === 'loading' && (
          <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[...Array(8)].map((_, i) => <div key={i} className="skeleton" style={{ height: 52, borderRadius: 5 }}/>)}
          </div>
        )}
        {status === 'error' && (
          <div style={{ padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
            <WifiOff size={24} color="var(--err)"/>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--err)', fontWeight: 700, letterSpacing: '0.08em' }}>
              DATA CONNECTION LOST
            </div>
            <div style={{ fontSize: 12, color: 'var(--t4)', maxWidth: 320, lineHeight: 1.6 }}>
              Unable to retrieve live ThermalWatch telemetry. {error}
            </div>
          </div>
        )}
        {status === 'empty' && (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--t4)', letterSpacing: '0.10em' }}>
              NO DETECTIONS IN CURRENT RANGE
            </div>
          </div>
        )}
        {anyFilter && filtered.length === 0 && status !== 'loading' && (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--t4)', letterSpacing: '0.10em' }}>
              NO EVENTS MATCH CURRENT FILTERS
            </div>
          </div>
        )}
        {filtered.map(ev => (
          <ObsRow
            key={ev.event_id ?? `${ev.latitude},${ev.longitude}`}
            ev={ev}
            selected={selectedEvent?.event_id === ev.event_id}
            onSelect={() => handleSelect(ev.event_id)}
          />
        ))}
      </div>
    </div>
  )
}
