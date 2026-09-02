import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Satellite, Clock, ChevronRight, Flame, Cpu, Zap } from 'lucide-react'
import { useAppContext } from '../App'
import { formatAcqTime, confidenceLabel } from '../utils/eventUtils'
import { deriveRiskLevel, deriveRiskScore, getRiskColor } from '../utils/risk'
import RiskBadge from '../components/RiskBadge'
import MetricRow from '../components/MetricRow'
import ScoreBar from '../components/ScoreBar'
import { api } from '../services/api'
import type { ApiPrediction } from '../types/api'
import type { ApiEventFeatures } from '../services/api'

function frpColor(frp: number | null): string {
  if (frp == null) return '#38BDF8'
  if (frp > 500)   return '#DC2626'
  if (frp > 200)   return '#F97316'
  if (frp > 100)   return '#FB923C'
  if (frp > 50)    return '#FCD34D'
  if (frp > 20)    return '#A3E635'
  return '#38BDF8'
}
function distFmt(d: number | null): string {
  if (d == null) return 'DATA PENDING'
  if (d < 1) return `${(d * 1000).toFixed(0)} m`
  return `${d.toFixed(2)} km`
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--d3)', border: '1px solid var(--b1)', borderRadius: 9, padding: '14px 16px', ...style }}>
      {children}
    </div>
  )
}
function PanelTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t4)', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--b1)' }}>{children}</div>
}

function FacilityRow({ label, distance, near }: { label: string; distance: number | null; near: boolean | null }) {
  const hasData = distance != null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--b0)' }}>
      <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {hasData && near != null && (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: near ? 'var(--err)' : 'var(--ok)', background: near ? 'var(--err-bg)' : 'var(--ok-bg)', border: `1px solid ${near ? 'var(--err-b)' : 'var(--ok-b)'}`, borderRadius: 3, padding: '1px 5px' }}>
            {near ? 'NEAR' : 'FAR'}
          </span>
        )}
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: hasData ? 'var(--t1)' : 'var(--t4)', fontVariantNumeric: 'tabular-nums' }}>
          {distFmt(distance)}
        </span>
      </div>
    </div>
  )
}

function MR({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--b0)' }}>
      <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

export default function RiskPage() {
  const { events, status, selectedEvent, setSelectedEvent } = useAppContext()
  const navigate = useNavigate()
  const ev = selectedEvent

  const [prediction, setPrediction] = useState<ApiPrediction | null>(null)
  const [predLoading, setPredLoading] = useState(false)
  const [features, setFeatures] = useState<ApiEventFeatures | null>(null)

  useEffect(() => {
    if (!ev) { setPrediction(null); setFeatures(null); return }
    const controller = new AbortController()
    setPredLoading(true)
    api.predict(ev.id, controller.signal)
      .then(r => { if (!controller.signal.aborted) setPrediction(r) })
      .catch(() => { if (!controller.signal.aborted) setPrediction(null) })
      .finally(() => { if (!controller.signal.aborted) setPredLoading(false) })
    api.eventFeatures(ev.id, controller.signal)
      .then(r => { if (!controller.signal.aborted) setFeatures(r) })
      .catch(() => { if (!controller.signal.aborted) setFeatures(null) })
    return () => controller.abort()
  }, [ev?.id])

  if (status === 'loading') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--t3)' }}>
        <div style={{ width: 20, height: 20, border: '2px solid var(--b2)', borderTopColor: 'var(--cyan)', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }}/>
        <span style={{ fontSize: 13 }}>Loading event intelligence...</span>
      </div>
    )
  }

  if (!ev) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--t3)' }}>
        <Flame size={32} color="var(--t4)"/>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t2)' }}>No Event Selected</div>
        <div style={{ fontSize: 12, color: 'var(--t4)', textAlign: 'center', maxWidth: 280 }}>
          Select a fire event from the Global Map or Observation Log to begin investigation.
        </div>
        <button onClick={() => navigate('/map')} className="btn btn-cyan" style={{ marginTop: 4 }}>
          Open Global Map <ChevronRight size={12}/>
        </button>
      </div>
    )
  }

  const riskLevel = deriveRiskLevel(ev)
  const riskScore = deriveRiskScore(ev)
  const riskColor = getRiskColor(riskLevel)
  const frpC = frpColor(ev.frp)
  const osmEnriched = ev.osm_enrichment_status === 'enriched'
  const wcEnriched = ev.worldcover_class_name != null
  const hasTemporalData = features?.detections_7d != null
  const hasAnomalyData = features?.frp_deviation != null

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px 20px', background: 'var(--d1)' }}>

      {/* Event header */}
      <div style={{ background: 'var(--d3)', border: '1px solid var(--b1)', borderRadius: 9, padding: '16px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--cyan)', textTransform: 'uppercase', marginBottom: 4 }}>Fire Event Analysis</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 800, color: 'var(--t1)', marginBottom: 8, letterSpacing: '-0.01em' }}>
              {ev.event_id ?? `ID ${ev.id}`}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <MapPin size={11} color="var(--t4)"/>
                <span style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>{ev.latitude.toFixed(4)}, {ev.longitude.toFixed(4)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Satellite size={11} color="var(--t4)"/>
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>{ev.satellite ?? 'Unknown'} · {ev.instrument ?? 'Unknown'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={11} color="var(--t4)"/>
                <span style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>{ev.acquisition_date ?? 'Unknown'} · {formatAcqTime(ev.acquisition_time)}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <RiskBadge level={riskLevel} size="md"/>
            <div style={{ fontSize: 11, color: 'var(--t4)' }}>Thermal signal · not ML</div>
          </div>
        </div>

        {events.length > 1 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--b1)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {events.slice(0, 10).map(e => (
              <button
                key={e.id}
                onClick={() => setSelectedEvent(e)}
                style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)',
                  border: `1px solid ${e.id === ev.id ? 'var(--cyan-border)' : 'var(--b1)'}`,
                  background: e.id === ev.id ? 'var(--cyan-bg)' : 'transparent',
                  color: e.id === ev.id ? 'var(--cyan)' : 'var(--t4)',
                  cursor: 'pointer',
                }}
              >
                {(e.event_id ?? `#${e.id}`).slice(0, 14)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Row 1: Thermal / OSM / Land Cover */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>

        <Panel>
          <PanelTitle>Thermal Profile</PanelTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: frpC, fontVariantNumeric: 'tabular-nums', lineHeight: 1, fontFamily: 'var(--font-mono)' }}>
                {ev.frp != null ? ev.frp.toLocaleString() : 'N/A'}
              </div>
              <div style={{ fontSize: 9, color: 'var(--t4)', letterSpacing: '0.1em', marginTop: 2 }}>MW FRP</div>
            </div>
            <div style={{ flex: 1 }}>
              <ScoreBar score={Math.min(100, (ev.frp ?? 0) / 30)} color={frpC} height={5}/>
              <div style={{ fontSize: 9, color: 'var(--t4)', marginTop: 3 }}>Intensity relative to 3000 MW</div>
            </div>
          </div>
          <MetricRow label="Brightness" value={ev.brightness != null ? `${ev.brightness.toFixed(1)} K` : 'DATA PENDING'} mono/>
          <MetricRow label="Confidence" value={confidenceLabel(ev.confidence)} mono/>
          <MetricRow label="Day / Night" value={ev.daynight === 'D' ? 'Daytime' : ev.daynight === 'N' ? 'Nighttime' : 'Unknown'}/>
          <MetricRow label="Source" value={ev.firms_source ?? 'Unknown'} mono/>
        </Panel>

        <Panel>
          <PanelTitle>Spatial Context — OSM</PanelTitle>
          {osmEnriched ? (
            <>
              <FacilityRow label="Road" distance={ev.distance_to_road} near={null}/>
              <FacilityRow label="Industrial" distance={ev.distance_to_industrial} near={ev.near_industrial_facility}/>
              <FacilityRow label="Refinery" distance={ev.distance_to_refinery} near={ev.near_refinery}/>
              <FacilityRow label="Power Plant" distance={ev.distance_to_powerplant} near={ev.near_powerplant}/>
              <FacilityRow label="Mine" distance={ev.distance_to_mine} near={ev.near_mine}/>
              <FacilityRow label="Gas Facility" distance={ev.distance_to_gas_facility} near={ev.near_gas_facility}/>
              <div style={{ marginTop: 8, fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
                Source: {ev.osm_source_version ?? 'overpass-osm'} · {ev.osm_enriched_at ? new Date(ev.osm_enriched_at).toLocaleDateString() : ''}
              </div>
            </>
          ) : (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--t4)', marginBottom: 4 }}>
                {ev.osm_enrichment_status === 'pending' ? 'OSM Enrichment In Progress' : 'OSM Enrichment Pending'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t4)', lineHeight: 1.6 }}>
                Overpass API query scheduled.<br/>Infrastructure distances will appear here.
              </div>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Land Cover — WorldCover v200</PanelTitle>
          {wcEnriched ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ok)', marginBottom: 2 }}>{ev.worldcover_class_name}</div>
                <div style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
                  Class {ev.worldcover_class_code} · {ev.worldcover_version ?? 'v200'}
                </div>
              </div>
              {features?.wc_forest_pct != null && <MR label="Forest" value={`${features.wc_forest_pct.toFixed(1)}%`}/>}
              {features?.wc_cropland_pct != null && <MR label="Cropland" value={`${features.wc_cropland_pct.toFixed(1)}%`}/>}
              {features?.wc_grassland_pct != null && <MR label="Grassland" value={`${features.wc_grassland_pct.toFixed(1)}%`}/>}
              {features?.wc_builtup_pct != null && <MR label="Built-up" value={`${features.wc_builtup_pct.toFixed(1)}%`}/>}
              {features?.wc_water_pct != null && <MR label="Water" value={`${features.wc_water_pct.toFixed(1)}%`}/>}
            </>
          ) : (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--t4)', marginBottom: 4 }}>
                {ev.worldcover_enrichment_status === 'pending' ? 'WorldCover Enrichment Pending' : 'Awaiting Enrichment'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t4)', lineHeight: 1.6 }}>
                ESA WorldCover 10m classification<br/>will appear after enrichment.
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Row 2: Temporal / Anomaly */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

        <Panel>
          <PanelTitle>Temporal Behaviour</PanelTitle>
          {hasTemporalData ? (
            <>
              <MR label="7D Detections" value={String(features!.detections_7d)}/>
              <MR label="30D Detections" value={String(features!.detections_30d ?? 'N/A')}/>
              <MR label="90D Detections" value={String(features!.detections_90d ?? 'N/A')}/>
              <MR label="Mean FRP 30D" value={features!.mean_frp_30d != null ? `${features!.mean_frp_30d.toFixed(1)} MW` : 'N/A'}/>
              <MR label="Max FRP 30D" value={features!.max_frp_30d != null ? `${features!.max_frp_30d.toFixed(1)} MW` : 'N/A'}/>
              <MR label="Mean Brightness 30D" value={features!.mean_brightness_30d != null ? `${features!.mean_brightness_30d.toFixed(1)} K` : 'N/A'}/>
              <MR label="Active Days 30D" value={String(features!.days_active_30d ?? 'N/A')}/>
              <MR label="Persistence Score" value={features!.persistence_score != null ? features!.persistence_score.toFixed(4) : 'N/A'}/>
            </>
          ) : (
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--t4)', marginBottom: 4 }}>Temporal Data Pending</div>
              <div style={{ fontSize: 10, color: 'var(--t4)', lineHeight: 1.6 }}>
                Historical detection counts and FRP statistics<br/>will appear after temporal computation.
              </div>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Historical Anomaly</PanelTitle>
          {hasAnomalyData ? (
            <>
              <MR label="FRP Deviation" value={features!.frp_deviation!.toFixed(2)}/>
              <MR label="FRP Ratio" value={features!.frp_ratio != null ? features!.frp_ratio.toFixed(4) : 'N/A'}/>
              <MR label="Brightness Deviation" value={features!.brightness_deviation != null ? features!.brightness_deviation.toFixed(2) : 'N/A'}/>
              <MR label="Brightness Ratio" value={features!.brightness_ratio != null ? features!.brightness_ratio.toFixed(4) : 'N/A'}/>
              <div style={{ marginTop: 10, fontSize: 10, color: 'var(--t4)', lineHeight: 1.6, padding: '8px 10px', background: 'var(--d4)', borderRadius: 6, border: '1px solid var(--b0)' }}>
                Deviation = current minus 30-day mean. Ratio = current divided by 30-day mean.
              </div>
            </>
          ) : (
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--t4)', marginBottom: 4 }}>Anomaly Data Pending</div>
              <div style={{ fontSize: 10, color: 'var(--t4)', lineHeight: 1.6 }}>
                FRP and brightness anomaly scores<br/>will appear after temporal computation.
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Row 3: Thermal Signal Score / AI Classification */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        <Panel>
          <PanelTitle>Thermal Signal Score</PanelTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, fontWeight: 900, color: riskColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{riskScore}</div>
              <div style={{ fontSize: 9, color: 'var(--t4)', letterSpacing: '0.1em', marginTop: 2 }}>SCORE</div>
            </div>
            <div style={{ flex: 1 }}>
              <ScoreBar score={riskScore} height={6}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 9, color: 'var(--t4)' }}>LOW</span>
                <span style={{ fontSize: 9, color: 'var(--t4)' }}>EXTREME</span>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--t4)', lineHeight: 1.6, padding: '8px 10px', background: 'var(--d4)', borderRadius: 6, border: '1px solid var(--b0)' }}>
            Score derived from FRP and brightness thresholds. Not a machine learning prediction.
          </div>
        </Panel>

        <Panel style={{ borderColor: 'var(--violet-border)', background: 'rgba(139,92,246,0.04)' }}>
          <PanelTitle>AI Classification</PanelTitle>
          {predLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', color: 'var(--t4)' }}>
              <div style={{ width: 14, height: 14, border: '2px solid var(--b2)', borderTopColor: 'var(--violet)', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }}/>
              <span style={{ fontSize: 12 }}>Running inference...</span>
            </div>
          ) : prediction?.prediction ? (() => {
            const cls = prediction.prediction.class
            const conf = prediction.prediction.confidence
            const clsColor = cls === 'wildfire' ? 'var(--err)'
              : cls === 'industrial_thermal_source' ? 'var(--amber)'
              : cls === 'agricultural_burning' ? 'var(--warn)'
              : 'var(--t3)'
            const clsLabel = cls.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            const fc = prediction.feature_completeness
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 12px', background: 'var(--d4)', borderRadius: 7, border: `1px solid ${clsColor}33` }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: clsColor, boxShadow: `0 0 8px ${clsColor}`, flexShrink: 0 }}/>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: clsColor }}>{clsLabel}</div>
                    <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 1 }}>{(conf * 100).toFixed(1)}% confidence · {prediction.prediction.model}</div>
                  </div>
                </div>
                <MetricRow label="Predicted Class" value={clsLabel} mono/>
                <MetricRow label="Confidence" value={`${(conf * 100).toFixed(1)}%`} mono/>
                <MetricRow label="Model" value={prediction.prediction.model} mono/>
                {fc && (
                  <>
                    <div style={{ marginTop: 10, marginBottom: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--t4)', textTransform: 'uppercase' }}>Feature Completeness</div>
                    {([['OSM', fc.osm_ready], ['Temporal', fc.temporal_ready], ['WorldCover', fc.worldcover_ready]] as [string, boolean][]).map(([lbl, ready]) => (
                      <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--b0)' }}>
                        <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{lbl}</span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: ready ? 'var(--ok)' : 'var(--warn)', fontWeight: 600 }}>{ready ? 'READY' : 'PENDING'}</span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )
          })() : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={16} color="var(--t4)"/>
                <span style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 600 }}>ML Pipeline</span>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--warn)', background: 'var(--warn-bg)', border: '1px solid var(--warn-b)', borderRadius: 3, padding: '2px 6px', marginLeft: 'auto' }}>INSTALL XGBOOST</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--t4)', lineHeight: 1.6 }}>
                {prediction?.status === 'model_not_found'
                  ? 'Model file not found. Run train.py to generate saved_model.json.'
                  : 'Backend error — install xgboost in venv: pip install xgboost==2.1.1'}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Footer nav */}
      <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => navigate('/map')} className="btn">
          <MapPin size={11}/> View on Map
        </button>
        <button onClick={() => navigate('/explain')} className="btn btn-cyan">
          <Zap size={11}/> SHAP Explain
        </button>
        <button onClick={() => navigate('/facilities')} className="btn">
          <ChevronRight size={11}/> Infrastructure
        </button>
      </div>
    </div>
  )
}
