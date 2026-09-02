import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../App'
import { MapPin, ArrowRight } from 'lucide-react'
import { formatAcqTime, confidenceLabel, frpColor, frpTier } from '../utils/eventUtils'
import { deriveRiskScore, deriveRiskLevel, getRiskColor, getRiskBg, getRiskBorder } from '../utils/risk'
import type { ApiThermalEvent } from '../types/api'

function Card({ title, accentColor, children }: {
  title: string; accentColor?: string; children: React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--d4)', border: '1px solid var(--b1)',
      borderLeft: `4px solid ${accentColor ?? 'var(--b2)'}`,
      borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid var(--b1)', background: accentColor ? `${accentColor}08` : 'transparent' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: accentColor ?? 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

function Row({ label, value, accent, big }: { label: string; value: string; accent?: string; big?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--b0)' }}>
      <span style={{ fontSize: 12, color: 'var(--t3)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: big ? 18 : 14, fontWeight: big ? 700 : 500, color: accent ?? 'var(--t1)', fontFamily: 'var(--font-mono)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}

function EmptyState({ events, setSelectedEvent }: { events: ApiThermalEvent[]; setSelectedEvent: (e: ApiThermalEvent | null) => void }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40 }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', border: '2px solid var(--b2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MapPin size={22} color="var(--t3)" strokeWidth={1.5}/>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t2)', marginBottom: 8 }}>No Fire Selected</div>
        <div style={{ fontSize: 13, color: 'var(--t4)', lineHeight: 1.7, maxWidth: 280 }}>
          Select a fire event from the map or observation log to see its detailed analysis.
        </div>
      </div>
      {events.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--t4)', marginBottom: 8, textAlign: 'center' }}>Recent events:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 420 }}>
            {events.slice(0, 8).map(e => (
              <button key={e.event_id} onClick={() => setSelectedEvent(e)} className="btn"
                style={{ fontSize: 11, fontFamily: 'var(--font-mono)', padding: '4px 10px' }}>
                {e.event_id?.slice(0, 20)}
              </button>
            ))}
          </div>
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
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ width: 16, height: 16, border: '2px solid var(--cyan)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
      <span style={{ fontSize: 14, color: 'var(--t3)' }}>Loading…</span>
    </div>
  )

  if (!ev) return <EmptyState events={events} setSelectedEvent={setSelectedEvent}/>

  const score  = deriveRiskScore(ev)
  const level  = deriveRiskLevel(ev)
  const rColor = getRiskColor(level)
  const rBg    = getRiskBg(level)
  const rBord  = getRiskBorder(level)
  const fc     = frpColor(ev.frp)

  const levelLabels: Record<string, string> = {
    LOW: 'Low Risk', MEDIUM: 'Moderate Risk', HIGH: 'High Risk',
    CRITICAL: 'Critical', EXTREME: 'Extreme',
  }

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', background: 'var(--d1)' }}>

      {/* Left — evidence */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Event header */}
        <div style={{
          background: 'var(--d3)',
          border: '1px solid var(--b1)',
          borderTop: `4px solid ${fc}`,
          borderRadius: 10, padding: '16px 18px',
        }}>
          <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
            Fire Event Analysis
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--cyan)', marginBottom: 12, wordBreak: 'break-all', lineHeight: 1.4 }}>
            {ev.event_id ?? 'Unknown ID'}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={11} color="var(--t4)"/>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--t2)' }}>
                {ev.latitude.toFixed(4)}\u00b0, {ev.longitude.toFixed(4)}\u00b0
              </span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>{ev.satellite ?? '\u2014'} \u00b7 {ev.instrument ?? '\u2014'}</span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>{ev.acquisition_date ?? '\u2014'} {formatAcqTime(ev.acquisition_time)}</span>
          </div>
          {/* Switcher — styled as intelligence-panel controls, not plain buttons */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginRight: 2 }}>SWITCH:</span>
            {events.slice(0, 6).map(e => {
              const isActive = e.event_id === ev.event_id
              const efc = frpColor(e.frp)
              return (
                <button
                  key={e.event_id}
                  onClick={() => setSelectedEvent(e)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 10, fontFamily: 'var(--font-mono)',
                    padding: '3px 9px',
                    borderRadius: 5,
                    background: isActive ? `${efc}18` : 'var(--d5)',
                    border: `1px solid ${isActive ? efc + '55' : 'var(--b2)'}`,
                    color: isActive ? efc : 'var(--t3)',
                    cursor: 'pointer',
                    transition: 'all var(--ease)',
                    outline: 'none',
                  }}
                  onMouseEnter={e2 => {
                    if (!isActive) {
                      (e2.currentTarget as HTMLButtonElement).style.background = 'var(--d6)'
                      ;(e2.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'
                      ;(e2.currentTarget as HTMLButtonElement).style.borderColor = 'var(--b3)'
                    }
                  }}
                  onMouseLeave={e2 => {
                    if (!isActive) {
                      (e2.currentTarget as HTMLButtonElement).style.background = 'var(--d5)'
                      ;(e2.currentTarget as HTMLButtonElement).style.color = 'var(--t3)'
                      ;(e2.currentTarget as HTMLButtonElement).style.borderColor = 'var(--b2)'
                    }
                  }}
                >
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: efc, flexShrink: 0 }}/>
                  {e.event_id?.slice(0, 14)}\u2026
                </button>
              )
            })}
          </div>
        </div>

        {/* Signal strength — score visually dominant, section itself recedes */}
        <div style={{
          background: 'var(--d3)',
          border: `1px solid ${rBord}`,
          borderLeft: `4px solid ${rColor}`,
          borderRadius: 10, padding: '14px 18px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 4 }}>Signal Strength</div>
              <div style={{ fontSize: 12, color: 'var(--t4)', lineHeight: 1.6, maxWidth: 280 }}>
                Calculated from fire intensity, brightness and detection confidence.{' '}
                <strong style={{ color: 'var(--t3)' }}>Not an AI prediction.</strong>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
              <div style={{ fontSize: 44, fontWeight: 900, color: rColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>
                {score}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t4)' }}>out of 100</div>
            </div>
          </div>
          <div style={{ height: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 6, marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ width: `${score}%`, height: '100%', borderRadius: 6, background: `linear-gradient(90deg, ${rColor}70, ${rColor})`, transition: 'width 0.6s ease' }}/>
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 700, color: rColor,
            background: `${rColor}14`, border: `1px solid ${rColor}40`,
            borderRadius: 6, padding: '4px 12px',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: rColor }}/>
            {levelLabels[level] ?? level}
          </span>
        </div>

        {/* Fire signal */}
        <Card title="Fire Signal" accentColor="var(--amber)">
          <Row label="Fire Radiative Power" value={ev.frp  != null ? `${ev.frp.toLocaleString()} MW`   : '—'} accent={fc} big/>
          <Row label="Brightness Temp"      value={ev.brightness != null ? `${ev.brightness.toFixed(1)} K` : '—'}/>
          <Row label="Detection Confidence" value={confidenceLabel(ev.confidence)}/>
          <Row label="Day or Night"         value={ev.daynight === 'D' ? 'Daytime' : ev.daynight === 'N' ? 'Nighttime' : '—'}/>
          <Row label="Intensity Level"      value={frpTier(ev.frp)} accent={fc}/>
        </Card>

        {/* Satellite */}
        <Card title="Satellite Information" accentColor="var(--cyan)">
          <Row label="Satellite"     value={ev.satellite    ?? '—'}/>
          <Row label="Instrument"    value={ev.instrument   ?? '—'}/>
          <Row label="Data Source"   value={ev.firms_source ?? '—'}/>
          <Row label="Date"          value={ev.acquisition_date ?? '—'}/>
          <Row label="Time"          value={formatAcqTime(ev.acquisition_time)}/>
          <Row label="Latitude"      value={`${ev.latitude.toFixed(5)}°`}/>
          <Row label="Longitude"     value={`${ev.longitude.toFixed(5)}°`}/>
        </Card>

        {/* Land cover */}
        <Card title="Land Cover" accentColor="var(--ok)">
          <Row label="Cover Type"
            value={ev.worldcover_class_name ?? (ev.worldcover_version != null ? 'No data' : 'Pending enrichment')}
            accent={ev.worldcover_class_name ? 'var(--t1)' : 'var(--t4)'}/>
          <Row label="Version"      value={ev.worldcover_version ?? '—'}/>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: ev.worldcover_version != null ? 'var(--ok)' : 'var(--t4)' }}/>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>
              {ev.worldcover_version != null ? 'Land cover data available' : 'Land cover enrichment pending'}
            </span>
          </div>
        </Card>

        <button className="btn btn-teal" onClick={() => navigate('/map')}
          style={{ alignSelf: 'flex-start', gap: 6, fontSize: 13, padding: '8px 16px' }}>
          View on Map <ArrowRight size={13}/>
        </button>
      </div>

        {/* Right — ML pending: calmer treatment, distinct from populated sections */}
      <div style={{
        width: 300, minWidth: 300, overflowY: 'auto', padding: '18px 16px',
        borderLeft: '1px solid var(--b1)', background: 'var(--d2)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* ML notice — violet accent, but not screaming */}
        <div style={{
          background: 'var(--d3)',
          border: '1px solid var(--b1)',
          borderLeft: '3px solid var(--violet)',
          borderRadius: 10, padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--violet)', flexShrink: 0 }}/>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet)', letterSpacing: '0.06em' }}>AI Risk Scoring</span>
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--violet)',
              background: 'var(--violet-bg)', border: '1px solid var(--violet-border)',
              borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--font-mono)',
              marginLeft: 'auto', letterSpacing: '0.08em',
            }}>PENDING</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--t4)', lineHeight: 1.7 }}>
            AI pipeline not yet connected. Once integrated, this panel shows composite risk scores and anomaly analysis.
          </p>
        </div>

        {/* Risk components — calmer, subdued */}
        <div style={{ background: 'var(--d3)', border: '1px solid var(--b1)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Risk Components</div>
          {['Composite Risk Score', 'Fire Persistence', 'Spatial Proximity Score', 'Anomaly Score', 'Land Cover Risk', 'Temporal Behaviour'].map(l => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--b0)' }}>
              <span style={{ fontSize: 12, color: 'var(--t4)' }}>{l}</span>
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'var(--t4)',
                background: 'var(--d5)', border: '1px solid var(--b1)',
                borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--font-mono)',
              }}>pending</span>
            </div>
          ))}
        </div>

        {/* Facilities — same subdued pending treatment */}
        <div style={{ background: 'var(--d3)', border: '1px solid var(--b1)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nearby Facilities</div>
          <p style={{ fontSize: 12, color: 'var(--t4)', lineHeight: 1.6, marginBottom: 10 }}>
            OSM proximity data is being enriched in the background.
          </p>
          {['Industrial zone', 'Refinery', 'Power plant', 'Mine', 'Gas facility'].map(l => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--b0)' }}>
              <span style={{ fontSize: 12, color: 'var(--t4)' }}>{l}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--t4)' }}>\u2014</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
