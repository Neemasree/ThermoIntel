/**
 * Deterministic FIRMS-derived signal — NOT an ML risk model.
 * Used ONLY as a preliminary indicator, clearly labelled as such in the UI.
 */
import type { ApiThermalEvent } from '../types/api'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'EXTREME'

/** Parse FIRMS confidence to 0-100 */
export function parseConfidence(conf: string | null | undefined): number {
  if (!conf) return 50
  const lower = conf.toLowerCase().trim()
  if (lower === 'h') return 85
  if (lower === 'n') return 55
  if (lower === 'l') return 25
  const n = Number(conf)
  return !isNaN(n) ? n : 50
}

/**
 * Derives a 0–100 preliminary signal from real FIRMS fields.
 * This is NOT ML output — it is a deterministic threshold function.
 */
export function deriveRiskScore(event: ApiThermalEvent): number {
  const frp  = event.frp       ?? 0
  const br   = event.brightness ?? 270
  const conf = parseConfidence(event.confidence)
  const frpScore    = Math.min(50, (frp  / 3500) * 50)
  const brightScore = Math.min(30, Math.max(0, (br - 270) / 80 * 30))
  const confScore   = (conf / 100) * 20
  return Math.round(Math.min(100, frpScore + brightScore + confScore))
}

export function deriveRiskLevel(event: ApiThermalEvent): RiskLevel {
  const frp = event.frp        ?? 0
  const br  = event.brightness ?? 0
  if (frp > 2000 || br > 340) return 'EXTREME'
  if (frp > 1000 || br > 330) return 'CRITICAL'
  if (frp > 500  || br > 315) return 'HIGH'
  if (frp > 200  || br > 300) return 'MEDIUM'
  return 'LOW'
}

export function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'LOW':      return 'var(--risk-low)'
    case 'MEDIUM':   return 'var(--risk-medium)'
    case 'HIGH':     return 'var(--risk-high)'
    case 'CRITICAL': return 'var(--risk-critical)'
    case 'EXTREME':  return 'var(--risk-extreme)'
  }
}

export function getRiskBg(level: RiskLevel): string {
  switch (level) {
    case 'LOW':      return 'var(--risk-low-bg)'
    case 'MEDIUM':   return 'var(--risk-medium-bg)'
    case 'HIGH':     return 'var(--risk-high-bg)'
    case 'CRITICAL': return 'var(--risk-critical-bg)'
    case 'EXTREME':  return 'var(--risk-extreme-bg)'
  }
}

export function getRiskBorder(level: RiskLevel): string {
  switch (level) {
    case 'LOW':      return 'var(--risk-low-border)'
    case 'MEDIUM':   return 'var(--risk-medium-border)'
    case 'HIGH':     return 'var(--risk-high-border)'
    case 'CRITICAL': return 'var(--risk-critical-border)'
    case 'EXTREME':  return 'var(--risk-extreme-border)'
  }
}
