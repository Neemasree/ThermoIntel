import React, { useState, useEffect } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell,
} from 'recharts'
import { useAppContext } from '../App'
import { AlertCircle, Loader } from 'lucide-react'
import { api } from '../services/api'
import type { ApiFeatureCompleteness } from '../services/api'

const CHART_COLORS = ['#1DE8E3','#F59E0B','#8B5CF6','#F87171','#38BDF8','#22D3A0','#F97316','#DC2626']

const AXIS = { fontSize: 10, fill: '#555555', fontFamily: 'var(--font-mono)' }
const TOOLTIP_STYLE = {
  background: 'rgba(10,10,10,0.97)',
  border: '1px solid #3E3E3E',
  borderRadius: 7,
  color: '#D4D4D4',
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
  boxShadow: '0 8px 40px rgba(0,0,0,0.9)',
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--d3)', border: '1px solid var(--b1)', borderRadius: 9, padding: '14px 16px', ...style }}>
      {children}
    </div>
  )
}
function PH({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t4)' }}>{title}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function KpiStrip({ stats }: { stats: NonNullable<ReturnType<typeof useAppContext>['statistics']> }) {
  const items = [
    { label: 'Total Detections', value: stats.total_detections.toLocaleString(), color: 'var(--amber)' },
    { label: 'Today', value: stats.detections_today.toLocaleString(), color: 'var(--cyan)' },
    { label: 'Last 7 Days', value: stats.detections_last_7d.toLocaleString(), color: 'var(--sky)' },
    { label: 'Avg FRP', value: stats.avg_frp != null ? `${stats.avg_frp.toFixed(0)} MW` : '—', color: 'var(--th-2)' },
    { label: 'Peak FRP', value: stats.max_frp != null ? `${stats.max_frp.toLocaleString()} MW` : '—', color: 'var(--err)' },
    { label: 'Avg Brightness', value: stats.avg_brightness != null ? `${stats.avg_brightness.toFixed(0)} K` : '—', color: 'var(--t2)' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 14 }}>
      {items.map(({ label, value, color }) => (
        <div key={label} className="kpi-module">
          <div className="kpi-label">{label}</div>
          <div className="kpi-value" style={{ color, fontSize: 22 }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const { statistics, events, status, error } = useAppContext()
  const [fc, setFc] = useState<ApiFeatureCompleteness | null>(null)

  useEffect(() => {
    api.featureCompleteness().then(setFc).catch(() => {})
  }, [])

  if (status === 'loading') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--t3)' }}>
        <Loader size={20} color="var(--cyan)" style={{ animation: 'spin 0.9s linear infinite' }}/>
        <span style={{ fontSize: 13 }}>Loading analytics…</span>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--err)' }}>
        <AlertCircle size={20}/>
        <span style={{ fontSize: 13 }}>Data source unavailable</span>
        <span style={{ fontSize: 11, color: 'var(--t4)' }}>{error}</span>
      </div>
    )
  }

  const satelliteData = statistics?.by_satellite
    ? Object.entries(statistics.by_satellite).map(([name, value]) => ({ name, value }))
    : []
  const sourceData = statistics?.by_source
    ? Object.entries(statistics.by_source).map(([name, value]) => ({ name, value }))
    : []
  const daynightData = statistics?.by_daynight
    ? Object.entries(statistics.by_daynight).map(([k, v]) => ({ name: k === 'D' ? 'Day' : k === 'N' ? 'Night' : k, value: v }))
    : []
  const landcoverData = statistics?.by_landcover
    ? Object.entries(statistics.by_landcover)
        .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }))
    : []

  // WorldCover distribution from loaded events (fallback if no stats landcover)
  const wcMap: Record<string, number> = {}
  for (const e of events) {
    const name = e.worldcover_class_name ?? 'Pending'
    wcMap[name] = (wcMap[name] ?? 0) + 1
  }
  const wcData = landcoverData.length > 0
    ? landcoverData
    : Object.entries(wcMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }))

  // Confidence distribution from loaded events
  const confMap: Record<string, number> = {}
  for (const e of events) {
    const c = e.confidence ?? 'unknown'
    confMap[c] = (confMap[c] ?? 0) + 1
  }
  const confData = Object.entries(confMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }))

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px 20px', background: 'var(--d1)' }}>

      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--violet)', marginBottom: 2 }}>Analytics</div>
        <div style={{ fontSize: 11, color: 'var(--t4)' }}>
          Aggregate thermal intelligence · {statistics?.last_sync_at ? `Last sync: ${new Date(statistics.last_sync_at).toLocaleString()}` : 'Awaiting sync'}
        </div>
      </div>

      {/* KPI strip */}
      {statistics && <KpiStrip stats={statistics}/>}

      {/* Primary charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

        <Panel>
          <PH title="Detections by Satellite" sub="Count per satellite platform"/>
          {satelliteData.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--t4)', padding: '20px 0', textAlign: 'center' }}>Awaiting data</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={satelliteData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222222" vertical={false}/>
                <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 9 }} axisLine={{ stroke: '#222222' }} tickLine={false}/>
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString()} width={52}/>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => [Number(v).toLocaleString(), 'Detections']}/>
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {satelliteData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel>
          <PH title="Detections by FIRMS Source" sub="Count per data source"/>
          {sourceData.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--t4)', padding: '20px 0', textAlign: 'center' }}>Awaiting data</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={sourceData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222222" vertical={false}/>
                <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 8 }} axisLine={{ stroke: '#222222' }} tickLine={false}/>
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString()} width={52}/>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => [Number(v).toLocaleString(), 'Detections']}/>
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {sourceData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      {/* Secondary charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>

        {/* Day / Night */}
        <Panel>
          <PH title="Day / Night Split" sub="Detection timing"/>
          {daynightData.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--t4)', padding: '20px 0', textAlign: 'center' }}>Awaiting data</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <PieChart width={100} height={100}>
                <Pie data={daynightData} cx={46} cy={46} innerRadius={28} outerRadius={44} dataKey="value" paddingAngle={3}>
                  {daynightData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="transparent"/>)}
                </Pie>
              </PieChart>
              <div style={{ flex: 1 }}>
                {daynightData.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--b0)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 7, height: 7, borderRadius: 1, background: CHART_COLORS[i % CHART_COLORS.length] }}/>
                      <span style={{ fontSize: 11, color: 'var(--t3)' }}>{d.name}</span>
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--t1)', fontWeight: 600 }}>{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* Land Cover */}
        <Panel>
          <PH title="Land Cover Distribution" sub={`${events.length.toLocaleString()} loaded events`}/>
          {wcData.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--t4)', padding: '20px 0', textAlign: 'center' }}>No enriched events loaded</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <PieChart width={100} height={100}>
                <Pie data={wcData} cx={46} cy={46} innerRadius={28} outerRadius={44} dataKey="value" paddingAngle={2}>
                  {wcData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="transparent"/>)}
                </Pie>
              </PieChart>
              <div style={{ flex: 1 }}>
                {wcData.slice(0, 5).map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--b0)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 1, background: CHART_COLORS[i % CHART_COLORS.length] }}/>
                      <span style={{ fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{d.name}</span>
                    </div>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--t1)', fontWeight: 600 }}>{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* Confidence */}
        <Panel>
          <PH title="Confidence Distribution" sub="Detection confidence values"/>
          {confData.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--t4)', padding: '20px 0', textAlign: 'center' }}>Awaiting data</div>
          ) : (
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={confData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222222" vertical={false}/>
                <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 8 }} axisLine={false} tickLine={false}/>
                <YAxis tick={AXIS} axisLine={false} tickLine={false} width={40} tickFormatter={v => v.toLocaleString()}/>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => [Number(v).toLocaleString(), 'Events']}/>
                <Bar dataKey="value" fill="#8B5CF6" radius={[2, 2, 0, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      {/* Enrichment status */}
      <Panel>
        <PH title="Enrichment Status" sub="WorldCover and OSM pipeline coverage"/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'WorldCover Enriched', value: events.filter(e => e.worldcover_version != null).length, color: 'var(--ok)' },
            { label: 'WorldCover Pending', value: events.filter(e => e.worldcover_version == null).length, color: 'var(--warn)' },
            { label: 'OSM Enriched', value: events.filter(e => e.osm_enrichment_status === 'enriched').length, color: 'var(--ok)' },
            { label: 'OSM Pending', value: events.filter(e => e.osm_enrichment_status !== 'enriched').length, color: 'var(--warn)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>{value.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
