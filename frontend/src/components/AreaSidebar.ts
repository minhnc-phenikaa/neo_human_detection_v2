import type { ZoneConfig } from '../types/api'
import { getUartWsUrl } from '../api/client'

// ─── AreaSidebar Component ────────────────────────────────────────────────────

const AREA_COLORS = [
  '#3b7df8', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#ec4899',
]

export class AreaSidebar {
  private zones: ZoneConfig[] = []
  private selectedIdx: number | null = null

  // SLAM WebSocket
  private slamWs: WebSocket | null = null
  private slamRealtimeOn = false

  // Callbacks
  onApply: (idx: number, name: string, goalPose: { x: number; y: number; theta: number }) => void = () => {}
  onDelete: (idx: number) => void = () => {}
  onSelect: (idx: number) => void = () => {}

  render(): string {
    return `
    <aside class="area-panel">
      <div class="area-panel-header">
        <span class="area-panel-title">Vùng theo dõi</span>
        <span class="area-count-badge" id="areaCountBadge">0</span>
      </div>
      <div class="area-list" id="areaList"></div>
      <div class="area-empty" id="areaEmpty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.35">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
        </svg>
        <p>Chưa có vùng nào.<br>Nhấn "+ Thêm vùng" để vẽ.</p>
      </div>
      <div class="area-form" id="areaForm" style="display:none">
        <div class="area-form-title">✏️ Chỉnh sửa vùng</div>
        <div class="form-field">
          <label for="areaName">Tên vùng</label>
          <input type="text" id="areaName" class="text-input sm" placeholder="vd: ghe_so_1">
        </div>
        <div class="realtime-switch-row">
          <div class="realtime-switch-info">
            <span class="realtime-switch-label">📡 Tọa độ Realtime</span>
            <span class="realtime-switch-hint">Lấy SLAM từ robot</span>
          </div>
          <label class="toggle-switch" title="Bật/tắt lấy tọa độ realtime">
            <input type="checkbox" id="slamRealtimeToggle">
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
        <div class="realtime-ws-status" id="realtimeWsStatus" style="display:none">
          <span class="ws-dot" id="wsStatusDot"></span>
          <span id="wsStatusText">Đang kết nối...</span>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label for="areaSlam_x">SLAM X</label>
            <input type="number" id="areaSlam_x" class="text-input sm" step="0.01" placeholder="0.00">
          </div>
          <div class="form-field">
            <label for="areaSlam_y">SLAM Y</label>
            <input type="number" id="areaSlam_y" class="text-input sm" step="0.01" placeholder="0.00">
          </div>
        </div>
        <div class="form-field">
          <label for="areaSlam_theta">Theta (độ)</label>
          <input type="number" id="areaSlam_theta" class="text-input sm" step="1" placeholder="90">
        </div>
        <div class="form-actions">
          <button class="btn btn-apply" id="btnApplyArea">Áp dụng</button>
          <button class="btn btn-delete-area" id="btnDeleteArea">Xóa vùng</button>
        </div>
      </div>
    </aside>`
  }

  mount(): void {
    document.getElementById('btnApplyArea')?.addEventListener('click', () => this.applyAreaProperties())
    document.getElementById('btnDeleteArea')?.addEventListener('click', () => {
      if (this.selectedIdx !== null) this.onDelete(this.selectedIdx)
    })
    document.getElementById('slamRealtimeToggle')?.addEventListener('change', (e) => {
      this.onSlamRealtimeToggle((e.target as HTMLInputElement).checked)
    })
  }

  updateZones(zones: ZoneConfig[], selectedIdx: number | null): void {
    this.zones = zones
    this.selectedIdx = selectedIdx
    this.renderList()

    if (selectedIdx !== null) {
      this.populateForm(selectedIdx)
    } else {
      const form = document.getElementById('areaForm')
      if (form) form.style.display = 'none'
    }
  }

  private renderList(): void {
    const list = document.getElementById('areaList')!
    const empty = document.getElementById('areaEmpty')!
    const badge = document.getElementById('areaCountBadge')!

    badge.textContent = String(this.zones.length)

    if (this.zones.length === 0) {
      list.innerHTML = ''
      empty.style.display = 'flex'
      return
    }
    empty.style.display = 'none'
    list.innerHTML = this.zones.map((area, idx) => {
      const color = AREA_COLORS[idx % AREA_COLORS.length]
      const sel = this.selectedIdx === idx ? 'selected' : ''
      return `<div class="area-list-item ${sel}" data-idx="${idx}">
        <span class="area-color-dot" style="background:${color}"></span>
        <span class="area-name">${area.name || 'Vùng ' + (idx + 1)}</span>
        <span class="area-pts-count">${area.points.length} đỉnh</span>
      </div>`
    }).join('')

    list.querySelectorAll('.area-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt((item as HTMLElement).dataset['idx'] ?? '0')
        this.onSelect(idx)
      })
    })
  }

  populateForm(idx: number): void {
    const area = this.zones[idx]
    if (!area) return
    this.selectedIdx = idx
    const form = document.getElementById('areaForm')!
    form.style.display = 'flex'
    ;(document.getElementById('areaName') as HTMLInputElement).value = area.name ?? ''
    ;(document.getElementById('areaSlam_x') as HTMLInputElement).value = String(area.goal_pose?.x ?? 0)
    ;(document.getElementById('areaSlam_y') as HTMLInputElement).value = String(area.goal_pose?.y ?? 0)
    ;(document.getElementById('areaSlam_theta') as HTMLInputElement).value = String(area.goal_pose?.theta ?? 90)

    // Reset SLAM switch
    this.disconnectSlamWs()
    const toggle = document.getElementById('slamRealtimeToggle') as HTMLInputElement | null
    if (toggle) toggle.checked = false
    this.setSlamInputsReadonly(false)
    const wsStatus = document.getElementById('realtimeWsStatus')!
    wsStatus.style.display = 'none'
  }

  private applyAreaProperties(): void {
    if (this.selectedIdx === null) return
    const area = this.zones[this.selectedIdx]
    if (!area) return

    const name = (document.getElementById('areaName') as HTMLInputElement).value.trim() || area.name
    const goalPose = {
      x: parseFloat((document.getElementById('areaSlam_x') as HTMLInputElement).value) || 0,
      y: parseFloat((document.getElementById('areaSlam_y') as HTMLInputElement).value) || 0,
      theta: parseFloat((document.getElementById('areaSlam_theta') as HTMLInputElement).value) || 90,
    }
    this.onApply(this.selectedIdx, name, goalPose)
  }

  // ── SLAM WebSocket ────────────────────────────────────────────────────────

  private onSlamRealtimeToggle(enabled: boolean): void {
    if (enabled) {
      this.slamRealtimeOn = true
      this.connectSlamWs()
      this.setSlamInputsReadonly(true)
    } else {
      this.slamRealtimeOn = false
      this.disconnectSlamWs()
      this.setSlamInputsReadonly(false)
      document.getElementById('realtimeWsStatus')!.style.display = 'none'
    }
  }

  private connectSlamWs(): void {
    if (this.slamWs) { this.slamWs.onclose = null; this.slamWs.close(); this.slamWs = null }

    const wsUrl = getUartWsUrl()
    const statusBar = document.getElementById('realtimeWsStatus')!
    const dot = document.getElementById('wsStatusDot')!
    const txt = document.getElementById('wsStatusText')!

    statusBar.style.display = 'flex'
    dot.className = 'ws-dot connecting'
    txt.textContent = 'Đang kết nối...'

    try { this.slamWs = new WebSocket(wsUrl) } catch {
      dot.className = 'ws-dot error'
      txt.textContent = 'Không thể tạo WebSocket'
      return
    }

    this.slamWs.onopen = () => {
      dot.className = 'ws-dot connected'
      txt.textContent = 'Đã kết nối — chờ dữ liệu...'
    }

    this.slamWs.onmessage = (event: MessageEvent) => {
      if (!this.slamRealtimeOn) return
      try {
        const data = JSON.parse(event.data)
        const x     = data.x     !== undefined ? data.x     : data.slam_x     ?? null
        const y     = data.y     !== undefined ? data.y     : data.slam_y     ?? null
        const theta = data.theta !== undefined ? data.theta : data.slam_theta ?? null

        if (x !== null) (document.getElementById('areaSlam_x') as HTMLInputElement).value = parseFloat(x).toFixed(4)
        if (y !== null) (document.getElementById('areaSlam_y') as HTMLInputElement).value = parseFloat(y).toFixed(4)
        if (theta !== null) (document.getElementById('areaSlam_theta') as HTMLInputElement).value = parseFloat(theta).toFixed(2)

        dot.className = 'ws-dot connected'
        txt.textContent = `x=${x !== null ? parseFloat(x).toFixed(2) : '-'}  y=${y !== null ? parseFloat(y).toFixed(2) : '-'}  th=${theta !== null ? parseFloat(theta).toFixed(1) : '-'}deg`
      } catch { /* ignore parse errors */ }
    }

    this.slamWs.onerror = () => { dot.className = 'ws-dot error'; txt.textContent = 'Lỗi kết nối WebSocket' }
    this.slamWs.onclose = () => {
      if (!this.slamRealtimeOn) return
      dot.className = 'ws-dot error'; txt.textContent = 'Mất kết nối'
    }
  }

  private disconnectSlamWs(): void {
    if (this.slamWs) { this.slamWs.onclose = null; this.slamWs.close(); this.slamWs = null }
  }

  private setSlamInputsReadonly(readonly: boolean): void {
    ;['areaSlam_x', 'areaSlam_y', 'areaSlam_theta'].forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement | null
      if (!el) return
      el.readOnly = readonly
      el.classList.toggle('slam-readonly', readonly)
    })
  }
}
