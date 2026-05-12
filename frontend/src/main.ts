import './style.css'
import { StatusBar } from './components/StatusBar'
import { ConfigPanel } from './components/ConfigPanel'
import { CanvasPanel } from './components/CanvasPanel'
import { AreaSidebar } from './components/AreaSidebar'
import { YamlPanel } from './components/YamlPanel'
import { getConfig } from './api/client'
import { showToast } from './utils/toast'
import type { AppConfig, ZoneConfig } from './types/api'

// ─── Application State ────────────────────────────────────────────────────────

let globalConfig: AppConfig = {
  auto_start: false,
  detector: { source: '', model_path: '', conf: 0.65, zone_check_mode: 'bottom_center', vid_stride: 1, verbose: true },
  uart: { port: '/dev/ttyS4', baudrate: 115200 },
  zones: [],
}
let selectedAreaIdx: number | null = null

// ─── Component Instances ──────────────────────────────────────────────────────

const statusBar  = new StatusBar()
const configPanel = new ConfigPanel(() => yamlPanel.updatePreview())
const canvasPanel = new CanvasPanel()
const areaSidebar = new AreaSidebar()
const yamlPanel   = new YamlPanel(
  () => buildFullConfig(),
  () => statusBar.updateAIStatus(),
)

// ─── Build Full Config ────────────────────────────────────────────────────────

function buildFullConfig(): AppConfig {
  const partial = configPanel.buildPartialConfig()
  const zones = canvasPanel.getZones()

  // Preserve model_path from globalConfig
  partial.detector.model_path = globalConfig.detector?.model_path ?? ''

  return {
    ...partial,
    zones: zones.length > 0 ? zones : globalConfig.zones ?? [],
  }
}

// ─── Sync zones between CanvasPanel ↔ AreaSidebar ↔ YamlPanel ────────────────

function syncZones(zones: ZoneConfig[]): void {
  globalConfig.zones = zones
  areaSidebar.updateZones(zones, selectedAreaIdx)
  yamlPanel.updatePreview()
}

// ─── Wire up component events ─────────────────────────────────────────────────

canvasPanel.onZonesChanged = (zones) => syncZones(zones)

canvasPanel.onSelectionChanged = (idx) => {
  selectedAreaIdx = idx
  areaSidebar.updateZones(canvasPanel.getZones(), idx)
  if (idx !== null) areaSidebar.populateForm(idx)
}

areaSidebar.onSelect = (idx) => {
  selectedAreaIdx = idx
  canvasPanel.selectAreaByIdx(idx)
  areaSidebar.updateZones(canvasPanel.getZones(), idx)
  areaSidebar.populateForm(idx)
}

areaSidebar.onApply = (idx, name, goalPose) => {
  const zones = canvasPanel.getZones()
  if (zones[idx]) {
    zones[idx].name = name
    zones[idx].goal_pose = goalPose
    syncZones(zones)
    showToast('Đã cập nhật thông tin vùng', 'success')
  }
}

areaSidebar.onDelete = (idx) => {
  selectedAreaIdx = null
  canvasPanel.deleteArea(idx)
  const zones = canvasPanel.getZones()
  areaSidebar.updateZones(zones, null)
  yamlPanel.updatePreview()
  showToast('Đã xóa vùng', 'info')
}

// ─── Render HTML structure ────────────────────────────────────────────────────

function renderApp(): void {
  const app = document.getElementById('app')!
  app.innerHTML = `
    ${statusBar.render()}
    <main class="main-layout">
      ${configPanel.render()}
      ${canvasPanel.render()}
      ${yamlPanel.render()}
    </main>
    <div class="toast-container" id="toastContainer"></div>
  `

  // Inject sidebar into canvas panel's slot
  const slot = document.getElementById('areaSidebarSlot')!
  slot.outerHTML = areaSidebar.render()
}

// ─── Mount components (attach event listeners) ────────────────────────────────

function mountComponents(): void {
  statusBar.mount()
  configPanel.mount()
  canvasPanel.mount()
  areaSidebar.mount()
  yamlPanel.mount()
}

// ─── Load initial data ────────────────────────────────────────────────────────

async function initApp(): Promise<void> {
  renderApp()
  mountComponents()

  try {
    const config = await getConfig()
    globalConfig = config
    configPanel.loadFromConfig(config)
    canvasPanel.setZones(config.zones ?? [])
    areaSidebar.updateZones(config.zones ?? [], null)
    yamlPanel.updatePreview()
    statusBar.setServerStatus(true)
  } catch {
    statusBar.setServerStatus(false)
    showToast('Không thể kết nối server API', 'error')
    yamlPanel.updatePreview()
  }

  // Load live stream after config (non-blocking)
  void canvasPanel.loadStream()
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => initApp())
