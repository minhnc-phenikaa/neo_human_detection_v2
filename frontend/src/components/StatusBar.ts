import { getDetectorStatus } from '../api/client'

// ─── StatusBar Component ─────────────────────────────────────────────────────

export class StatusBar {
  private dotEl!: HTMLElement
  private labelEl!: HTMLElement
  private aiDotEl!: HTMLElement
  private aiLabelEl!: HTMLElement
  private pollInterval: ReturnType<typeof setInterval> | null = null

  render(): string {
    return `
    <header class="site-header">
      <div class="header-inner">
        <div class="header-brand">
          <div class="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M20 21a8 8 0 1 0-16 0" />
            </svg>
          </div>
          <div>
            <span class="brand-title">Neo Human Detector</span>
            <span class="brand-sub">Configuration Panel</span>
          </div>
        </div>
        <div class="header-status">
          <span class="status-dot" id="statusDot"></span>
          <span class="status-label" id="statusLabel">Đang kết nối...</span>
          <span class="status-sep">|</span>
          <span class="status-dot" id="aiStatusDot"></span>
          <span class="status-label" id="aiStatusLabel">AI: --</span>
        </div>
      </div>
    </header>`
  }

  mount(): void {
    this.dotEl = document.getElementById('statusDot')!
    this.labelEl = document.getElementById('statusLabel')!
    this.aiDotEl = document.getElementById('aiStatusDot')!
    this.aiLabelEl = document.getElementById('aiStatusLabel')!

    this.updateAIStatus()
    this.pollInterval = setInterval(() => this.updateAIStatus(), 5000)
  }

  setServerStatus(online: boolean): void {
    this.dotEl.className = 'status-dot ' + (online ? 'online' : 'error')
    this.labelEl.textContent = online ? 'Đã kết nối' : 'Mất kết nối'
  }

  async updateAIStatus(): Promise<void> {
    try {
      const data = await getDetectorStatus()
      const running = data.is_running === true
      this.aiDotEl.className = 'status-dot ' + (running ? 'online' : 'idle')
      this.aiLabelEl.textContent = 'AI: ' + (running ? 'Đang chạy' : 'Đã dừng')
    } catch {
      this.aiDotEl.className = 'status-dot error'
      this.aiLabelEl.textContent = 'AI: Lỗi'
    }
  }

  destroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval)
  }
}
