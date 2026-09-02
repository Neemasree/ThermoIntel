import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cpu, Flame, ChevronRight, MapPin } from 'lucide-react'
import { useAppContext } from '../App'
import { api } from '../services/api'
import type { ApiShapExplanation } from '../services/api'

const CLASS_COLOR: Record<string, string> = {
  wildfire:                  'var(--err)',
  industrial_thermal_source: 'var(--amber)',
  agricultural_burning:      'var(--warn)',
  other_uncertain:           'var(--t3)',
}

function classLabel(cls: string) {
  return cls.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function ShapBar({ value, maxAbs }: { value: number; maxAbs: number }) {
  const pct = maxAbs > 0 ? Math.abs(value) / maxAbs * 100 : 0
  const positive = value >= 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
      {/* negative side */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
        {!positive && (
          <div style={{
            height: 8, borderRadius: 2,
            width: `${pct}%`,
            background: '#F87171',
            boxShadow: '0 0 6px rgba(248,113,113,0.4)',
          }}/>
        )}
      </div>
      {/* centre line */}
      <div style={{ width: 1, height: 14, background: 'var(--b2)', flexShrink: 0 }}/>
      {/* positive side */}
      <div style={{ flex: 1 }}>
        {positive && (
          <div style={{
            height: 8, borderRadius: 2,
            width: `${pct}%`,
            background: '#1DE8E3',
            boxShadow: '0 0 6px rgba(29,232,227,0.4)',
          }}/>
        )}
      </div>
    </div>
  )
}

export default function ExplainPage() {
  const { events, status, selectedEvent, setSelectedEvent } = useAppContext()
  const navigate = useNavigate()
  const ev = selectedEvent

  const [explanation, setExplanation] = useState<ApiShapExplanation | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!ev) { setExplanation(null); setError(null); return }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    api.explain(ev.id, controller.signal)
      .then(r => {
        if (!controller.signal.aborted) {
          setExplanation(r)
          if (r.status && r.status !== 'ok') setError(r.status)
        }
      })
      .catch(e => { if (!controller.signal.aborted) setError(e?.message ?? 'Request failed') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [ev?.id])

  if (status === 'loading') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--t3)' }}>
        <div style={{ width: 20, height: 20, border: '2px solid var(--b2)', borderTopColor: 'var(--cyan)', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }}/>
        <span style={{ fontSize: 13 }}>Loading events…</span>
      </div>
    )
  }

  if (!ev) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--t3)' }}>
        <Cpu size={32} color="var(--t4)"/>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t2)' }}>No Event Selected</div>
        <div style={{ fontSize: 12, color: 'var(--t4)', textAlign: 'center', maxWidth: 280 }}>
          Select a fire event from the Global Map or Observation Log to explain its ML prediction.
        </div>
        <button onClick={() => navigate('/map')} className="btn btn-cyan" style={{ marginTop: 4 }}>
          Open Global Map <ChevronRight size={12}/>
        </button>
      </div>
    )
  }

  const features = showAll ? explanation?.all_features : explanation?.top_features
  const maxAbs = features ? Math.max(...features.map(f => Math.abs(f.shap_value)), 0.0001) : 0.0001
  const clsColor = explanation?.predicted_class ? (CLASS_COLOR[explanation.predicted_class] ?? 'var(--t3)') : 'var(--t3)'

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px 20px', background: 'var(--d1)' }}>

      {/* Header */}
      <div style={{ background: 'var(--d3)', border: '1px solid var(--b1)', borderRadius: 9, padding: '16px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--violet)', textTransform: 'uppercase', marginBottom: 4 }}>SHAP Explainability</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 800, color: 'var(--t1)', marginBottom: 8 }}>
              {ev.event_id ?? `ID ${ev.id}`}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <MapPin size={11} color="var(--t4)"/>
                <span style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>{ev.latitude.toFixed(4)}, {ev.longitude.toFixed(4)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Flame size={11} color="var(--t4)"/>
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>{ev.frp != null ? `${ev.frp.toLocaleString()} MW FRP` : 'FRP N/A'} · {ev.satellite ?? 'Unknown'}</span>
              </div>
            </div>
          </div>

          {/* Recent events quick-select */}
          {events.length > 1 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 320 }}>
              {events.slice(0, 8).map(e => (
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
      </div>

      {/* Prediction summary */}
      {explanation?.predicted_class && (
        <div style={{ background: 'var(--d3)', border: `1px solid ${clsColor}33`, borderRadius: 9, padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: clsColor, boxShadow: `0 0 10px ${clsColor}`, flexShrink: 0 }}/>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: clsColor }}>{classLabel(explanation.predicted_class)}</div>
            <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 2 }}>XGBoost prediction · SHAP values explain this classification</div>
          </div>
        </div>
      )}

      {/* SHAP chart */}
      <div style={{ background: 'var(--d3)', border: '1px solid var(--b1)', borderRadius: 9, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t4)' }}>
              Feature Contributions — {showAll ? 'All Features' : 'Top 15'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 2 }}>
              <span style={{ color: '#1DE8E3' }}>Cyan →</span> pushes toward predicted class &nbsp;·&nbsp;
              <span style={{ color: '#F87171' }}>Red ←</span> pushes away
            </div>
          </div>
          <button
            onClick={() => setShowAll(p => !p)}
            className="btn"
            style={{ fontSize: 10, padding: '4px 10px' }}
          >
            {showAll ? 'Show Top 15' : 'Show All'}
          </button>
        </div>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 0', color: 'var(--t4)' }}>
            <div style={{ width: 16, height: 16, border: '2px solid var(--b2)', borderTopColor: 'var(--violet)', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }}/>
            <span style={{ fontSize: 12 }}>Computing SHAP values…</span>
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--err)', marginBottom: 6 }}>
              {error === 'model_not_found' ? 'Model not found — run train.py to generate saved_model.json' : `Error: ${error}`}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t4)' }}>
              Install xgboost and shap in venv, then retrain the model.
            </div>
          </div>
        )}

        {!loading && !error && features && features.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Column labels */}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px', gap: 8, padding: '0 0 6px', borderBottom: '1px solid var(--b1)', marginBottom: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--t4)', textTransform: 'uppercase' }}>Feature</div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--t4)', textTransform: 'uppercase', textAlign: 'center' }}>Impact</div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--t4)', textTransform: 'uppercase', textAlign: 'right' }}>SHAP</div>
            </div>

            {features.map((f, i) => (
              <div
                key={f.feature}
                style={{
                  display: 'grid', gridTemplateColumns: '180px 1fr 80px', gap: 8,
                  padding: '5px 0', borderBottom: '1px solid var(--b0)', alignItems: 'center',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                }}
              >
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.feature}
                </div>
                <ShapBar value={f.shap_value} maxAbs={maxAbs}/>
                <div style={{
                  fontSize: 11, fontFamily: 'var(--font-mono)', textAlign: 'right',
                  color: f.shap_value >= 0 ? '#1DE8E3' : '#F87171',
                  fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                }}>
                  {f.shap_value >= 0 ? '+' : ''}{f.shap_value.toFixed(4)}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && (!features || features.length === 0) && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--t4)', fontSize: 12 }}>
            No SHAP data available for this event.
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => navigate('/risk')} className="btn">
          <Cpu size={11}/> Risk Assessment
        </button>
        <button onClick={() => navigate('/map')} className="btn">
          <MapPin size={11}/> View on Map
        </button>
      </div>
    </div>
  )
}
