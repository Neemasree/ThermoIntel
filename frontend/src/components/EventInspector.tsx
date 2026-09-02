import React from 'react'
import type { ApiThermalEvent } from '../types/api'
import { formatAcqTime, frpColor, frpTier, confidenceLabel } from '../utils/eventUtils'

interface Props {
  event: ApiThermalEvent | null
  status: string
}

function Sec({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.14em', color: 'var(--t3)',
      fontFamily: 'var(--font-mono)',
      padding: '12px 0 6px',
      borderBottom: '1px solid var(--b1)',
      marginBottom: 6,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div style={{ width: 14, height: 1.5, background: 'var(--b3)', flexShrink: 0 }}/>
      {title}
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--b1), transparent)' }}/>
    </div>
  )
}

function Field({ label, value, mono = true, accent, large }: {
  label: string; value: React.ReactNode; mono?: boolean; accent?: string; large?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      gap: 10, padding: '5px 0', borderBottom: '1px solid var(--b0)',
    }}>
      <span style={{
        fontSize: 11, color: 'var(--t3)',
        fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
        textTransform: 'uppercase', flexShrink: 0,
      }}>{label}</span>
      <span style={{
        fontSize: large ? 16 : 13,
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        fontWeight: large ? 700 : 500,
        color: accent ?? 'var(--t1)',
        textAlign: 'right', fontVariantNumeric: 'tabular-nums',
        wordBreak: 'break-all', lineHeight: 1.3,
      }}>{value}</span>
    </div>
  )
}

function Pill({ ok, label }: { ok: 'ok' | 'pending' | 'nodata'; label: string }) {
  const cfg = {
    ok:      { color: 'var(--ok)',   bg: 'var(--ok-bg)',   border: 'var(--ok-b)' },
    pending: { color: 'var(--t3)',   bg: 'var(--d5)',      border: 'var(--b1)' },
    nodata:  { color: 'var(--warn)', bg: 'var(--amber-bg)',border: 'var(--amber-border)' },
  }[ok]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em',
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: 'var(--r-xs)', padding: '3px 8px', fontFamily: 'var(--font-mono)',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }}/>
      {ok === 'ok' ? `${label} ENRICHED` : ok === 'nodata' ? `${label} NODATA` : `${label} PENDING`}
    </span>
  )
}

function OsmRow({ label, distKm }: { label: string; distKm: number | null }) {
  if (distKm == null) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '5px 0', borderBottom: '1px solid var(--b0)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--t4)' }}>—</span>
      </div>
    )
  }
  // Stored in KM — confirmed from live DB audit
  const near = distKm < 0.5
  const mid  = distKm < 2.0
  const c = near ? 'var(--err)' : mid ? 'var(--warn)' : 'var(--t2)'
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px 0', borderBottom: '1px solid var(--b0)',
    }}>
      <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {near && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
            color: 'var(--err)', background: 'var(--err-bg)',
            border: '1px solid var(--err-b)', borderRadius: 'var(--r-xs)',
            padding: '1px 5px', fontFamily: 'var(--font-mono)',
          }}>NEAR</span>
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: c, fontVariantNumeric: 'tabular-nums' }}>
          {distKm.toFixed(2)} km
        </span>
      </div>
    </div>
  )
}

export default function EventInspector({ event: ev, status }: Props) {
  if (!ev) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 32, textAlign: 'center', gap: 20,
      }}>
        <svg viewBox="0 0 52 52" width="44" height="44" opacity="0.22">
          <circle cx="26" cy="26" r="22" fill="none" stroke="var(--t2)" strokeWidth="1"/>
          <circle cx="26" cy="26" r="14" fill="none" stroke="var(--t2)" strokeWidth="0.8" strokeDasharray="4 4"/>
          <circle cx="26" cy="26" r="4" fill="var(--t3)"/>
          {[0,90,180,270].map(a => {
            const rad = a * Math.PI / 180
            return <line key={a}
              x1={26 + 20*Math.cos(rad)} y1={26 + 20*Math.sin(rad)}
              x2={26 + 23*Math.cos(rad)} y2={26 + 23*Math.sin(rad)}
              stroke="var(--t2)" strokeWidth="1"/>
          })}
        </svg>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', color: 'var(--t3)', marginBottom: 8, textTransform: 'uppercase' }}>
            {status === 'loading' ? 'Acquiring Feed…' : 'No Selection'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--t4)', lineHeight: 1.7, maxWidth: 200 }}>
            {status === 'loading'
              ? 'Fetching thermal intelligence.'
              : 'Select a thermal event on the map or observation stream.'}
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
  const frpC = frpColor(ev.frp)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 20px' }} className="slide-in">

      {/* Header block */}
      <div style={{
        margin: '12px 0 8px',
        background: 'linear-gradient(135deg, var(--d5) 0%, var(--d4) 100%)',
        border: '1px solid var(--b2)',
        borderRadius: 'var(--r-md)',
        padding: '14px 15px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${frpC}, transparent)`, opacity: 0.9 }}/>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--t4)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
          Thermal Observation
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--cyan)', wordBreak: 'break-all', lineHeight: 1.4, marginBottom: 10 }}>
          {ev.event_id ?? 'ID UNAVAILABLE'}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.10em', marginBottom: 2 }}>FRP</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: frpC, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {ev.frp != null ? ev.frp.toLocaleString() : '—'}
              <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 4 }}>MW</span>
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--b2)', flexShrink: 0, alignSelf: 'stretch' }}/>
          <div>
            <div style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.10em', marginBottom: 2 }}>TIER</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: frpC, fontFamily: 'var(--font-mono)', lineHeight: 1, paddingTop: 3 }}>
              {frpTier(ev.frp).toUpperCase()}
            </div>
          </div>
          <div style={{ width: 1, background: 'var(--b2)', flexShrink: 0, alignSelf: 'stretch' }}/>
          <div>
            <div style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.10em', marginBottom: 2 }}>D/N</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t2)', fontFamily: 'var(--font-mono)', lineHeight: 1, paddingTop: 3 }}>
              {ev.daynight === 'D' ? 'DAY' : ev.daynight === 'N' ? 'NIGHT' : '—'}
            </div>
          </div>
        </div>
      </div>

      <Sec title="Location"/>
      <Field label="Lat"  value={`${ev.latitude.toFixed(5)}°`}  large accent="var(--t1)"/>
      <Field label="Lon"  value={`${ev.longitude.toFixed(5)}°`} large accent="var(--t1)"/>

      <Sec title="Acquisition"/>
      <Field label="Date" value={ev.acquisition_date ?? '—'}/>
      <Field label="Time" value={formatAcqTime(ev.acquisition_time)}/>
      <Field label="D/N"  value={ev.daynight === 'D' ? 'Daytime' : ev.daynight === 'N' ? 'Nighttime' : '—'}/>

      <Sec title="Thermal Signal"/>
      <Field label="FRP"        value={ev.frp        != null ? `${ev.frp.toLocaleString()} MW` : '—'} accent={frpC} large/>
      <Field label="Brightness" value={ev.brightness != null ? `${ev.brightness.toFixed(1)} K`  : '—'}/>
      <Field label="Confidence" value={confidenceLabel(ev.confidence)}/>
      <Field label="Intensity"  value={frpTier(ev.frp).toUpperCase()} accent={frpC}/>

      <Sec title="Satellite"/>
      <Field label="Platform"   value={ev.satellite   ?? '—'}/>
      <Field label="Instrument" value={ev.instrument  ?? '—'}/>
      <Field label="Source"     value={ev.firms_source ?? '—'}/>

      <Sec title="Land Cover"/>
      <Field
        label="Class"
        value={ev.worldcover_class_name ?? (ev.worldcover_version != null ? 'No data' : 'Pending')}
        accent={ev.worldcover_class_name ? 'var(--t1)' : 'var(--t4)'}
      />
      <Field label="Version" value={ev.worldcover_version ?? '—'}/>
      {ev.worldcover_enriched_at && (
        <Field
          label="Enriched"
          value={new Date(ev.worldcover_enriched_at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'}
        />
      )}
      <div style={{ marginTop: 8 }}><Pill ok={wcStatus} label="WorldCover"/></div>

      <Sec title="Infrastructure"/>
      {!osmAny ? (
        <div style={{
          padding: '12px 14px', background: 'var(--d5)',
          border: '1px solid var(--b1)', borderRadius: 'var(--r-md)', marginBottom: 8,
        }}>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>OSM enrichment pending</div>
          <div style={{ fontSize: 11, color: 'var(--t4)', lineHeight: 1.6 }}>
            Facility distances will appear once the OSM enrichment pipeline processes this event.
          </div>
        </div>
      ) : (
        <>
          <OsmRow label="Industrial"   distKm={ev.distance_to_industrial   ?? null}/>
          <OsmRow label="Refinery"     distKm={ev.distance_to_refinery     ?? null}/>
          <OsmRow label="Power Plant"  distKm={ev.distance_to_powerplant   ?? null}/>
          <OsmRow label="Mine"         distKm={ev.distance_to_mine         ?? null}/>
          <OsmRow label="Gas Facility" distKm={ev.distance_to_gas_facility ?? null}/>
          <OsmRow label="Road"         distKm={ev.distance_to_road         ?? null}/>
          <div style={{ marginTop: 8 }}><Pill ok="ok" label="OSM"/></div>
        </>
      )}
    </div>
  )
}
