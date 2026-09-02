/**
 * HistoryPage — Observation Log
 * Professional satellite observation archive.
 * event_id is always string — never coerced to number.
 */
import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { WifiOff, SlidersHorizontal, X } from 'lucide-react'
import { useAppContext } from '../App'
import { frpColor, formatAcqTime, confidenceLabel, frpTier } from '../utils/eventUtils'
import type { ApiThermalEvent } from '../types/api'

/* ── Filter state ── */
interface Filters {
  satellite: string
  source: string
  daynight: '' | 'D' | 'N'
  minFrp: number | null
  worldcover: '' | 'enriched' | 'pending'
}
const DEFAULT: Filters = { satellite: '', source: '', daynight: '', minFrp: null, worldcover: '' }

/* ── Observation row ── */
function ObsRow({ ev, selected, onSelect }: {
  ev: ApiThermalEvent; selected: boolean; onSelect: () => void
}) {
  const fc = frpColor(ev.frp)
  const frpMax = 3000
  const barW = ev.frp != null ? Math.min(100, (ev.frp / frpMax) * 100) : 0

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'grid',
        gridTemplateColumns: '4px 140px 1fr 130px 72px 80px 72px',
        alignItems: 'center',
        padding: '0 14px 0 0',
        minHeight: 46,
        cursor: 'pointer',
        borderBottom: '1px solid var(--b0)',
        background: selected ? 'var(--d7)' : 'transparent',
        borderLeft: `3px solid ${selected ? 'var(--cyan)' : 'transparent'}`,
        transition: 'background var(--ease), border-color var(--ease)',
        position: 'relative',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--d5)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {/* FRP intensity color swatch */}
      <div style={{ width: 4, alignSelf: 'stretch', background: fc, opacity: 0.7, flexShrink: 0 }}/>

      {/* Time + date */}
      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t1)', fontWeight: 500, letterSpacing: '0.04em' }}>
          {formatAcqTime(ev.acquisition_time)}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t4)', letterSpacing: '0.04em' }}>
          {ev.acquisition_date ?? '—'}
        </span>
      </div>

      {/* Main event info */}
      <div style={{ padding: '8px 12px 8px 0', minWidth: 0 }}>
        {/* Satellite + source */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)' }}>
            {ev.satellite ?? '—'}
          </span>
          {ev.instrument && (
            <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
              {ev.instrument}
            </span>
          )}
          <span style={{
            fontSize: 8, fontWeight: 700, letterSpacing: '0.10em',
            color: 'var(--t4)', fontFamily: 'var(--font-mono)',
            background: 'var(--d6)', border: '1px solid var(--b1)',
            borderRadius: 2, padding: '1px 5px',
          }}>
            {ev.daynight === 'D' ? 'DAY' : ev.daynight === 'N' ? 'NIGHT' : '—'}
          </span>
        </div>

        {/* FRP bar + value */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 2, background: 'var(--d6)', borderRadius: 1, overflow: 'hidden', maxWidth: 120 }}>
            <div style={{ height: '100%', width: `${barW}%`, background: fc, borderRadius: 1, transition: 'width 0.4s ease' }}/>
          </div>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
            color: fc, fontVariantNumeric: 'tabular-nums',
          }}>
            {ev.frp != null ? `${ev.frp.toLocaleString()} MW` : '—'}
          </span>
          <span style={{
            fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
            color: fc, opacity: 0.7, fontFamily: 'var(--font-mono)',
          }}>
            {frpTier(ev.frp).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Confidence */}
      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
          Confidence
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>
          {confidenceLabel(ev.confidence)}
        </span>
      </div>

      {/* Brightness */}
      <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
          Brightness
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>
          {ev.brightness != null ? `${ev.brightness.toFixed(1)} K` : '—'}
        </span>
      </div>

      {/* Coordinates */}
      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-end' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
          {ev.latitude.toFixed(3)}°
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
          {ev.longitude.toFixed(3)}°
        </span>
      </div>

      {/* Event ID */}
      <div style={{ padding: '0 0 0 8px', overflow: 'hidden' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 8.5,
          color: selected ? 'var(--cyan)' : 'var(--t4)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'block', maxWidth: 100,
        }}>
          {ev.event_id ?? '—'}
        </span>
        {ev.worldcover_class_name && (
          <span style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-sans)' }}>
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

  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters(p => ({ ...p, [k]: v }))
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

  const anyFilter = filters.satellite || filters.source || filters.daynight || filters.minFrp != null || filters.worldcover

  function handleSelect(evId: string | null) {
    if (evId == null) return
    const found = events.find(e => e.event_id === evId) // always string comparison
    if (found) { setSelectedEvent(found); navigate('/risk') }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--d1)' }}>

      {/* ── Header ── */}
      <div style={{
        padding: '10px 16px 8px',
        background: 'var(--d2)',
        borderBottom: '1px solid var(--b1)',
        flexShrink: 0,
      }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ width: 2, height: 14, background: 'var(--cyan)', borderRadius: 1, boxShadow: '0 0 4px var(--cyan)' }}/>
              <h1 style={{
                fontSize: 15, fontWeight: 800, color: 'var(--t1)',
                letterSpacing: '-0.01em', fontFamily: 'var(--font-sans)',
              }}>
                Observation Log
              </h1>
            </div>
            <p style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              FIRMS SATELLITE DETECTION ARCHIVE ·{' '}
              <span style={{ color: 'var(--t2)' }}>{events.length.toLocaleString()}</span> LOADED
              {filtered.length !== events.length && (
                <span style={{ color: 'var(--cyan)' }}> · {filtered.length.toLocaleString()} FILTERED</span>
              )}
            </p>
          </div>
          {anyFilter && (
            <button className="btn" onClick={reset} style={{ gap: 5, fontSize: 9 }}>
              <X size={9}/> Clear filters
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 4, flexShrink: 0 }}>
            <SlidersHorizontal size={10} color="var(--t4)"/>
            <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
              FILTER
            </span>
          </div>

          {satellites.map(s => (
            <button key={s} className={`chip${filters.satellite === s ? ' active' : ''}`}
              onClick={() => setF('satellite', filters.satellite === s ? '' : s)}>{s}
            </button>
          ))}
          {satellites.length > 0 && <div style={{ width: 1, height: 14, background: 'var(--b1)', flexShrink: 0 }}/>}

          {sources.map(s => (
            <button key={s} className={`chip${filters.source === s ? ' active' : ''}`}
              onClick={() => setF('source', filters.source === s ? '' : s)}>{s}
            </button>
          ))}
          {sources.length > 0 && <div style={{ width: 1, height: 14, background: 'var(--b1)', flexShrink: 0 }}/>}

          <button className={`chip${filters.daynight === 'D' ? ' active' : ''}`}
            onClick={() => setF('daynight', filters.daynight === 'D' ? '' : 'D')}>Daytime</button>
          <button className={`chip${filters.daynight === 'N' ? ' active' : ''}`}
            onClick={() => setF('daynight', filters.daynight === 'N' ? '' : 'N')}>Nighttime</button>

          <div style={{ width: 1, height: 14, background: 'var(--b1)', flexShrink: 0 }}/>

          {[50, 200, 500, 1000].map(f => (
            <button key={f} className={`chip${filters.minFrp === f ? ' active' : ''}`}
              onClick={() => setF('minFrp', filters.minFrp === f ? null : f)}>FRP ≥ {f}</button>
          ))}

          <div style={{ width: 1, height: 14, background: 'var(--b1)', flexShrink: 0 }}/>

          <button className={`chip${filters.worldcover === 'enriched' ? ' active' : ''}`}
            onClick={() => setF('worldcover', filters.worldcover === 'enriched' ? '' : 'enriched')}>WC Enriched</button>
          <button className={`chip${filters.worldcover === 'pending' ? ' active' : ''}`}
            onClick={() => setF('worldcover', filters.worldcover === 'pending' ? '' : 'pending')}>WC Pending</button>
        </div>
      </div>

      {/* ── Column headers ── */}
      {filtered.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '4px 140px 1fr 130px 72px 80px 72px',
          alignItems: 'center',
          padding: '5px 14px 5px 0',
          background: 'var(--d4)',
          borderBottom: '1px solid var(--b1)',
          flexShrink: 0,
        }}>
          <div/>
          {['TIME / DATE', 'SATELLITE · SIGNAL', 'CONFIDENCE', 'BRIGHTNESS', 'COORDINATES', 'EVENT ID'].map(h => (
            <div key={h} style={{
              fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.12em', color: 'var(--t4)',
              fontFamily: 'var(--font-mono)',
              padding: '0 12px',
            }}>
              {h}
            </div>
          ))}
        </div>
      )}

      {/* ── Rows ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {status === 'loading' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...Array(10)].map((_, i) => <div key={i} className="skeleton" style={{ height: 46, borderRadius: 4 }}/>)}
          </div>
        )}

        {status === 'error' && (
          <div style={{
            padding: '40px 20px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 12, textAlign: 'center',
          }}>
            <WifiOff size={20} color="var(--err)"/>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--err)', fontWeight: 700, letterSpacing: '0.08em' }}>
              DATA CONNECTION LOST
            </div>
            <div style={{ fontSize: 11, color: 'var(--t4)', maxWidth: 300, lineHeight: 1.6 }}>
              Unable to retrieve live ThermalWatch telemetry. {error}
            </div>
          </div>
        )}

        {status === 'empty' && (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t4)', letterSpacing: '0.10em' }}>
              NO DETECTIONS IN CURRENT RANGE
            </div>
          </div>
        )}

        {anyFilter && filtered.length === 0 && status !== 'loading' && (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t4)', letterSpacing: '0.10em' }}>
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
