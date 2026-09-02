import React from 'react'

interface Props {
  label: string
  value: string | React.ReactNode
  unit?: string
  mono?: boolean
  highlight?: boolean
  highlightColor?: string
}

export default function MetricRow({ label, value, unit, mono = false, highlight = false, highlightColor }: Props) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '4px 0', borderBottom: '1px solid var(--b0)', gap: 8,
    }}>
      <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{
        fontSize: 11,
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        fontWeight: 500,
        color: highlight ? (highlightColor ?? 'var(--t1)') : 'var(--t1)',
        display: 'flex', alignItems: 'baseline', gap: 3,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'right',
      }}>
        {value}
        {unit && <span style={{ fontSize: 9, color: 'var(--t4)', fontWeight: 400 }}>{unit}</span>}
      </span>
    </div>
  )
}
