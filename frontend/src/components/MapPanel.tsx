import React, { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import type { ApiThermalEvent } from '../types/api'
import { frpColor, markerRadius, formatAcqTime, confidenceLabel, frpTier } from '../utils/eventUtils'

interface Props {
  events: ApiThermalEvent[]
  selectedEvent: ApiThermalEvent | null
  onSelect: (e: ApiThermalEvent) => void
  status: string
  error: string | null
  hideOverlays?: boolean
}

const LEGEND = [
  { label: '> 1000 MW',  color: '#DC2626', tier: 'Extreme'  },
  { label: '500\u20131000', color: '#EF4444', tier: 'Critical' },
  { label: '200\u2013500',  color: '#F97316', tier: 'High'     },
  { label: '50\u2013200',   color: '#F59E0B', tier: 'Moderate' },
  { label: '< 50 MW',    color: '#38BDF8', tier: 'Low'      },
]

/** Pick cluster color based on max FRP inside */
function clusterColor(maxFrp: number | null): string {
  if (maxFrp == null) return '#38BDF8'
  if (maxFrp > 1000)  return '#DC2626'
  if (maxFrp > 500)   return '#EF4444'
  if (maxFrp > 200)   return '#F97316'
  if (maxFrp > 50)    return '#F59E0B'
  return '#38BDF8'
}

/** Inner component that manages the MarkerClusterGroup layer */
function ClusterLayer({ events, selectedEvent, onSelect }: {
  events: ApiThermalEvent[]
  selectedEvent: ApiThermalEvent | null
  onSelect: (e: ApiThermalEvent) => void
}) {
  const map = useMap()
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)

  useEffect(() => {
    // Create cluster group with custom icon factory
    const group = (L as unknown as {
      markerClusterGroup: (opts: unknown) => L.MarkerClusterGroup
    }).markerClusterGroup({
      maxClusterRadius: 40,
      disableClusteringAtZoom: 7,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster: L.MarkerCluster) => {
        const children = cluster.getAllChildMarkers()
        // Find max FRP in cluster
        let maxFrp: number | null = null
        for (const m of children) {
          const frp = (m as unknown as { _frp?: number | null })._frp ?? null
          if (frp != null && (maxFrp == null || frp > maxFrp)) maxFrp = frp
        }
        const count = children.length
        const color = clusterColor(maxFrp)
        // Size scales with cluster size
        const size = count > 500 ? 48 : count > 100 ? 42 : count > 20 ? 36 : 30
        const html = `
          <div style="
            width:${size}px; height:${size}px;
            border-radius:50%;
            background:${color}22;
            border:2px solid ${color};
            box-shadow:0 0 12px ${color}60, 0 0 4px ${color}40;
            display:flex; align-items:center; justify-content:center;
            font-family:'JetBrains Mono',monospace;
            font-size:${count > 999 ? 9 : 11}px;
            font-weight:700;
            color:${color};
            position:relative;
          ">
            ${count > 9999 ? Math.round(count/1000)+'k' : count.toLocaleString()}
          </div>`
        return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size/2, size/2] })
      },
    })

    clusterRef.current = group
    map.addLayer(group)

    return () => {
      map.removeLayer(group)
      clusterRef.current = null
    }
  }, [map])

  useEffect(() => {
    const group = clusterRef.current
    if (!group) return

    group.clearLayers()

    for (const ev of events) {
      const sel   = selectedEvent?.event_id === ev.event_id
      const color = frpColor(ev.frp)
      const r     = markerRadius(ev.frp)

      const marker = L.circleMarker([ev.latitude, ev.longitude], {
        radius:      sel ? r + 5 : r,
        color:       sel ? '#FFFFFF' : color,
        fillColor:   color,
        fillOpacity: sel ? 1.0 : 0.88,
        weight:      sel ? 2.5 : 1.2,
        opacity:     1,
      })

      // Attach FRP for cluster icon factory
      ;(marker as unknown as { _frp: number | null })._frp = ev.frp ?? null

      // Tooltip
      const tooltipContent = `
        <div style="min-width:190px;font-family:var(--font-sans)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.10)">
            <div style="width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color};flex-shrink:0"></div>
            <div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:155px">${ev.event_id ?? 'Unknown'}</div>
          </div>
          <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:12px;color:var(--t3)">Fire Power</span><span style="font-size:13px;font-family:var(--font-mono);font-weight:600;color:${color}">${ev.frp != null ? ev.frp.toLocaleString()+' MW' : '\u2014'}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:12px;color:var(--t3)">Tier</span><span style="font-size:13px;font-family:var(--font-mono);font-weight:600;color:${color}">${frpTier(ev.frp)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:12px;color:var(--t3)">Satellite</span><span style="font-size:13px;font-family:var(--font-mono);color:var(--t2)">${ev.satellite ?? '\u2014'}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:12px;color:var(--t3)">Confidence</span><span style="font-size:13px;font-family:var(--font-mono);color:var(--t2)">${confidenceLabel(ev.confidence)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="font-size:12px;color:var(--t3)">Time</span><span style="font-size:13px;font-family:var(--font-mono);color:var(--t2)">${formatAcqTime(ev.acquisition_time)}</span></div>
          <div style="margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.07);font-size:11px;color:var(--t4);text-align:center">Click to inspect</div>
        </div>`

      marker.bindTooltip(tooltipContent, {
        direction: 'right',
        offset: [14, 0],
        opacity: 1,
        className: '',
      })

      marker.on('click', () => onSelect(ev))
      group.addLayer(marker)
    }
  }, [events, selectedEvent, onSelect])

  return null
}

export default function MapPanel({ events, selectedEvent, onSelect, status, error, hideOverlays }: Props) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        center={[20, 10]}
        zoom={2}
        style={{ height: '100%', width: '100%', background: '#0a0a0a' }}
        zoomControl={false}
      >
        <ZoomControl position="bottomleft"/>
        {/* CartoDB Dark Matter — free, no API key, proper dark basemap */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
          keepBuffer={4}
        />
        {status !== 'loading' && (
          <ClusterLayer
            events={events}
            selectedEvent={selectedEvent}
            onSelect={onSelect}
          />
        )}
      </MapContainer>

      {/* Loading */}
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', width: 48, height: 48, margin: '0 auto 16px' }}>
              <svg viewBox="0 0 48 48" width="48" height="48" style={{ animation: 'spin 1.6s linear infinite' }}>
                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(0,229,220,0.15)" strokeWidth="2"/>
                <circle cx="24" cy="24" r="20" fill="none" stroke="#00E5DC" strokeWidth="2" strokeDasharray="30 95" strokeLinecap="round"/>
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', animation: 'thermalPulse 1.2s ease-in-out infinite' }}/>
              </div>
            </div>
            <div style={{ fontSize: 14, color: 'var(--t3)', fontWeight: 500 }}>Loading thermal events\u2026</div>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && !hideOverlays && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: 'rgba(12,12,12,0.94)',
          border: '1px solid var(--err-b)', borderRadius: 10,
          padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: 'var(--sh-lg)', backdropFilter: 'blur(8px)', maxWidth: 440,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--err)', flexShrink: 0 }}/>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--err)', marginBottom: 2 }}>Connection lost</div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>Unable to load thermal event data</div>
          </div>
        </div>
      )}

      {/* Legend */}
      {!hideOverlays && (
        <div style={{
          position: 'absolute', bottom: 44, right: 14, zIndex: 500,
          background: 'rgba(12,12,12,0.92)', border: '1px solid var(--b2)',
          borderRadius: 10, padding: '12px 14px',
          boxShadow: 'var(--sh-md)', backdropFilter: 'blur(8px)',
          minWidth: 170,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.12em', color: 'var(--t3)', marginBottom: 10,
            borderBottom: '1px solid var(--b1)', paddingBottom: 7,
          }}>
            Fire Intensity (FRP)
          </div>
          {LEGEND.map(({ label, color, tier }) => (
            <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}80`, flexShrink: 0 }}/>
              <span style={{ fontSize: 12, color: 'var(--t2)', flex: 1 }}>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color }}>{tier}</span>
            </div>
          ))}
          <div style={{
            marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--b1)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>Shown</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
              {events.length.toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
