/**
 * MapPage — Full-screen immersive satellite thermal visualization.
 * Floating glass layer controls. Right-docked intelligence console.
 */
import React, { useState } from 'react'
import { Layers, ChevronDown, ChevronUp } from 'lucide-react'
import { useAppContext } from '../App'
import { frpColor, frpTier } from '../utils/eventUtils'
import EventInspector from '../components/EventInspector'
import MapPanel from '../components/MapPanel'

type LayerKey = 'events'

/* ── Floating layer toggle ── */
function LayerToggle({
  label, active, color, count, onClick,
}: {
  label: string; active: boolean; color: string; count?: number; onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px', cursor: 'pointer',
        borderRadius: 'var(--r-sm)',
        background: active ? `${color}12` : 'transparent',
        border: `1px solid ${active ? color + '40' : 'transparent'}`,
        transition: 'all var(--ease)',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <div style={{
        width: 10, height: 10, borderRadius: 2, flexShrink: 0,
        background: active ? color : 'transparent',
        border: `1.5px solid ${color}`,
        boxShadow: active ? `0 0 6px ${color}50` : 'none',
        transition: 'all var(--ease)',
      }}/>
      <span style={{ fontSize: 10, color: active ? 'var(--t2)' : 'var(--t4)', flex: 1 }}>{label}</span>
      {count != null && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: active ? color : 'var(--t4)' }}>
          {count.toLocaleString()}
        </span>
      )}
    </div>
  )
}

export default function MapPage() {
  const { events, status, error, selectedEvent, setSelectedEvent } = useAppContext()
  const [layers, setLayers] = useState<Set<LayerKey>>(new Set(['events']))
  const [layerPanelOpen, setLayerPanelOpen] = useState(true)

  const toggle = (k: LayerKey) =>
    setLayers(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', position: 'relative' }}>

      {/* ── Map — takes full space ── */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <MapPanel
          events={layers.has('events') ? events : []}
          selectedEvent={selectedEvent}
          onSelect={setSelectedEvent}
          status={status}
          error={error}
        />

        {/* Floating layer control panel */}
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 600,
          background: 'rgba(8,15,28,0.90)',
          border: '1px solid var(--b2)',
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
          backdropFilter: 'blur(10px)',
          minWidth: 180,
          boxShadow: 'var(--sh-md)',
        }}>
          {/* Panel header */}
          <div
            onClick={() => setLayerPanelOpen(o => !o)}
            style={{
              padding: '7px 10px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer',
              borderBottom: layerPanelOpen ? '1px solid var(--b1)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={11} color="var(--t3)"/>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
                MAP LAYERS
              </span>
            </div>
            {layerPanelOpen ? <ChevronUp size={10} color="var(--t4)"/> : <ChevronDown size={10} color="var(--t4)"/>}
          </div>

          {layerPanelOpen && (
            <div style={{ padding: '6px 8px 8px' }}>
              <LayerToggle
                label="Thermal Events" active={layers.has('events')}
                color="#F59E0B" count={events.length}
                onClick={() => toggle('events')}/>
              {/* Pending layers */}
              <div style={{ opacity: 0.32, pointerEvents: 'none' }}>
                <LayerToggle label="Facility Overlay" active={false} color="var(--sky)" onClick={() => {}}/>
                <LayerToggle label="Satellite Coverage" active={false} color="var(--violet)" onClick={() => {}}/>
              </div>
              <div style={{
                fontSize: 7.5, color: 'var(--t4)', fontFamily: 'var(--font-mono)',
                marginTop: 4, paddingTop: 5,
                borderTop: '1px solid var(--b1)',
                letterSpacing: '0.06em',
              }}>
                OSM / coverage layers pending
              </div>
            </div>
          )}
        </div>

        {/* Floating mini event list */}
        <div style={{
          position: 'absolute', top: 12, left: 12 + 190 + 8, zIndex: 600,
          background: 'rgba(8,15,28,0.88)',
          border: '1px solid var(--b2)',
          borderRadius: 'var(--r-md)',
          backdropFilter: 'blur(10px)',
          boxShadow: 'var(--sh-md)',
          width: 210,
          maxHeight: 340,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '7px 10px',
            borderBottom: '1px solid var(--b1)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
              EVENTS
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)' }}>
              {events.length.toLocaleString()}
            </span>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {events.slice(0, 200).map(ev => {
              const sel = selectedEvent?.event_id === ev.event_id
              const fc = frpColor(ev.frp)
              return (
                <div
                  key={ev.event_id ?? `${ev.latitude},${ev.longitude}`}
                  onClick={() => setSelectedEvent(ev)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '5px 10px',
                    cursor: 'pointer',
                    background: sel ? 'var(--d7)' : 'transparent',
                    borderLeft: `2px solid ${sel ? 'var(--cyan)' : 'transparent'}`,
                    borderBottom: '1px solid var(--b0)',
                    transition: 'background var(--ease)',
                  }}
                  onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: fc, flexShrink: 0, boxShadow: `0 0 4px ${fc}60` }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 8.5,
                      color: sel ? 'var(--cyan)' : 'var(--t2)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ev.event_id ?? '—'}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--t4)' }}>
                      {ev.frp != null ? `${ev.frp.toLocaleString()} MW` : ev.satellite ?? '—'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Right: intelligence panel ── */}
      <div style={{
        width: 272, minWidth: 272, flexShrink: 0,
        background: 'var(--d3)',
        borderLeft: '1px solid var(--b1)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '7px 14px',
          borderBottom: '1px solid var(--b1)',
          flexShrink: 0,
          background: 'var(--d4)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 2, height: 12, background: 'var(--cyan)', borderRadius: 1, boxShadow: '0 0 4px var(--cyan)' }}/>
            <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
              Event Intelligence
            </span>
          </div>
          {selectedEvent && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 7.5,
              color: 'var(--t4)',
              background: 'var(--d5)', border: '1px solid var(--b2)',
              borderRadius: 'var(--r-xs)', padding: '1px 6px',
              maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {selectedEvent.event_id}
            </span>
          )}
        </div>
        <EventInspector event={selectedEvent} status={status}/>
      </div>
    </div>
  )
}
