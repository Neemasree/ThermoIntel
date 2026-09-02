/**
 * EventInspector — Professional intelligence console panel.
 * Real data only. Strong header, organized sections, values larger than labels.
 */
import React from 'react'
import type { ApiThermalEvent } from '../types/api'
import { formatAcqTime, frpColor, frpTier, confidenceLabel } from '../utils/eventUtils'

interface Props {
  event: ApiThermalEvent | null
  status: string
}

/* ── Section header ── */
function ISection({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.16em', color: 'var(--t4)',
      fontFamily: 'var(--font-mono)',
      padding: '10px 0 5px',
      borderBottom: '1px solid var(--b1)',
      marginBottom: 5,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <div style={{ width: 12, height: 1, background: 'var(--b3)', flexShrink: 0 }}/>
      {children}
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--b1), transparent)' }}/>
    </div>
  )
}

/* ── Field row ── */
function IField({
  label, value, mono = true, accent, large,
}: {
  label: string; value: React.ReactNode
  mono?: boolean; accent?: string; large?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      gap: 8, padding: '3px 0', borderBottom: '1px solid var(--b0)',
    }}>
      <span style={{
        fontSize: 9, color: 'var(--t4)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: large ? 14 : 11,
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        fontWeight: large ? 700 : 500,
        color: accent ?? 'var(--t1)',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        wordBreak: 'break-all',
        lineHeight: 1.3,
      }}>
        {value}
      </span>
    </div>
  )
}

/* ── Enrichment status pill ── */
function EnrichPill({ ok, label }: { ok: 'ok' | 'pending' | 'nodata'; label: string }) {
  const cfg = {
    ok:      { color: 'var(--ok)',   bg: 'var(--ok-bg)',   border: 'var(--ok-b)' },
    pending: { color: 'var(--t3)',   bg: 'var(--d5)',      border: 'var(--b1)'   },
    nodata:  { color: 'var(--warn)', bg: 'var(--amber-bg)',border: 'var(--amber-border)' },
  }[ok]

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.10em',
      color: cfg.color, background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 'var(--r-xs)', padding: '2px 7px',
      fontFamily: 'var(--font-mono)',
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: cfg.color, flexShrink: 0 }}/>
      {ok === 'ok' ? `${label} ENRICHED` : ok === 'nodata' ? `${label} NODATA` : `${label} PENDING`}
    </span>
  )
}

/* ── OSM distance row ── */
function OsmDist({ label, distM }: { label: string; distM: number | null }) {
  if (distM == null) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '3px 0', borderBottom: '1px solid var(--b0)',
      }}>
        <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t4)' }}>—</span>
      </div>
    )
  }
  const km = (distM / 1000).toFixed(2)
  const near = distM < 500
  const mid  = distM < 2000
  const c = near ? 'var(--err)' : mid ? 'var(--warn)' : 'var(--t2)'
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '3px 0', borderBottom: '1px solid var(--b0)',
    }}>
      <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {near && (
          <span style={{
            fontSize: 7, fontWeight: 700, letterSpacing: '0.10em',
            color: 'var(--err)', background: 'var(--err-bg)',
            border: '1px solid var(--err-b)',
            borderRadius: 'var(--r-xs)', padding: '1px 4px',
            fontFamily: 'var(--font-mono)',
          }}>
            NEAR
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: c, fontVariantNumeric: 'tabular-nums' }}>
          {km} km
        </span>
      </div>
    </div>
  )
}

export default function EventInspector({ event: ev, status }: Props) {
  /* Empty / loading state */
  if (!ev) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 28, textAlign: 'center', gap: 16,
      }}>
        {/* Orbital empty-state indicator */}
        <svg viewBox="0 0 48 48" width="40" height="40" opacity="0.25">
          <circle cx="24" cy="24" r="20" fill="none" stroke="var(--t3)" strokeWidth="0.8"/>
          <circle cx="24" cy="24" r="13" fill="none" stroke="var(--t3)" strokeWidth="0.6"
            strokeDasharray="3 4"/>
          <circle cx="24" cy="24" r="3"  fill="var(--t4)"/>
          <line x1="24" y1="4"  x2="24" y2="9"  stroke="var(--t3)" strokeWidth="0.8"/>
          <line x1="24" y1="39" x2="24" y2="44" stroke="var(--t3)" strokeWidth="0.8"/>
          <line x1="4"  y1="24" x2="9"  y2="24" stroke="var(--t3)" strokeWidth="0.8"/>
          <line x1="39" y1="24" x2="44" y2="24" stroke="var(--t3)" strokeWidth="0.8"/>
        </svg>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            fontFamily: 'var(--font-mono)', color: 'var(--t3)',
            marginBottom: 6, textTransform: 'uppercase',
          }}>
            {status === 'loading' ? 'Acquiring Feed' : 'No Selection'}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--t4)', lineHeight: 1.7,
            fontFamily: 'var(--font-sans)', maxWidth: 180,
          }}>
            {status === 'loading'
              ? 'Fetching thermal intelligence from backend.'
              : 'Select a thermal event on the map or observation stream to inspect its full record.'}
          </div>
        </div>
      </div>
    )
  }

  const wcStatus: 'ok' | 'nodata' | 'pending' =
    ev.worldcover_version != null
      ? (ev.worldcover_class_name != null ? 'ok' : 'nodata')
      : 'pending'

  const osmAny = ev.distance_to_industrial != null || ev.distance_to_refinery != null || ev.distance_to_road != null
  const osmStatus: 'ok' | 'pending' = osmAny ? 'ok' : 'pending'
  const frpC = frpColor(ev.frp)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 16px' }} className="slide-in">

      {/* ── Thermal observation header ── */}
      <div style={{
        margin: '10px 0 6px',
        background: 'linear-gradient(135deg, var(--d5) 0%, var(--d4) 100%)',
        border: '1px solid var(--b2)',
        borderRadius: 'var(--r-md)',
        padding: '11px 13px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Thermal accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${frpC}, transparent)`,
          opacity: 0.8,
        }}/>
        <div style={{
          fontSize: 7.5, fontWeight: 700, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: 'var(--t4)',
          fontFamily: 'var(--font-mono)', marginBottom: 5,
        }}>
          Thermal Observation
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          fontWeight: 600, color: 'var(--cyan)',
          wordBreak: 'break-all', lineHeight: 1.4, marginBottom: 6,
        }}>
          {ev.event_id ?? 'ID UNAVAILABLE'}
        </div>
        {/* Quick stats row */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 7.5, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.10em', marginBottom: 1 }}>FRP</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: frpC, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {ev.frp != null ? ev.frp.toLocaleString() : '—'}
              <span style={{ fontSize: 9, color: 'var(--t3)', marginLeft: 3 }}>MW</span>
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--b1)', flexShrink: 0, alignSelf: 'stretch' }}/>
          <div>
            <div style={{ fontSize: 7.5, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.10em', marginBottom: 1 }}>TIER</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: frpC, fontFamily: 'var(--font-mono)', lineHeight: 1, paddingTop: 2 }}>
              {frpTier(ev.frp).toUpperCase()}
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--b1)', flexShrink: 0, alignSelf: 'stretch' }}/>
          <div>
            <div style={{ fontSize: 7.5, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.10em', marginBottom: 1 }}>D/N</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', fontFamily: 'var(--font-mono)', lineHeight: 1, paddingTop: 2 }}>
              {ev.daynight === 'D' ? 'DAY' : ev.daynight === 'N' ? 'NIGHT' : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Location ── */}
      <ISection>Location</ISection>
      <IField label="Lat"  value={`${ev.latitude.toFixed(5)}°`}  large accent="var(--t1)"/>
      <IField label="Lon"  value={`${ev.longitude.toFixed(5)}°`} large accent="var(--t1)"/>

      {/* ── Acquisition ── */}
      <ISection>Acquisition</ISection>
      <IField label="Date" value={ev.acquisition_date ?? '—'}/>
      <IField label="Time" value={formatAcqTime(ev.acquisition_time)}/>
      <IField label="D/N"  value={ev.daynight === 'D' ? 'Daytime' : ev.daynight === 'N' ? 'Nighttime' : '—'}/>

      {/* ── Thermal Signal ── */}
      <ISection>Thermal Signal</ISection>
      <IField label="FRP"        value={ev.frp        != null ? `${ev.frp.toLocaleString()} MW` : '—'} accent={frpC} large/>
      <IField label="Brightness" value={ev.brightness != null ? `${ev.brightness.toFixed(1)} K`  : '—'}/>
      <IField label="Confidence" value={confidenceLabel(ev.confidence)}/>
      <IField label="Intensity"  value={frpTier(ev.frp).toUpperCase()} accent={frpC}/>

      {/* ── Satellite ── */}
      <ISection>Satellite</ISection>
      <IField label="Platform"   value={ev.satellite   ?? '—'}/>
      <IField label="Instrument" value={ev.instrument  ?? '—'}/>
      <IField label="Source"     value={ev.firms_source ?? '—'}/>

      {/* ── Land Cover ── */}
      <ISection>Land Cover</ISection>
      <IField
        label="Class"
        value={ev.worldcover_class_name ?? (ev.worldcover_version != null ? 'No data' : 'Pending')}
        accent={ev.worldcover_class_name ? 'var(--t1)' : 'var(--t4)'}
      />
      <IField label="Version" value={ev.worldcover_version ?? '—'}/>
      {ev.worldcover_enriched_at && (
        <IField
          label="Enriched"
          value={new Date(ev.worldcover_enriched_at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'}
        />
      )}
      <div style={{ marginTop: 6 }}>
        <EnrichPill ok={wcStatus} label="WorldCover"/>
      </div>

      {/* ── Infrastructure Context ── */}
      <ISection>Infrastructure</ISection>
      {osmStatus === 'pending' ? (
        <div style={{
          padding: '10px 12px',
          background: 'var(--d5)',
          border: '1px solid var(--b1)',
          borderRadius: 'var(--r-md)',
          marginBottom: 6,
        }}>
          <div style={{ fontSize: 10, color: 'var(--t2)', marginBottom: 3, fontFamily: 'var(--font-sans)' }}>
            OSM enrichment pending
          </div>
          <div style={{ fontSize: 9, color: 'var(--t4)', lineHeight: 1.6, fontFamily: 'var(--font-sans)' }}>
            Facility distances will appear once the OSM enrichment pipeline processes this event.
          </div>
        </div>
      ) : (
        <>
          <OsmDist label="Industrial"   distM={ev.distance_to_industrial   ?? null}/>
          <OsmDist label="Refinery"     distM={ev.distance_to_refinery     ?? null}/>
          <OsmDist label="Power Plant"  distM={ev.distance_to_powerplant   ?? null}/>
          <OsmDist label="Mine"         distM={ev.distance_to_mine         ?? null}/>
          <OsmDist label="Gas Facility" distM={ev.distance_to_gas_facility ?? null}/>
          <OsmDist label="Road"         distM={ev.distance_to_road         ?? null}/>
          <div style={{ marginTop: 6 }}>
            <EnrichPill ok="ok" label="OSM"/>
          </div>
        </>
      )}
    </div>
  )
}
