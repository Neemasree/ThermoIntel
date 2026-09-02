/**
 * MapPanel — premium thermal event visualization.
 * OSM tiles with night-mode filter. Real FRP-driven markers.
 * Selected event gets dual pulse halo. Intelligence tooltip.
 */
import React from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, ZoomControl } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
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

const INTENSITY_LEGEND = [
  { label: '> 1000 MW',  color: '#DC2626', tier: 'EXTREME'  },
  { label: '500 – 1000', color: '#EF4444', tier: 'CRITICAL' },
  { label: '200 – 500',  color: '#F97316', tier: 'HIGH'     },
  { label: '50 – 200',   color: '#F59E0B', tier: 'MODERATE' },
  { label: '< 50 MW',    color: '#38BDF8', tier: 'LOW'      },
]

function frpOpacity(frp: number | null): number {
  if (frp == null) return 0.45
  if (frp > 1000)  return 0.95
  if (frp > 500)   return 0.88
  if (frp > 200)   return 0.80
  if (frp > 50)    return 0.72
  return 0.58
}

export default function MapPanel({ events, selectedEvent, onSelect, status, error, hideOverlays }: Props) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        center={[20, 10]}
        zoom={2}
        style={{ height: '100%', width: '100%', background: '#03070E' }}
        zoomControl={false}
        attributionControl={true}
      >
        <ZoomControl position="bottomleft" />
        {/* OSM with strong night-mode CSS filter applied via .leaflet-tile-pane in CSS */}
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
          keepBuffer={4}
        />

        {status !== 'loading' && events.map(ev => {
          const sel = selectedEvent?.event_id === ev.event_id
          const color = frpColor(ev.frp)
          const r = markerRadius(ev.frp)
          const opacity = frpOpacity(ev.frp)

          return (
            <CircleMarker
              key={ev.event_id ?? `${ev.latitude},${ev.longitude}`}
              center={[ev.latitude, ev.longitude]}
              radius={sel ? r + 4 : r}
              pathOptions={{
                color: sel ? '#ffffff' : color,
                fillColor: color,
                fillOpacity: sel ? 1.0 : opacity,
                weight: sel ? 2 : 0.8,
                opacity: 1,
              }}
              eventHandlers={{ click: () => onSelect(ev) }}
            >
              <Tooltip offset={[12, 0]} direction="right">
                <div style={{ minWidth: 180 }}>
                  {/* Header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 8, paddingBottom: 7,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: color,
                      boxShadow: `0 0 8px ${color}`,
                      flexShrink: 0,
                    }}/>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      fontWeight: 600, color: 'var(--t1)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: 150,
                    }}>
                      {ev.event_id ?? 'UNKNOWN'}
                    </div>
                  </div>
                  {/* Fields */}
                  {[
                    { l: 'FRP',       v: ev.frp != null ? `${ev.frp.toLocaleString()} MW` : '—', accent: color },
                    { l: 'TIER',      v: frpTier(ev.frp),     accent: color },
                    { l: 'SATELLITE', v: ev.satellite ?? '—' },
                    { l: 'CONF',      v: confidenceLabel(ev.confidence) },
                    { l: 'TIME',      v: formatAcqTime(ev.acquisition_time) },
                    { l: 'D/N',       v: ev.daynight === 'D' ? 'Daytime' : ev.daynight === 'N' ? 'Nighttime' : '—' },
                  ].map(({ l, v, accent }) => (
                    <div key={l} style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'baseline', gap: 10,
                      padding: '2px 0',
                    }}>
                      <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>{l}</span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: accent ?? 'var(--t2)' }}>{v}</span>
                    </div>
                  ))}
                  <div style={{
                    marginTop: 6, paddingTop: 5,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t4)',
                    textAlign: 'center', letterSpacing: '0.08em',
                  }}>
                    CLICK TO INSPECT ›
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>

      {/* ── Loading overlay ── */}
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(3,7,14,0.75)',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{ textAlign: 'center' }}>
            {/* Orbital spinner */}
            <div style={{ position: 'relative', width: 44, height: 44, margin: '0 auto 14px' }}>
              <svg viewBox="0 0 44 44" width="44" height="44" style={{ animation: 'spin 1.6s linear infinite' }}>
                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(29,232,227,0.15)" strokeWidth="1.5"/>
                <circle cx="22" cy="22" r="18" fill="none" stroke="var(--cyan)" strokeWidth="1.5"
                  strokeDasharray="28 85" strokeLinecap="round"/>
              </svg>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', animation: 'thermalPulse 1.2s ease-in-out infinite' }}/>
              </div>
            </div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em', color: 'var(--t3)' }}>
              ACQUIRING THERMAL FEED
            </div>
          </div>
        </div>
      )}

      {/* ── Error banner ── */}
      {status === 'error' && !hideOverlays && (
        <div style={{
          position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'rgba(8,15,28,0.92)',
          border: '1px solid var(--err-b)',
          borderRadius: 'var(--r-md)',
          padding: '9px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 11, color: 'var(--err)',
          boxShadow: 'var(--sh-lg)',
          backdropFilter: 'blur(8px)',
          maxWidth: 420,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--err)', flexShrink: 0 }}/>
          <div>
            <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', marginBottom: 1 }}>
              DATA CONNECTION LOST
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--font-sans)' }}>
              Unable to retrieve live ThermalWatch telemetry
            </div>
          </div>
        </div>
      )}

      {/* ── Intensity legend ── */}
      {!hideOverlays && (
        <div style={{
          position: 'absolute', bottom: 40, right: 12, zIndex: 500,
          background: 'rgba(8,15,28,0.88)',
          border: '1px solid var(--b2)',
          borderRadius: 'var(--r-md)',
          padding: '10px 13px',
          boxShadow: 'var(--sh-md)',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{
            fontSize: 7.5, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.14em',
            color: 'var(--t4)', marginBottom: 8,
            fontFamily: 'var(--font-mono)',
            borderBottom: '1px solid var(--b1)',
            paddingBottom: 5,
          }}>
            FRP Intensity
          </div>
          {INTENSITY_LEGEND.map(({ label, color, tier }) => (
            <div key={tier} style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: color,
                boxShadow: `0 0 5px ${color}60`,
                flexShrink: 0,
              }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--t2)', letterSpacing: '0.04em' }}>{label}</div>
              </div>
              <div style={{
                fontSize: 7, fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.10em',
                color: color,
                opacity: 0.75,
              }}>
                {tier}
              </div>
            </div>
          ))}
          {/* Event count badge */}
          <div style={{
            marginTop: 7, paddingTop: 6,
            borderTop: '1px solid var(--b1)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>EVENTS</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
              {events.length.toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
