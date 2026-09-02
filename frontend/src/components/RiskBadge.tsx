import React from 'react'
import type { RiskLevel } from '../types/index'
import { getRiskColor, getRiskBg } from '../utils/risk'

interface Props {
  level: RiskLevel
  size?: 'sm' | 'md'
}

export default function RiskBadge({ level, size = 'md' }: Props) {
  const color = getRiskColor(level)
  const bg    = getRiskBg(level)
  const fs    = size === 'sm' ? 8  : 9
  const pad   = size === 'sm' ? '2px 6px' : '3px 9px'
  const dot   = size === 'sm' ? 4  : 5

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: fs, fontWeight: 700,
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.12em', textTransform: 'uppercase',
      color, background: bg,
      border: `1px solid ${color}30`,
      borderRadius: 'var(--r-xs)', padding: pad,
      whiteSpace: 'nowrap', lineHeight: 1.6,
    }}>
      <span style={{ width: dot, height: dot, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 5px ${color}` }}/>
      {level}
    </span>
  )
}
