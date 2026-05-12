// ─── API Types — generated from OpenAPI schema ──────────────────────────────

export interface DetectorConfig {
  source: string
  model_path: string
  conf: number        // 0.0 – 1.0
  zone_check_mode: string
  vid_stride: number  // integer >= 1
  verbose: boolean
}

export interface UartConfig {
  port: string
  baudrate: number
}

export interface GoalPoseConfig {
  x: number
  y: number
  theta: number
}

export interface ZoneConfig {
  name: string
  goal_pose: GoalPoseConfig | null
  points: [number, number][]
}

export interface AppConfig {
  auto_start: boolean
  detector: DetectorConfig
  uart: UartConfig
  zones: ZoneConfig[] | null
}

export interface DetectorStatus {
  is_running: boolean
  source?: string | null
  model_path?: string | null
  conf?: number | null
  vid_stride?: number | null
  verbose?: boolean | null
}

export type AIAction = 'start' | 'stop' | 'restart'

export interface APIResponse {
  status?: string
  message?: string
  detail?: string
}
