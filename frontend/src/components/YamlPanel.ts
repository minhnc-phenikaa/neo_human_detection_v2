import type { AppConfig, AIAction } from '../types/api'
import { controlDetector, updateConfig } from '../api/client'
import { showToast } from '../utils/toast'
import { jsonToYaml, syntaxHighlightYAML } from '../utils/yaml'

// ─── YamlPanel Component ─────────────────────────────────────────────────────

export class YamlPanel {
  private getConfig: () => AppConfig
  private onAIAction: () => void

  constructor(getConfig: () => AppConfig, onAIAction: () => void) {
    this.getConfig = getConfig
    this.onAIAction = onAIAction
  }

  render(): string {
    return `
    <section class="panel" id="section-yaml">
      <div class="panel-header">
        <div class="panel-title-group">
          <span class="panel-number">03</span>
          <div>
            <h2 class="panel-title">Xem Trước Cấu Hình YAML</h2>
            <p class="panel-sub">Dữ liệu sẽ được ghi vào file <code>default.yaml</code></p>
          </div>
        </div>
        <div class="panel-header-actions">
          <div class="ai-control-group">
            <button class="btn btn-ai-start" id="btnStartAI">
              <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Start
            </button>
            <button class="btn btn-ai-stop" id="btnStopAI">
              <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Stop
            </button>
            <button class="btn btn-ai-restart" id="btnRestartAI">
              <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Restart
            </button>
          </div>
          <div class="toolbar-sep"></div>
          <button class="btn btn-save" id="btnSave">
            <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Lưu cấu hình
          </button>
        </div>
      </div>
      <div class="panel-body">
        <div class="json-viewer-wrapper">
          <pre class="json-viewer" id="yamlPreview"></pre>
        </div>
      </div>
    </section>`
  }

  mount(): void {
    document.getElementById('btnStartAI')?.addEventListener('click', () => this.handleAI('start'))
    document.getElementById('btnStopAI')?.addEventListener('click', () => this.handleAI('stop'))
    document.getElementById('btnRestartAI')?.addEventListener('click', () => this.handleAI('restart'))
    document.getElementById('btnSave')?.addEventListener('click', () => this.saveConfig())
  }

  updatePreview(): void {
    const preview = document.getElementById('yamlPreview')
    if (!preview) return
    const config = this.getConfig()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const yamlStr = jsonToYaml(config as any)
    preview.innerHTML = syntaxHighlightYAML(yamlStr)
  }

  private async handleAI(action: AIAction): Promise<void> {
    const btnStart = document.getElementById('btnStartAI') as HTMLButtonElement | null
    const btnStop  = document.getElementById('btnStopAI')  as HTMLButtonElement | null
    const btnRestart = document.getElementById('btnRestartAI') as HTMLButtonElement | null
    const allBtns = [btnStart, btnStop, btnRestart]

    allBtns.forEach(b => { if (b) b.disabled = true })
    const activeBtn = action === 'start' ? btnStart : action === 'stop' ? btnStop : btnRestart
    const originalHTML = activeBtn?.innerHTML ?? ''
    const labels = { start: 'Đang khởi động...', stop: 'Đang dừng...', restart: 'Đang khởi động lại...' }
    if (activeBtn) activeBtn.textContent = labels[action]

    try {
      const { res, data } = await controlDetector(action)
      if (res.status === 409) {
        showToast('⏳ ' + (data.detail ?? 'Đang xử lý lệnh khác'), 'info')
      } else if (data.status === 'success') {
        showToast('✅ ' + data.message, 'success')
      } else if (data.status === 'info') {
        showToast('ℹ️ ' + data.message, 'info')
      } else {
        showToast('⚠️ ' + data.message, 'error')
      }
    } catch {
      showToast('❌ Không thể kết nối server', 'error')
    } finally {
      if (activeBtn) activeBtn.innerHTML = originalHTML
      allBtns.forEach(b => { if (b) b.disabled = false })
      this.onAIAction()
    }
  }

  private async saveConfig(): Promise<void> {
    const btn = document.getElementById('btnSave') as HTMLButtonElement | null
    const originalHTML = btn?.innerHTML ?? ''
    if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu...' }

    try {
      const config = this.getConfig()
      const data = await updateConfig(config)
      if (data.status === 'success') {
        showToast('✅ Đã lưu cấu hình thành công!', 'success')
      } else {
        showToast('❌ Lỗi: ' + (data.detail ?? 'Không rõ'), 'error')
      }
    } catch {
      showToast('❌ Không thể kết nối server', 'error')
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = originalHTML }
    }
  }
}
