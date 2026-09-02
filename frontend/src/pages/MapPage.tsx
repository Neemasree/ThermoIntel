import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { AlertCircle, Loader, Layers, ChevronRight, Satellite, MapPin } from 'lucide-react'
import { useAppContext } from '../App'
import type { ApiThermalEvent } from '../types/api'
import type { ApiPrediction } from '../types/api'
import { formatAcqTime, confidenceLabel } from '../utils/eventUtils'
import { api } from '../services/api'
import type { ApiEventFeatures } from '../services/api'

// ── Color by TIME SINCE DETECTION (like NASA FIRMS map) ──────────────────────
// Red = < 24h (most recent/urgent), Orange = 24-48h, Yellow = 48-72h, Grey = older
function hoursAgo(acqDate: string | null, acqTime: number | null): number {
  if (!acqDate) return 999
  const mins = acqTime ?? 0
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const dt = new Date(`${acqDate}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`)
  return (Date.now() - dt.getTime()) / 3_600_000
}

function timeColor(hours: number): string {
  if (hours < 24)  return '#FF0000'   // red   — < 24h
  if (hours < 48)  return '#FF6600'   // orange — 24-48h
  if (hours < 72)  return '#FFCC00'   // yellow — 48-72h
  return '#AAAAAA'                     // grey   — older
}

// Size by FRP intensity
function frpRadius(frp: number | null): number {
  if (frp == null) return 3
  if (frp > 500)   return 9
  if (frp > 200)   return 7
  if (frp > 100)   return 6
  if (frp > 50)    return 5
  if (frp > 20)    return 4
  return 3
}

function frpLabel(frp: number | null): string {
  if (frp == null) return 'N/A'
  return `${frp.toLocaleString()} MW`
}
function distFmt(d: number | null): string {
  if (d == null) return 'Pending'
  if (d < 1) return `${(d * 1000).toFixed(0)} m`
  return `${d.toFixed(2)} km`
}

function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  useMapEvents({ zoomend: (e) => onZoom(e.target.getZoom()) })
  return null
}

function IR({ label, val, color, mono = true }: { label: string; val: string; color?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid var(--b0)', gap: 8 }}>
      <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', color: color ?? 'var(--t1)', fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
    </div>
  )
}

function InspectorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t4)', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--b1)' }}>{title}</div>
      {children}
    </div>
  )
}

function FeedRow({ event, selected, onClick }: { event: ApiThermalEvent; selected: boolean; onClick: () => void }) {
  const hrs = hoursAgo(event.acquisition_date, event.acquisition_time)
  const c = timeColor(hrs)
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px',
        borderBottom: '1px solid var(--b0)', cursor: 'pointer',
        background: selected ? 'rgba(29,232,227,0.06)' : 'transparent',
        borderLeft: `2px solid ${selected ? 'var(--cyan)' : 'transparent'}`,
        transition: 'all var(--ease)', flexShrink: 0,
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'var(--d5)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}`, flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: selected ? 'var(--cyan)' : 'var(--t2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.event_id ?? `#${event.id}`}
        </div>
        <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 1 }}>{event.satellite ?? 'Unknown'} · {event.acquisition_date ?? 'Unknown'}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: c, fontWeight: 700 }}>{frpLabel(event.frp)}</div>
        <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 1 }}>
          {hrs < 24 ? `${Math.round(hrs)}h ago` : hrs < 48 ? '1 day ago' : hrs < 72 ? '2 days ago' : '3+ days ago'}
        </div>
      </div>
    </div>
  )
}

export default function MapPage() {
  const { events, status, error, selectedEvent, setSelectedEvent } = useAppContext()
  const [zoom, setZoom] = useState(2)
  const [showLayers, setShowLayers] = useState(false)
  const [layerMode, setLayerMode] = useState<'time' | 'frp'>('time')
  const [mapPrediction, setMapPrediction] = useState<ApiPrediction | null>(null)
  const [mapPredLoading, setMapPredLoading] = useState(false)
  const [eventFeatures, setEventFeatures] = useState<ApiEventFeatures | null>(null)

  const ev = selectedEvent

  useEffect(() => {
    if (!ev) { setMapPrediction(null); setEventFeatures(null); return }
    const controller = new AbortController()
    setMapPredLoading(true)
    api.predict(ev.id, controller.signal)
      .then(r => { if (!controller.signal.aborted) setMapPrediction(r) })
      .catch(() => { if (!controller.signal.aborted) setMapPrediction(null) })
      .finally(() => { if (!controller.signal.aborted) setMapPredLoading(false) })
    api.eventFeatures(ev.id, controller.signal)
      .then(r => { if (!controller.signal.aborted) setEventFeatures(r) })
      .catch(() => { if (!controller.signal.aborted) setEventFeatures(null) })
    return () => controller.abort()
  }, [ev?.id])

  const visibleEvents = useMemo(() => {
    if (events.length <= 2000) return events
    const recent = events.slice(0, 500)
    const rest = events.slice(500)
    const step = Math.ceil(rest.length / 1500)
    return [...recent, ...rest.filter((_, i) => i % step === 0)]
  }, [events])

  const feedEvents = useMemo(() => events.slice(0, 8), [events])
  const handleMarkerClick = useCallback((e: ApiThermalEvent) => setSelectedEvent(e), [setSelectedEvent])

  return (
    <div className="map-fill" style={{ display: 'flex', overflow: 'hidden', position: 'relative' }}>
      <div style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0 }}>
        <MapContainer center={[20, 10]} zoom={2} style={{ height: '100%', width: '100%' }} zoomControl attributionControl>
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            attribution='&copy; <a href="https://www.esri.com">Esri</a>'
            maxZoom={16}
          />
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
            attribution='' maxZoom={16} opacity={0.8}
          />
          <ZoomTracker onZoom={setZoom}/>

          {visibleEvents.map(event => {
            const hrs = hoursAgo(event.acquisition_date, event.acquisition_time)
            const c = layerMode === 'time' ? timeColor(hrs) : (
              event.frp == null ? '#AAAAAA' :
              event.frp > 500 ? '#DC2626' :
              event.frp > 200 ? '#F97316' :
              event.frp > 100 ? '#FB923C' :
              event.frp > 50  ? '#FCD34D' :
              event.frp > 20  ? '#A3E635' : '#38BDF8'
            )
            const r = frpRadius(event.frp)
            const isSelected = ev?.id === event.id
            return (
              <CircleMarker
                key={event.id}
                center={[event.latitude, event.longitude]}
                radius={isSelected ? r + 3 : r}
                pathOptions={{
                  color: isSelected ? '#1DE8E3' : c,
                  fillColor: c,
                  fillOpacity: isSelected ? 1 : 0.85,
                  weight: isSelected ? 2 : 0.5,
                }}
                eventHandlers={{ click: () => handleMarkerClick(event) }}
              >
                <Tooltip>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7 }}>
                    <div style={{ fontWeight: 700, color: '#1DE8E3', marginBottom: 2 }}>{event.event_id ?? `ID ${event.id}`}</div>
                    <div style={{ color: c, fontWeight: 700 }}>
                      {hrs < 24 ? `🔴 ${Math.round(hrs)}h ago` : hrs < 48 ? '🟠 1 day ago' : hrs < 72 ? '🟡 2 days ago' : '⚪ 3+ days ago'}
                    </div>
                    <div style={{ color: '#D4D4D4' }}>FRP: {frpLabel(event.frp)}</div>
                    <div style={{ color: '#909090' }}>{event.satellite} · {event.firms_source}</div>
                    <div style={{ color: '#909090' }}>{event.acquisition_date} {formatAcqTime(event.acquisition_time)}</div>
                    <div style={{ color: '#909090' }}>{event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}</div>
                  </div>
                </Tooltip>
              </CircleMarker>
            )
          })}
        </MapContainer>

        {status === 'loading' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <div style={{ textAlign: 'center', color: '#D4D4D4' }}>
              <Loader size={22} color="#1DE8E3" style={{ animation: 'spin 0.9s linear infinite', marginBottom: 10 }}/>
              <div style={{ fontSize: 13 }}>Loading thermal observations...</div>
            </div>
          </div>
        )}
        {status === 'error' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <div style={{ textAlign: 'center', color: '#F87171', maxWidth: 300 }}>
              <AlertCircle size={22} style={{ marginBottom: 10 }}/>
              <div style={{ fontSize: 13 }}>Data source unavailable</div>
              <div style={{ fontSize: 11, color: '#555' }}>{error}</div>
            </div>
          </div>
        )}

        {/* Layers toggle */}
        <div style={{ position: 'absolute', top: 80, left: 10, zIndex: 500 }}>
          <button
            onClick={() => setShowLayers(p => !p)}
            style={{ width: 30, height: 30, background: showLayers ? 'rgba(29,232,227,0.12)' : 'rgba(17,17,17,0.94)', border: `1px solid ${showLayers ? 'rgba(29,232,227,0.4)' : '#3E3E3E'}`, borderRadius: 6, color: showLayers ? '#1DE8E3' : '#D4D4D4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Layers size={13}/>
          </button>
          {showLayers && (
            <div style={{ position: 'absolute', left: 36, top: 0, background: 'rgba(17,17,17,0.97)', border: '1px solid #3E3E3E', borderRadius: 7, padding: '10px 14px', minWidth: 190 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#555', marginBottom: 10 }}>COLOUR MODE</div>
              {(['time', 'frp'] as const).map(mode => (
                <div key={mode} onClick={() => setLayerMode(mode)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${layerMode === mode ? '#1DE8E3' : '#3E3E3E'}`, background: layerMode === mode ? 'rgba(29,232,227,0.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {layerMode === mode && <div style={{ width: 6, height: 6, borderRadius: 1, background: '#1DE8E3' }}/>}
                  </div>
                  <span style={{ fontSize: 11, color: layerMode === mode ? '#D4D4D4' : '#909090' }}>
                    {mode === 'time' ? '🕐 Time since detection' : '🔥 Fire intensity (FRP)'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ position: 'absolute', bottom: 80, left: 12, zIndex: 500, background: 'rgba(10,10,10,0.92)', border: '1px solid #2E2E2E', borderRadius: 7, padding: '10px 12px', backdropFilter: 'blur(8px)' }}>
          {layerMode === 'time' ? (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#555', marginBottom: 7 }}>TIME SINCE DETECTION</div>
              {[
                { color: '#FF0000', label: '< 24 hours' },
                { color: '#FF6600', label: '24 – 48 hours' },
                { color: '#FFCC00', label: '48 – 72 hours' },
                { color: '#AAAAAA', label: '> 72 hours' },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }}/>
                  <span style={{ fontSize: 10, color: '#909090', fontFamily: 'var(--font-mono)' }}>{label}</span>
                </div>
              ))}
              <div style={{ marginTop: 6, fontSize: 9, color: '#555', borderTop: '1px solid #2E2E2E', paddingTop: 5 }}>Dot size = FRP intensity</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#555', marginBottom: 7 }}>FIRE RADIATIVE POWER</div>
              {[
                { color: '#38BDF8', label: '< 20 MW' },
                { color: '#A3E635', label: '20 – 50 MW' },
                { color: '#FCD34D', label: '50 – 100 MW' },
                { color: '#FB923C', label: '100 – 200 MW' },
                { color: '#F97316', label: '200 – 500 MW' },
                { color: '#DC2626', label: '500+ MW' },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }}/>
                  <span style={{ fontSize: 10, color: '#909090', fontFamily: 'var(--font-mono)' }}>{label}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Live badge */}
        {status === 'live' && (
          <div style={{ position: 'absolute', top: 12, right: ev ? 336 : 12, zIndex: 500, background: 'rgba(10,10,10,0.92)', border: '1px solid rgba(29,232,227,0.22)', borderRadius: 6, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(8px)' }}>
            <div className="live-dot" style={{ width: 6, height: 6 }}/>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#1DE8E3', fontWeight: 700, letterSpacing: '0.08em' }}>
              {visibleEvents.length.toLocaleString()} EVENTS
              {visibleEvents.length < events.length && ` (${events.length.toLocaleString()} total)`}
            </span>
          </div>
        )}

        {/* Live feed strip */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: ev ? 320 : 0, zIndex: 500, background: 'rgba(10,10,10,0.94)', borderTop: '1px solid #2E2E2E', backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto' }}>
            <div style={{ padding: '6px 14px', borderRight: '1px solid #2E2E2E', flexShrink: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#555' }}>LIVE FEED</div>
            </div>
            {status === 'loading' && <div style={{ padding: '8px 14px', fontSize: 11, color: '#555' }}>Loading...</div>}
            {feedEvents.map(event => (
              <FeedRow key={event.id} event={event} selected={ev?.id === event.id} onClick={() => setSelectedEvent(event)}/>
            ))}
          </div>
        </div>
      </div>

      {/* Right Inspector */}
      {ev && (
        <div style={{ width: 320, minWidth: 320, flexShrink: 0, background: 'var(--d2)', borderLeft: '1px solid var(--b1)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideIn 0.2s ease' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--b1)', flexShrink: 0, background: 'var(--d3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--cyan)', textTransform: 'uppercase' }}>Selected Fire Event</div>
              <button onClick={() => setSelectedEvent(null)} style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>
            {/* Time since detection badge */}
            {(() => {
              const hrs = hoursAgo(ev.acquisition_date, ev.acquisition_time)
              const c = timeColor(hrs)
              const label = hrs < 24 ? `${Math.round(hrs)}h ago` : hrs < 48 ? '1 day ago' : hrs < 72 ? '2 days ago' : '3+ days ago'
              return (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `${c}22`, border: `1px solid ${c}66`, borderRadius: 4, padding: '2px 8px', marginBottom: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}` }}/>
                  <span style={{ fontSize: 10, fontWeight: 700, color: c, fontFamily: 'var(--font-mono)' }}>DETECTED {label.toUpperCase()}</span>
                </div>
              )
            })()}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 4, wordBreak: 'break-all' }}>{ev.event_id ?? `ID ${ev.id}`}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Satellite size={10} color="var(--t4)"/>
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>{ev.satellite ?? 'Unknown'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={10} color="var(--t4)"/>
                <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>{ev.latitude.toFixed(4)}, {ev.longitude.toFixed(4)}</span>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
            <InspectorSection title="Thermal Signal">
              <IR label="FRP" val={ev.frp != null ? `${ev.frp.toLocaleString()} MW` : 'N/A'} color={ev.frp != null ? (ev.frp > 200 ? '#F97316' : ev.frp > 50 ? '#FCD34D' : '#38BDF8') : undefined}/>
              <IR label="Brightness" val={ev.brightness != null ? `${ev.brightness.toFixed(1)} K` : 'N/A'}/>
              <IR label="Confidence" val={confidenceLabel(ev.confidence)}/>
              <IR label="Day / Night" val={ev.daynight === 'D' ? 'Daytime' : ev.daynight === 'N' ? 'Nighttime' : 'Unknown'}/>
              <IR label="Source" val={ev.firms_source ?? 'Unknown'}/>
            </InspectorSection>

            <InspectorSection title="Acquisition">
              <IR label="Date" val={ev.acquisition_date ?? 'Unknown'}/>
              <IR label="Time (UTC)" val={formatAcqTime(ev.acquisition_time)}/>
              <IR label="Satellite" val={ev.satellite ?? 'Unknown'}/>
              <IR label="Instrument" val={ev.instrument ?? 'Unknown'}/>
            </InspectorSection>

            <InspectorSection title="Nearby Infrastructure">
              {ev.osm_enrichment_status === 'enriched' ? (
                <>
                  <IR label="Road" val={distFmt(ev.distance_to_road)}/>
                  <IR label="Industrial" val={distFmt(ev.distance_to_industrial)}/>
                  <IR label="Refinery" val={distFmt(ev.distance_to_refinery)}/>
                  <IR label="Power Plant" val={distFmt(ev.distance_to_powerplant)}/>
                  <IR label="Mine" val={distFmt(ev.distance_to_mine)}/>
                  <IR label="Gas Facility" val={distFmt(ev.distance_to_gas_facility)}/>
                </>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--t4)', padding: '6px 0', fontStyle: 'italic' }}>
                  {ev.osm_enrichment_status === 'pending' ? 'OSM enrichment in progress...' : 'Pending'}
                </div>
              )}
            </InspectorSection>

            <InspectorSection title="Land Cover">
              {ev.worldcover_class_name ? (
                <>
                  <IR label="Class" val={ev.worldcover_class_name}/>
                  {eventFeatures?.wc_forest_pct != null && <IR label="Forest" val={`${eventFeatures.wc_forest_pct.toFixed(1)}%`}/>}
                  {eventFeatures?.wc_cropland_pct != null && <IR label="Cropland" val={`${eventFeatures.wc_cropland_pct.toFixed(1)}%`}/>}
                  {eventFeatures?.wc_grassland_pct != null && <IR label="Grassland" val={`${eventFeatures.wc_grassland_pct.toFixed(1)}%`}/>}
                  {eventFeatures?.wc_builtup_pct != null && <IR label="Built-up" val={`${eventFeatures.wc_builtup_pct.toFixed(1)}%`}/>}
                  {eventFeatures?.wc_water_pct != null && <IR label="Water" val={`${eventFeatures.wc_water_pct.toFixed(1)}%`}/>}
                </>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--t4)', padding: '6px 0', fontStyle: 'italic' }}>
                  {ev.worldcover_enrichment_status === 'pending' ? 'WorldCover enrichment pending...' : 'Pending'}
                </div>
              )}
            </InspectorSection>

            {eventFeatures?.detections_7d != null && (
              <InspectorSection title="Temporal">
                <IR label="7D Detections" val={String(eventFeatures.detections_7d)}/>
                <IR label="30D Detections" val={String(eventFeatures.detections_30d ?? 'N/A')}/>
                <IR label="Mean FRP 30D" val={eventFeatures.mean_frp_30d != null ? `${eventFeatures.mean_frp_30d.toFixed(1)} MW` : 'N/A'}/>
                <IR label="Active Days 30D" val={String(eventFeatures.days_active_30d ?? 'N/A')}/>
                <IR label="Persistence" val={eventFeatures.persistence_score != null ? eventFeatures.persistence_score.toFixed(3) : 'N/A'}/>
              </InspectorSection>
            )}

            {eventFeatures?.frp_deviation != null && (
              <InspectorSection title="Anomaly">
                <IR label="FRP Deviation" val={eventFeatures.frp_deviation.toFixed(2)}/>
                <IR label="FRP Ratio" val={eventFeatures.frp_ratio != null ? eventFeatures.frp_ratio.toFixed(3) : 'N/A'}/>
                <IR label="Brightness Dev." val={eventFeatures.brightness_deviation != null ? eventFeatures.brightness_deviation.toFixed(2) : 'N/A'}/>
              </InspectorSection>
            )}

            <InspectorSection title="AI Classification">
              {mapPredLoading ? (
                <div style={{ fontSize: 11, color: 'var(--t4)', padding: '4px 0' }}>Running inference...</div>
              ) : mapPrediction?.prediction ? (() => {
                const cls = mapPrediction.prediction.class
                const conf = mapPrediction.prediction.confidence
                const clsColor = cls === 'wildfire' ? 'var(--err)' : cls === 'industrial_thermal_source' ? 'var(--amber)' : cls === 'agricultural_burning' ? 'var(--warn)' : 'var(--t3)'
                const clsLabel = cls.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                return (
                  <>
                    <IR label="Class" val={clsLabel} color={clsColor}/>
                    <IR label="Confidence" val={`${(conf * 100).toFixed(1)}%`}/>
                    <IR label="Model" val={mapPrediction.prediction.model}/>
                  </>
                )
              })() : (
                <div style={{ fontSize: 11, color: 'var(--t4)', padding: '4px 0' }}>
                  {mapPrediction?.status === 'model_not_found' ? 'Model not found' : 'Install xgboost in venv to enable'}
                </div>
              )}
            </InspectorSection>
          </div>

          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--b1)', flexShrink: 0 }}>
            <a href="/risk" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 0', background: 'var(--cyan-bg)', border: '1px solid var(--cyan-border)', borderRadius: 6, color: 'var(--cyan)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textDecoration: 'none' }}>
              Full Risk Assessment <ChevronRight size={12}/>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
