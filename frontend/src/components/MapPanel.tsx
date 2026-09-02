/**
 * MapPanel — ThermalWatch fire visualization.
 *
 * Markers: DivIcon with radial CSS glow halos — each fire glows with
 * an inner solid core + outer transparent halo. Intensity drives color
 * and size. Selected event gets a pulsing cyan ring.
 *
 * Basemap: CartoDB Dark Matter (free, no API key required).
 * Clustering: leaflet.markercluster with custom FRP-colored cluster icons.
 */
import React, { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import type { ApiThermalEvent } from '../types/api'
import { frpColor, formatAcqTime, confidenceLabel, frpTier } from '../utils/eventUtils'

interface Props {
  events: ApiThermalEvent[]
  selectedEvent: ApiThermalEvent | null
  onSelect: (e: ApiThermalEvent) => void
  status: string
  error: string | null
  hideOverlays?: boolean
}

// FRP → glow radius (px)
function glowSize(frp: number | null): number {
  if (frp == null) return 18
  if (frp > 2000)  return 46
  if (frp > 1000)  return 38
  if (frp > 500)   return 30
  if (frp > 200)   return 24
  if (frp > 50)    return 20
  return 16
}

// FRP → core dot radius (px)
function coreSize(frp: number | null): number {
  if (frp == null) return 5
  if (frp > 2000)  return 12
  if (frp > 1000)  return 10
  if (frp > 500)   return 8
  if (frp > 200)   return 7
  if (frp > 50)    return 6
  return 5
}

function clusterColor(maxFrp: number | null): string {
  if (maxFrp == null) return '#38BDF8'
  if (maxFrp > 1000)  return '#DC2626'
  if (maxFrp > 500)   return '#EF4444'
  if (maxFrp > 200)   return '#F97316'
  if (maxFrp > 50)    return '#F59E0B'
  return '#38BDF8'
}

/** Build the DivIcon HTML for a single fire marker */
function buildFireIcon(
  color: string,
  frp: number | null,
  selected: boolean,
): L.DivIcon {
  const gs   = glowSize(frp)
  const cs   = coreSize(frp)
  const half = gs / 2

  // Outer glow: radial gradient from color at center to transparent
  // Inner core: solid circle
  // Selected: additional pulsing cyan outer ring via CSS animation
  const pulseRing = selected
    ? `<div style="
        position:absolute;
        inset:${half - cs - 6}px;
        border-radius:50%;
        border:1.5px solid #1DE8E3;
        animation:mapPulse 1.6s ease-out infinite;
        pointer-events:none;
      "></div>`
    : ''

  const html = `
    <div style="
      position:relative;
      width:${gs}px; height:${gs}px;
      border-radius:50%;
      background:radial-gradient(circle, ${color}80 0%, ${color}30 35%, ${color}10 60%, transparent 75%);
      display:flex; align-items:center; justify-content:center;
      pointer-events:none;
    ">
      <div style="
        width:${cs}px; height:${cs}px;
        border-radius:50%;
        background:${color};
        box-shadow:0 0 ${cs * 2}px ${color}, 0 0 ${cs}px ${color}CC;
        flex-shrink:0;
      "></div>
      ${pulseRing}
    </div>`

  return L.divIcon({
    html,
    className: '',
    iconSize:   [gs, gs],
    iconAnchor: [half, half],
  })
}

/** Inject keyframe once into document head */
let _injected = false
function injectMapAnimations() {
  if (_injected || typeof document === 'undefined') return
  _injected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes mapPulse {
      0%   { transform: scale(1);   opacity: 0.8; }
      100% { transform: scale(3.0); opacity: 0; }
    }
  `
  document.head.appendChild(style)
}

// ── DarkTileLayer ─────────────────────────────────────────────────────────────
// Tries Stadia dark → CartoDB dark → OSM with dark filter in sequence.

const TILE_PROVIDERS = [
  {
    url:  'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
    attr: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    filter: 'none',
  },
  {
    url:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    filter: 'none',
  },
  {
    url:  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    filter: 'brightness(0.35) saturate(0.3) hue-rotate(185deg)',
  },
]

function DarkTileLayer() {
  const [idx, setIdx] = useState(0)
  const provider = TILE_PROVIDERS[idx]

  // Apply filter to tile pane for this provider
  const map = useMap()
  useEffect(() => {
    const pane = map.getPane('tilePane')
    if (pane) pane.style.filter = provider.filter
  }, [idx, map, provider.filter])

  return (
    <TileLayer
      key={idx}
      url={provider.url}
      attribution={provider.attr}
      maxZoom={20}
      keepBuffer={4}
      eventHandlers={{
        tileerror: () => {
          if (idx < TILE_PROVIDERS.length - 1) setIdx(i => i + 1)
        },
      }}
    />
  )
}

// ── ClusterLayer ─────────────────────────────────────────────────────────────

function ClusterLayer({ events, selectedEvent, onSelect }: {
  events: ApiThermalEvent[]
  selectedEvent: ApiThermalEvent | null
  onSelect: (e: ApiThermalEvent) => void
}) {
  const map        = useMap()
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)

  // Create cluster group once
  useEffect(() => {
    injectMapAnimations()

    const group = (L as unknown as {
      markerClusterGroup: (opts: unknown) => L.MarkerClusterGroup
    }).markerClusterGroup({
      maxClusterRadius: 50,
      disableClusteringAtZoom: 8,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster: L.MarkerCluster) => {
        const children = cluster.getAllChildMarkers()
        let maxFrp: number | null = null
        for (const m of children) {
          const frp = (m as unknown as { _frp?: number | null })._frp ?? null
          if (frp != null && (maxFrp == null || frp > maxFrp)) maxFrp = frp
        }
        const count = children.length
        const color = clusterColor(maxFrp)
        const size  = count > 200 ? 52 : count > 50 ? 44 : count > 10 ? 36 : 28
        const half  = size / 2
        const label = count > 9999 ? `${Math.round(count / 1000)}k` : count.toLocaleString()
        const html = `
          <div style="
            position:relative; width:${size}px; height:${size}px;
            border-radius:50%;
            background:radial-gradient(circle, ${color}40 0%, ${color}15 50%, transparent 75%);
            display:flex; align-items:center; justify-content:center;
          ">
            <div style="
              width:${size - 8}px; height:${size - 8}px;
              border-radius:50%;
              background:transparent;
              border:1.5px solid ${color};
              box-shadow:0 0 14px ${color}70, inset 0 0 8px ${color}20;
              display:flex; align-items:center; justify-content:center;
              font-family:'JetBrains Mono',monospace;
              font-size:${count > 999 ? 9 : 11}px;
              font-weight:700;
              color:${color};
            ">
              ${label}
            </div>
          </div>`
        return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [half, half] })
      },
    })

    clusterRef.current = group
    map.addLayer(group)
    return () => { map.removeLayer(group); clusterRef.current = null }
  }, [map])

  // Rebuild markers whenever events / selection changes
  useEffect(() => {
    const group = clusterRef.current
    if (!group) return

    group.clearLayers()

    for (const ev of events) {
      const sel   = selectedEvent?.event_id === ev.event_id
      const color = frpColor(ev.frp)
      const icon  = buildFireIcon(color, ev.frp, sel)

      const marker = L.marker([ev.latitude, ev.longitude], { icon })
      ;(marker as unknown as { _frp: number | null })._frp = ev.frp ?? null

      const tooltipContent = `
        <div style="min-width:200px;font-family:var(--font-sans,Inter,sans-serif)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.10)">
            <div style="width:9px;height:9px;border-radius:50%;background:${color};box-shadow:0 0 7px ${color};flex-shrink:0"></div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:165px">
              ${ev.event_id ?? 'Unknown'}
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0">
            <span style="font-size:12px;color:#909090">Fire Power</span>
            <span style="font-size:14px;font-family:'JetBrains Mono',monospace;font-weight:700;color:${color}">${ev.frp != null ? ev.frp.toLocaleString() + ' MW' : '\u2014'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0">
            <span style="font-size:12px;color:#909090">Intensity</span>
            <span style="font-size:12px;font-family:'JetBrains Mono',monospace;font-weight:600;color:${color}">${frpTier(ev.frp)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0">
            <span style="font-size:12px;color:#909090">Satellite</span>
            <span style="font-size:12px;font-family:'JetBrains Mono',monospace;color:#d4d4d4">${ev.satellite ?? '\u2014'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0">
            <span style="font-size:12px;color:#909090">Confidence</span>
            <span style="font-size:12px;font-family:'JetBrains Mono',monospace;color:#d4d4d4">${confidenceLabel(ev.confidence)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0">
            <span style="font-size:12px;color:#909090">Time</span>
            <span style="font-size:12px;font-family:'JetBrains Mono',monospace;color:#d4d4d4">${formatAcqTime(ev.acquisition_time)}</span>
          </div>
          <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.07);font-size:11px;color:#555;text-align:center">
            Click to inspect full record
          </div>
        </div>`

      marker.bindTooltip(tooltipContent, { direction: 'right', offset: [14, 0], opacity: 1, className: '' })
      marker.on('click', () => onSelect(ev))
      group.addLayer(marker)
    }
  }, [events, selectedEvent, onSelect])

  return null
}

// ── Legend data ───────────────────────────────────────────────────────────────

const LEGEND = [
  { range: '< 50 MW',     color: '#38BDF8' },
  { range: '50\u2013200', color: '#F59E0B' },
  { range: '200\u2013500',color: '#F97316' },
  { range: '500\u20131k', color: '#EF4444' },
  { range: '> 1000 MW',   color: '#DC2626' },
]

// ── MapPanel ──────────────────────────────────────────────────────────────────

export default function MapPanel({ events, selectedEvent, onSelect, status, error, hideOverlays }: Props) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        center={[20, 10]}
        zoom={2}
        style={{ height: '100%', width: '100%', background: '#1a2233' }}
        zoomControl={false}
        preferCanvas={false}
      >
        <ZoomControl position="bottomleft"/>

        {/* Dark basemap with automatic provider fallback */}
        <DarkTileLayer />

        {status !== 'loading' && (
          <ClusterLayer
            events={events}
            selectedEvent={selectedEvent}
            onSelect={onSelect}
          />
        )}
      </MapContainer>

      {/* ── Loading overlay ── */}
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', width: 48, height: 48, margin: '0 auto 16px' }}>
              <svg viewBox="0 0 48 48" width="48" height="48" style={{ animation: 'spin 1.6s linear infinite' }}>
                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(29,232,227,0.15)" strokeWidth="2"/>
                <circle cx="24" cy="24" r="20" fill="none" stroke="#1DE8E3" strokeWidth="2" strokeDasharray="30 95" strokeLinecap="round"/>
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', animation: 'thermalPulse 1.2s ease-in-out infinite' }}/>
              </div>
            </div>
            <div style={{ fontSize: 14, color: '#909090', fontWeight: 500 }}>Loading fire events\u2026</div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>Sampling global dataset</div>
          </div>
        </div>
      )}

      {/* ── Error banner ── */}
      {status === 'error' && !hideOverlays && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: 'rgba(10,10,10,0.95)',
          border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10,
          padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 40px rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)', maxWidth: 440,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#F87171', flexShrink: 0 }}/>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#F87171', marginBottom: 2 }}>Connection lost</div>
            <div style={{ fontSize: 12, color: '#909090' }}>Unable to load thermal event data</div>
          </div>
        </div>
      )}

      {/* ── FRP Legend ── */}
      {!hideOverlays && (
        <div style={{
          position: 'absolute', bottom: 44, left: 16, zIndex: 500,
          background: 'rgba(10,10,10,0.88)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: '10px 14px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.14em', color: '#555', marginBottom: 8,
          }}>
            Fire Radiative Power (FRP)
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {LEGEND.map(({ range, color }) => (
              <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: color,
                  boxShadow: `0 0 8px ${color}90`,
                  flexShrink: 0,
                }}/>
                <span style={{ fontSize: 11, color: '#d4d4d4', whiteSpace: 'nowrap' }}>{range}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Event count badge ── */}
      {!hideOverlays && events.length > 0 && (
        <div style={{
          position: 'absolute', top: 14, right: 14, zIndex: 500,
          background: 'rgba(10,10,10,0.88)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '6px 12px',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <span className="live-dot" style={{ width: 6, height: 6 }}/>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: '#1DE8E3' }}>
            {events.length.toLocaleString()}
          </span>
          <span style={{ fontSize: 11, color: '#555' }}>events</span>
        </div>
      )}
    </div>
  )
}
