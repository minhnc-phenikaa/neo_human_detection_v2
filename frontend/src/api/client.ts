import type { AppConfig, DetectorStatus, AIAction, APIResponse } from '../types/api'

const API_BASE = window.location.origin

// ─── Config ─────────────────────────────────────────────────────────────────

export async function getConfig(): Promise<AppConfig> {
  const res = await fetch(`${API_BASE}/api/config`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function updateConfig(config: AppConfig): Promise<APIResponse> {
  const res = await fetch(`${API_BASE}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  return res.json()
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

export function getSnapshotUrl(): string {
  return `${API_BASE}/api/config/get-snapshot?t=${Date.now()}`
}

// ─── Detector ────────────────────────────────────────────────────────────────

export async function getDetectorStatus(): Promise<DetectorStatus> {
  const res = await fetch(`${API_BASE}/api/detector/status`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function controlDetector(action: AIAction): Promise<{ res: Response; data: APIResponse }> {
  const res = await fetch(`${API_BASE}/api/detector/${action}`, { method: 'POST' })
  const data: APIResponse = await res.json()
  return { res, data }
}

// ─── WebSocket ───────────────────────────────────────────────────────────────

export function getUartWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/ws/uart`
}
