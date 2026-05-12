import type { AppConfig } from '../types/api'

// ─── ConfigPanel Component ───────────────────────────────────────────────────

export class ConfigPanel {
  private onChange: () => void

  constructor(onChange: () => void) {
    this.onChange = onChange
  }

  render(): string {
    return `
    <section class="panel" id="section-config">
      <div class="panel-header">
        <div class="panel-title-group">
          <span class="panel-number">01</span>
          <div>
            <h2 class="panel-title">Cấu Hình Tham Số</h2>
            <p class="panel-sub">Điều chỉnh các thông số phát hiện và nguồn camera</p>
          </div>
        </div>
      </div>
      <div class="panel-body">
        <div class="config-grid">
          <div class="field-group">
            <label class="field-label"><span class="label-icon">📐</span> Chế độ kiểm tra ROI</label>
            <div class="seg-control" id="cfg-roi" data-field="roi_check_mode">
              <button class="seg-btn" data-value="center">center</button>
              <button class="seg-btn active" data-value="bottom_center">bottom_center</button>
            </div>
            <span class="field-hint">Điểm tham chiếu để kiểm tra nằm trong vùng</span>
          </div>
          <div class="field-group">
            <label class="field-label"><span class="label-icon">🚀</span> Tự động khởi động (auto_start)</label>
            <div class="seg-control" id="cfg-auto-start" data-field="auto_start">
              <button class="seg-btn" data-value="true">true</button>
              <button class="seg-btn active" data-value="false">false</button>
            </div>
            <span class="field-hint">Tự động chạy detector khi khởi động server</span>
          </div>
          <div class="field-group">
            <label class="field-label"><span class="label-icon">🎞️</span> Video Stride (vid_stride)</label>
            <input type="number" id="cfg-vid-stride" class="text-input" min="1" step="1" value="1">
            <span class="field-hint">Số frame bỏ qua (stride) khi xử lý video</span>
          </div>
          <div class="field-group">
            <label class="field-label"><span class="label-icon">📝</span> Log chi tiết (verbose)</label>
            <div class="seg-control" id="cfg-verbose" data-field="verbose">
              <button class="seg-btn active" data-value="true">true</button>
              <button class="seg-btn" data-value="false">false</button>
            </div>
            <span class="field-hint">In ra console log chi tiết quá trình AI</span>
          </div>
          <div class="field-group full-width">
            <label class="field-label">
              <span class="label-icon">📊</span> Ngưỡng tin cậy (conf)
              <span class="conf-value-badge" id="confValueBadge">0.65</span>
            </label>
            <div class="slider-wrapper">
              <span class="slider-min">0.0</span>
              <input type="range" id="cfg-conf" min="0" max="1" step="0.01" value="0.65" class="slider">
              <span class="slider-max">1.0</span>
            </div>
            <span class="field-hint">Điểm tin cậy tối thiểu để chấp nhận một phát hiện</span>
          </div>
          <div class="field-group full-width">
            <label class="field-label"><span class="label-icon">📷</span> Nguồn camera (source)</label>
            <input type="text" id="cfg-source" class="text-input" placeholder="rtsp://user:pass@ip:port/...">
            <span class="field-hint">URL RTSP hoặc đường dẫn video nguồn</span>
          </div>
          <div class="field-group">
            <label class="field-label"><span class="label-icon">🔌</span> Cổng UART (uart_port)</label>
            <input type="text" id="cfg-uart-port" class="text-input" placeholder="/dev/ttyS4">
            <span class="field-hint">Đường dẫn thiết bị UART (vd: /dev/ttyS4, /dev/ttyUSB0)</span>
          </div>
          <div class="field-group">
            <label class="field-label"><span class="label-icon">⚡</span> Tốc độ UART (uart_baudrate)</label>
            <select id="cfg-uart-baudrate" class="text-input select-input">
              ${[300,600,1200,2400,4800,9600,14400,19200,28800,38400,57600,115200,230400,460800,576000,921600,1000000,1500000,2000000]
                .map(b => `<option value="${b}"${b === 115200 ? ' selected' : ''}>${b}</option>`).join('')}
            </select>
            <span class="field-hint">Tốc độ truyền dữ liệu UART (baud/giây)</span>
          </div>
        </div>
      </div>
    </section>`
  }

  mount(): void {
    // Segmented controls
    document.querySelectorAll('.seg-control').forEach(group => {
      group.querySelectorAll('.seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'))
          btn.classList.add('active')
          this.onChange()
        })
      })
    })

    // Confidence slider
    const slider = document.getElementById('cfg-conf') as HTMLInputElement | null
    slider?.addEventListener('input', () => {
      this.updateConfBadge(slider.value)
      this.onChange()
    })

    // Text inputs
    const sourceEl = document.getElementById('cfg-source')
    sourceEl?.addEventListener('input', () => this.onChange())

    const vidStride = document.getElementById('cfg-vid-stride')
    vidStride?.addEventListener('input', () => this.onChange())

    const uartPort = document.getElementById('cfg-uart-port')
    uartPort?.addEventListener('input', () => this.onChange())

    const uartBaud = document.getElementById('cfg-uart-baudrate')
    uartBaud?.addEventListener('change', () => this.onChange())
  }

  private setSegValue(groupId: string, value: string | boolean): void {
    const g = document.getElementById(groupId)
    if (!g) return
    g.querySelectorAll('.seg-btn').forEach(b => {
      b.classList.toggle('active', (b as HTMLElement).dataset['value'] === String(value))
    })
  }

  getSegValue(groupId: string): string | null {
    const g = document.getElementById(groupId)
    if (!g) return null
    const a = g.querySelector('.seg-btn.active') as HTMLElement | null
    return a ? a.dataset['value'] ?? null : null
  }

  private updateConfBadge(v: string): void {
    const b = document.getElementById('confValueBadge')
    if (b) b.textContent = parseFloat(v).toFixed(2)
  }

  loadFromConfig(config: AppConfig): void {
    const det = config.detector
    const uart = config.uart

    this.setSegValue('cfg-roi', det.zone_check_mode ?? 'center')
    this.setSegValue('cfg-auto-start', config.auto_start ?? false)
    this.setSegValue('cfg-verbose', det.verbose ?? false)

    const vidStride = document.getElementById('cfg-vid-stride') as HTMLInputElement | null
    if (vidStride) vidStride.value = String(det.vid_stride ?? 1)

    const slider = document.getElementById('cfg-conf') as HTMLInputElement | null
    if (slider) { slider.value = String(det.conf ?? 0.65); this.updateConfBadge(slider.value) }

    const src = document.getElementById('cfg-source') as HTMLInputElement | null
    if (src) src.value = det.source ?? ''

    const uartPort = document.getElementById('cfg-uart-port') as HTMLInputElement | null
    if (uartPort) uartPort.value = uart.port ?? '/dev/ttyS4'

    const uartBaud = document.getElementById('cfg-uart-baudrate') as HTMLSelectElement | null
    if (uartBaud) uartBaud.value = String(uart.baudrate ?? 115200)
  }

  buildPartialConfig(): Pick<AppConfig, 'auto_start' | 'detector' | 'uart'> {
    const getInput = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? ''
    return {
      auto_start: this.getSegValue('cfg-auto-start') === 'true',
      detector: {
        source: getInput('cfg-source').trim(),
        conf: parseFloat(parseFloat(getInput('cfg-conf') || '0.65').toFixed(2)),
        zone_check_mode: this.getSegValue('cfg-roi') ?? 'center',
        vid_stride: parseInt(getInput('cfg-vid-stride') || '1'),
        verbose: this.getSegValue('cfg-verbose') === 'true',
        model_path: '',
      },
      uart: {
        port: getInput('cfg-uart-port').trim() || '/dev/ttyS4',
        baudrate: parseInt((document.getElementById('cfg-uart-baudrate') as HTMLSelectElement | null)?.value ?? '115200'),
      },
    }
  }
}
