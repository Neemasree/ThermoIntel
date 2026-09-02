/**
 * RiskPage — Intelligence Assembly Board
 * Real evidence cards. ML pipeline clearly pending. No fabricated scores.
 */
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../App'
import { MapPin, CornerDownRight } from 'lucide-react'
import { formatAcqTime, confidenceLabel, frpColor, frpTier } from '../utils/eventUtils'
import { deriveRiskScore, deriveRiskLevel, getRiskColor, getRiskBg, getRiskBorder } from '../utils/risk'
import type { ApiThermalEvent } from '../types/api'

/* ── Evidence card ── */
function EvidenceCard({ title, accent, children }: {
  title: string; accent?: string; children: React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--d4)',
      border: `1px solid ${accent ? accent + '28' : 'var(--b1)'}`,
      borderTop: `2px solid ${accent ?? 'var(--b2)'}`,
      borderRadius: 'var(--r-md)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 13px 7px',
        borderBottom: '1px solid var(--b1)',
        display: 'flex', alignItems: 'center', gap: 6,
        background: accent ? `${accent}08` : 'transparent',
      }}>
        <div style={{ width: 4, height: 4, borderRadius: '50%', background: accent ?? 'var(--t4)', flexShrink: 0 }}/>
        <span style={{
          fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.16em', color: accent ?? 'var(--t3)',
          fontFamily: 'var(--font-mono)',
        }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '10px 13px' }}>{children}</div>
    </div>
  )
}

/* ── Evidence field ── */
function EF({ label, value, accent, large }: {
  label: string; value: string; accent?: string; large?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '4px 0', borderBottom: '1px solid var(--b0)', gap: 8,
    }}>
      <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{
        fontSize: large ? 14 : 11, fontFamily: 'var(--font-mono)',
        fontWeight: large ? 700 : 500, color: accent ?? 'var(--t1)',
        fontVariantNumeric: 'tabular-nums', textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  )
}

/* ── ML Pending component row ── */
function MlPending({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 0', borderBottom: '1px solid var(--b0)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <CornerDownRight size={9} color="var(--t4)"/>
        <span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--font-sans)' }}>{label}</span>
      </div>
      <span style={{
        fontSize: 7.5, fontWeight: 700, letterSpacing: '0.12em',
        color: 'var(--violet)', background: 'var(--violet-bg)',
        border: '1px solid var(--violet-border)',
        borderRadius: 'var(--r-xs)', padding: '2px 6px',
        fontFamily: 'var(--font-mono)',
      }}>
        PENDING
      </span>
    </div>
  )
}

/* ── Empty state ── */
function EmptyState({ events, setSelectedEvent }: {
  events: ApiThermalEvent[]; setSelectedEvent: (e: ApiThermalEvent | null) => void
}) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32,
    }}>
      <svg viewBox="0 0 56 56" width="48" height="48" opacity="0.2">
        <circle cx="28" cy="28" r="24" fill="none" stroke="var(--t2)" strokeWidth="0.8"/>
        <circle cx="28" cy="28" r="16" fill="none" stroke="var(--t2)" strokeWidth="0.8" strokeDasharray="4 4"/>
        <circle cx="28" cy="28" r="4"  fill="var(--t4)"/>
        {[0,60,120,180,240,300].map(a => {
          const r = a * Math.PI / 180
          return <line key={a}
            x1={28 + 22*Math.cos(r)} y1={28 + 22*Math.sin(r)}
            x2={28 + 25*Math.cos(r)} y2={28 + 25*Math.sin(r)}
            stroke="var(--t2)" strokeWidth="0.8"/>
        })}
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', fontFamily: 'var(--font-mono)', color: 'var(--t3)', marginBottom: 6 }}>
          NO EVENT SELECTED
        </div>
        <div style={{ fontSize: 11, color: 'var(--t4)', lineHeight: 1.7, maxWidth: 260, fontFamily: 'var(--font-sans)' }}>
          Select a thermal observation from the map or log to begin intelligence assembly.
        </div>
      </div>
      {events.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 400, justifyContent: 'center' }}>
          {events.slice(0, 8).map(e => (
            <button key={e.event_id} onClick={() => setSelectedEvent(e)} className="btn"
              style={{ fontSize: 9, fontFamily: 'var(--font-mono)', padding: '3px 8px', letterSpacing: '0.04em' }}>
              {e.event_id}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RiskPage() {
  const { events, status, selectedEvent, setSelectedEvent } = useAppContext()
  const navigate = useNavigate()
  const ev = selectedEvent

  if (status === 'loading') return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--t3)' }}>
      <div style={{ width: 14, height: 14, border: '1.5px solid var(--cyan)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em' }}>LOADING INTELLIGENCE</span>
    </div>
  )

  if (!ev) return <EmptyState events={events} setSelectedEvent={setSelectedEvent}/>

  const score  = deriveRiskScore(ev)
  const level  = deriveRiskLevel(ev)
  const rColor = getRiskColor(level)
  const rBg    = getRiskBg(level)
  const rBord  = getRiskBorder(level)
  const fc     = frpColor(ev.frp)

  const wcEnriched = ev.worldcover_version != null ? (ev.worldcover_class_name != null) : null

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', background: 'var(--d1)' }}>

      {/* ── Left column — evidence assembly ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Event header */}
        <div style={{
          background: 'linear-gradient(135deg, var(--d5) 0%, var(--d4) 100%)',
          border: '1px solid var(--b2)',
          borderTop: `2px solid ${fc}`,
          borderRadius: 'var(--r-md)',
          padding: '12px 14px',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: '0.18em', color: 'var(--t4)', fontFamily: 'var(--font-mono)', marginBottom: 5 }}>
            INTELLIGENCE ASSEMBLY — THERMAL EVENT
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--cyan)', marginBottom: 8, wordBreak: 'break-all' }}>
            {ev.event_id ?? 'ID UNAVAILABLE'}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <MapPin size={10} color="var(--t4)"/>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t2)' }}>
                {ev.latitude.toFixed(4)}°, {ev.longitude.toFixed(4)}°
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t3)' }}>
              {ev.satellite ?? '—'} · {ev.instrument ?? '—'}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t3)' }}>
              {ev.acquisition_date ?? '—'} {formatAcqTime(ev.acquisition_time)}
            </span>
          </div>
          {/* Event switcher */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>SWITCH:</span>
            {events.slice(0, 8).map(e => (
              <button key={e.event_id} onClick={() => setSelectedEvent(e)} className="btn"
                style={{
                  fontSize: 8, fontFamily: 'var(--font-mono)', padding: '2px 6px', letterSpacing: '0.04em',
                  borderColor: e.event_id === ev.event_id ? 'var(--cyan-border)' : undefined,
                  background:  e.event_id === ev.event_id ? 'var(--cyan-bg)' : undefined,
                  color:       e.event_id === ev.event_id ? 'var(--cyan)' : undefined,
                }}>
                {e.event_id?.slice(0, 18)}…
              </button>
            ))}
          </div>
        </div>

        {/* Preliminary FIRMS signal — clearly NOT ML */}
        <div style={{
          background: rBg, border: `1px solid ${rBord}`,
          borderLeft: `3px solid ${rColor}`,
          borderRadius: 'var(--r-md)', padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--t3)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
                PRELIMINARY FIRMS SIGNAL
              </div>
              <div style={{ fontSize: 10, color: 'var(--t4)', lineHeight: 1.5 }}>
                Deterministic threshold · FRP + brightness + confidence.{' '}
                <strong style={{ color: 'var(--t3)' }}>Not an ML risk score.</strong>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: rColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>
                {score}
              </div>
              <div style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>/100</div>
            </div>
          </div>
          {/* Score track */}
          <div style={{ height: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 4, marginBottom: 8, overflow: 'hidden' }}>
            <div style={{
              width: `${score}%`, height: '100%', borderRadius: 4,
              background: `linear-gradient(90deg, ${rColor}80, ${rColor})`,
              transition: 'width 0.6s ease',
            }}/>
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            color: rColor, textTransform: 'uppercase',
            background: `${rColor}14`, border: `1px solid ${rColor}40`,
            borderRadius: 'var(--r-xs)', padding: '3px 10px',
            fontFamily: 'var(--font-mono)',
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: rColor }}/>
            {level}
          </span>
        </div>

        {/* Thermal signal */}
        <EvidenceCard title="Thermal Signal" accent="var(--amber)">
          <EF label="FRP"        value={ev.frp  != null ? `${ev.frp.toLocaleString()} MW`   : '—'} accent={fc} large/>
          <EF label="Brightness" value={ev.brightness != null ? `${ev.brightness.toFixed(1)} K` : '—'}/>
          <EF label="Confidence" value={confidenceLabel(ev.confidence)}/>
          <EF label="D/N"        value={ev.daynight === 'D' ? 'Daytime' : ev.daynight === 'N' ? 'Nighttime' : '—'}/>
          <EF label="Tier"       value={frpTier(ev.frp).toUpperCase()} accent={fc}/>
        </EvidenceCard>

        {/* Satellite */}
        <EvidenceCard title="Satellite Observation" accent="var(--cyan)">
          <EF label="Platform"   value={ev.satellite    ?? '—'}/>
          <EF label="Instrument" value={ev.instrument   ?? '—'}/>
          <EF label="Source"     value={ev.firms_source ?? '—'}/>
          <EF label="Date"       value={ev.acquisition_date ?? '—'}/>
          <EF label="Time"       value={formatAcqTime(ev.acquisition_time)}/>
          <EF label="Lat"        value={`${ev.latitude.toFixed(5)}°`}/>
          <EF label="Lon"        value={`${ev.longitude.toFixed(5)}°`}/>
        </EvidenceCard>

        {/* Land cover */}
        <EvidenceCard title="Land-Cover Context" accent="var(--ok)">
          <EF label="Class"
            value={ev.worldcover_class_name ?? (ev.worldcover_version != null ? 'NoData' : 'Not enriched')}
            accent={ev.worldcover_class_name ? 'var(--t1)' : 'var(--t4)'}/>
          <EF label="Version" value={ev.worldcover_version ?? '—'}/>
          {ev.worldcover_enriched_at && (
            <EF label="Enriched"
              value={new Date(ev.worldcover_enriched_at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'}/>
          )}
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: wcEnriched == null ? 'var(--t4)' : wcEnriched ? 'var(--ok)' : 'var(--warn)',
            }}/>
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--t3)', letterSpacing: '0.08em' }}>
              {wcEnriched == null ? 'WORLDCOVER PENDING' : wcEnriched ? 'WORLDCOVER ENRICHED' : 'WORLDCOVER NODATA'}
            </span>
          </div>
        </EvidenceCard>

        <button className="btn btn-teal" onClick={() => navigate('/map')}
          style={{ alignSelf: 'flex-start', gap: 6, fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
          ◉ VIEW ON MAP
        </button>
      </div>

      {/* ── Right column — ML pipeline pending ── */}
      <div style={{
        width: 300, minWidth: 300,
        overflowY: 'auto', padding: '14px 16px',
        borderLeft: '1px solid var(--b1)',
        display: 'flex', flexDirection: 'column', gap: 10,
        background: 'var(--d2)',
      }}>

        {/* ML notice */}
        <div style={{
          padding: '12px 14px',
          background: 'var(--violet-bg)',
          border: '1px solid var(--violet-border)',
          borderTop: '2px solid var(--violet)',
          borderRadius: 'var(--r-md)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--violet)' }}/>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', color: 'var(--violet)', fontFamily: 'var(--font-mono)' }}>
              ML RISK PIPELINE
            </span>
            <span style={{
              fontSize: 7.5, fontWeight: 700, letterSpacing: '0.12em',
              color: 'var(--violet)', background: 'var(--violet-bg)',
              border: '1px solid var(--violet-border)',
              borderRadius: 'var(--r-xs)', padding: '1px 5px',
              fontFamily: 'var(--font-mono)', marginLeft: 'auto',
            }}>
              PENDING
            </span>
          </div>
          <p style={{ fontSize: 10, color: 'var(--t3)', lineHeight: 1.7, fontFamily: 'var(--font-sans)' }}>
            Composite risk scoring requires the ML inference pipeline. Once integrated, these components will populate automatically from the API.
          </p>
        </div>

        {/* ML components */}
        <div style={{
          background: 'var(--d4)', border: '1px solid var(--b1)',
          borderRadius: 'var(--r-md)', padding: '11px 13px',
        }}>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--t4)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
            RISK COMPONENTS
          </div>
          {[
            'Composite Risk Score (0–100)',
            'Thermal Intensity Score',
            'Persistence Score',
            'Spatial Proximity Score',
            'Anomaly Deviation Score',
            'Land Cover Vulnerability',
            'Temporal Behaviour Score',
          ].map(l => <MlPending key={l} label={l}/>)}
        </div>

        {/* Infrastructure context */}
        <div style={{
          background: 'var(--d4)', border: '1px solid var(--b1)',
          borderRadius: 'var(--r-md)', padding: '11px 13px',
        }}>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--t4)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
            INFRASTRUCTURE CONTEXT
          </div>
          <div style={{
            padding: '8px 10px', background: 'var(--d5)',
            border: '1px solid var(--b1)', borderRadius: 'var(--r-sm)',
            marginBottom: 8,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 3 }}>
              OSM ENRICHMENT PENDING
            </div>
            <div style={{ fontSize: 10, color: 'var(--t4)', lineHeight: 1.6, fontFamily: 'var(--font-sans)' }}>
              Facility proximity fields will populate once the OSM enrichment pipeline processes this event.
            </div>
          </div>
          {['Industrial', 'Refinery', 'Power Plant', 'Mine', 'Gas Facility'].map(l => (
            <div key={l} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '4px 0', borderBottom: '1px solid var(--b0)',
            }}>
              <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{l}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t4)' }}>— km</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
