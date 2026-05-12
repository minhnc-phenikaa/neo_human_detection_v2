import { fabric } from 'fabric'
import type { ZoneConfig } from '../types/api'
import { startWhepPlayback, type WhepSession } from '../lib/whepClient'
import { showToast } from '../utils/toast'

// ─── Canvas Color Palette ─────────────────────────────────────────────────────

interface AreaColor { fill: string; stroke: string }

const AREA_COLORS: AreaColor[] = [
  { fill: 'rgba(59,125,248,0.22)',  stroke: '#3b7df8' },
  { fill: 'rgba(22,163,74,0.22)',   stroke: '#16a34a' },
  { fill: 'rgba(217,119,6,0.22)',   stroke: '#d97706' },
  { fill: 'rgba(220,38,38,0.22)',   stroke: '#dc2626' },
  { fill: 'rgba(124,58,237,0.22)',  stroke: '#7c3aed' },
  { fill: 'rgba(236,72,153,0.22)',  stroke: '#ec4899' },
]

type FabricPolygon = fabric.Polygon & { areaIndex?: number; edit?: boolean }

// ─── CanvasPanel Component ────────────────────────────────────────────────────

export class CanvasPanel {
  private canvas!: fabric.Canvas
  private originalImgW = 1920
  private originalImgH = 1080
  private zones: ZoneConfig[] = []

  private videoElement: HTMLVideoElement | null = null
  private whepSession: WhepSession | null = null
  private isStreamReady = false

  // Drawing state
  private isDrawingMode = false
  private isVertexEditMode = false
  private tempPoints: { x: number; y: number }[] = []
  private tempCircles: fabric.Circle[] = []
  private previewLine: fabric.Line | null = null
  private lastClickMs = 0

  // Callbacks
  onZonesChanged: (zones: ZoneConfig[]) => void = () => {}
  onSelectionChanged: (idx: number | null) => void = () => {}

  render(): string {
    return `
    <section class="panel" id="section-snapshot">
      <div class="panel-header">
        <div class="panel-title-group">
          <span class="panel-number">02</span>
          <div>
            <h2 class="panel-title">Xem Trước Camera &amp; Vùng Theo Dõi</h2>
            <p class="panel-sub">Xem live stream, vẽ và chỉnh sửa đa giác vùng theo dõi</p>
          </div>
        </div>
        <div class="snapshot-toolbar">
          <button class="btn btn-refresh" id="btnRefreshSnapshot">
            <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Làm mới stream
          </button>
          <div class="toolbar-sep"></div>
          <button class="btn btn-add-area" id="btnAddArea">
            <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Thêm vùng
          </button>
          <button class="btn btn-vertex-edit" id="btnVertexEdit" disabled>
            <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Sửa đỉnh
          </button>
          <button class="btn btn-cancel-draw" id="btnCancelDraw" style="display:none">
            <svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Hủy vẽ
          </button>
        </div>
      </div>
      <div class="panel-body snapshot-body">
        <div class="snapshot-layout">
          <div class="canvas-col">
            <div class="canvas-wrapper" id="canvasWrapper">
              <video id="roiVideo" class="roi-video" autoplay muted playsinline></video>
              <canvas id="roiCanvas"></canvas>
              <div class="canvas-overlay" id="canvasLoading">
                <div class="spinner"></div>
                <p>Đang kết nối stream...</p>
              </div>
              <div class="canvas-overlay canvas-error" id="canvasError" style="display:none">
                <span style="font-size:28px">⚠️</span>
                <p id="canvasErrorMsg">Không thể kết nối đến camera.</p>
                <button class="btn btn-refresh small" id="btnRetrySnapshot">Thử lại</button>
              </div>
              <div class="drawing-hint" id="drawingHint" style="display:none">
                🖊 Click để thêm đỉnh &nbsp;·&nbsp; Double-click để đóng đa giác &nbsp;·&nbsp; Esc để hủy
              </div>
            </div>
            <div class="snapshot-meta" id="snapshotMeta" style="display:none">
              <span id="snapshotTime"></span>
            </div>
          </div>
          <div id="areaSidebarSlot"></div>
        </div>
      </div>
    </section>`
  }

  mount(): void {
    const wrapper = document.getElementById('canvasWrapper')!
    const W = wrapper.clientWidth || 640
    const H = 440

    this.videoElement = document.getElementById('roiVideo') as HTMLVideoElement | null

    this.canvas = new fabric.Canvas('roiCanvas', {
      width: W, height: H,
      selection: true,
      preserveObjectStacking: true,
    })

    this.canvas.on('mouse:down', (opt) => this.onMouseDown(opt))
    this.canvas.on('mouse:move', (opt) => this.onMouseMove(opt))
    this.canvas.on('object:modified', (e) => this.onPolygonModified(e))
    this.canvas.on('selection:created', (e) => this.onSelectionChangedHandler(e))
    this.canvas.on('selection:updated', (e) => this.onSelectionChangedHandler(e))
    this.canvas.on('selection:cleared', () => this.onSelectionClearedHandler())

    document.getElementById('btnRefreshSnapshot')?.addEventListener('click', () => this.loadSnapshot())
    document.getElementById('btnAddArea')?.addEventListener('click', () => this.startDrawing())
    document.getElementById('btnVertexEdit')?.addEventListener('click', () => this.toggleVertexEdit())
    document.getElementById('btnCancelDraw')?.addEventListener('click', () => this.cancelDrawing())
    document.getElementById('btnRetrySnapshot')?.addEventListener('click', () => this.loadSnapshot())

    window.addEventListener('beforeunload', () => {
      void this.closeStream()
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.isDrawingMode) this.cancelDrawing()
        else if (this.isVertexEditMode) this.disableVertexEdit()
      }
    })
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  private imgToCanvas(ix: number, iy: number) {
    return { x: ix * this.canvas.width! / this.originalImgW, y: iy * this.canvas.height! / this.originalImgH }
  }

  private canvasToImg(cx: number, cy: number): [number, number] {
    return [Math.round(cx * this.originalImgW / this.canvas.width!), Math.round(cy * this.originalImgH / this.canvas.height!)]
  }

  private getAbsolutePoints(polygon: FabricPolygon): { x: number; y: number }[] {
    const mat = polygon.calcTransformMatrix()
    return (polygon.points ?? []).map(p => fabric.util.transformPoint(
      new fabric.Point(p.x - (polygon.pathOffset?.x ?? 0), p.y - (polygon.pathOffset?.y ?? 0)), mat
    ))
  }

  // ── Stream (WHEP) ─────────────────────────────────────────────────────────

  loadSnapshot(): Promise<void> {
    return this.loadStream()
  }

  private async closeStream(): Promise<void> {
    this.isStreamReady = false

    if (!this.whepSession) {
      return
    }

    const session = this.whepSession
    this.whepSession = null

    try {
      await session.close()
    } catch {
      // Ignore cleanup failures
    }
  }

  private async waitForVideoDimensions(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup()
        reject(new Error('Timed out waiting for video metadata'))
      }, timeoutMs)

      const onReady = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          cleanup()
          resolve()
        }
      }

      const cleanup = () => {
        window.clearTimeout(timeout)
        video.removeEventListener('loadedmetadata', onReady)
        video.removeEventListener('resize', onReady)
      }

      video.addEventListener('loadedmetadata', onReady)
      video.addEventListener('resize', onReady)
    })
  }

  async loadStream(): Promise<void> {
    const loadingEl = document.getElementById('canvasLoading')!
    const errorEl = document.getElementById('canvasError')!
    const metaEl = document.getElementById('snapshotMeta')!
    const btn = document.getElementById('btnRefreshSnapshot') as HTMLButtonElement | null

    loadingEl.style.display = 'flex'
    errorEl.style.display = 'none'
    metaEl.style.display = 'none'
    if (btn) { btn.disabled = true; btn.querySelector('.btn-icon')?.classList.add('spinning') }

    try {
      const whepUrl = String(import.meta.env.VITE_WHEP_URL ?? '').trim()
      if (!whepUrl) {
        throw new Error('Missing VITE_WHEP_URL (WHEP endpoint)')
      }

      const video = this.videoElement
      if (!video) {
        throw new Error('Video element not found')
      }

      await this.closeStream()

      // Clear any legacy Fabric background image (snapshot mode)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.canvas.setBackgroundImage(null as any, this.canvas.renderAll.bind(this.canvas))

      this.whepSession = await startWhepPlayback({
        whepUrl,
        videoElement: video,
        cleanupMode: 'delete-then-peer',
      })

      await this.waitForVideoDimensions(video, 6000)
      this.originalImgW = video.videoWidth
      this.originalImgH = video.videoHeight

      const wrapper = document.getElementById('canvasWrapper')!
      const newW = wrapper.clientWidth || this.canvas.getWidth()
      const newH = Math.round(newW * this.originalImgH / this.originalImgW)
      this.canvas.setWidth(newW)
      this.canvas.setHeight(newH)
      this.canvas.calcOffset()

      loadingEl.style.display = 'none'
      metaEl.style.display = 'block'
      const now = new Date()
      document.getElementById('snapshotTime')!.textContent =
        `Live từ: ${now.toLocaleTimeString('vi-VN')} — ${now.toLocaleDateString('vi-VN')}`

      this.isStreamReady = true

      this.drawAllPolygons()
    } catch {
      loadingEl.style.display = 'none'
      errorEl.style.display = 'flex'
      document.getElementById('canvasErrorMsg')!.textContent = 'Không thể kết nối stream. Kiểm tra MediaMTX/WHEP URL.'
      await this.closeStream()
    } finally {
      if (btn) { btn.disabled = false; btn.querySelector('.btn-icon')?.classList.remove('spinning') }
    }
  }

  // ── Polygon Management ────────────────────────────────────────────────────

  setZones(zones: ZoneConfig[]): void {
    this.zones = zones
  }

  getZones(): ZoneConfig[] {
    return this.zones
  }

  drawAllPolygons(): void {
    this.canvas.getObjects('polygon').forEach(p => this.canvas.remove(p))
    this.zones.forEach((_, idx) => this.addPolygonToCanvas(idx))
    this.canvas.renderAll()
  }

  private addPolygonToCanvas(idx: number): FabricPolygon | null {
    const area = this.zones[idx]
    if (!area) return null
    const color = AREA_COLORS[idx % AREA_COLORS.length]
    const points = area.points.map(pt => this.imgToCanvas(pt[0], pt[1]))

    const poly = new fabric.Polygon(points, {
      fill: color.fill,
      stroke: color.stroke,
      strokeWidth: 2,
      selectable: true,
      objectCaching: false,
      perPixelTargetFind: false,
      cornerStyle: 'circle',
      cornerColor: color.stroke,
      cornerSize: 8,
      transparentCorners: false,
    }) as FabricPolygon

    poly.areaIndex = idx
    this.canvas.add(poly)
    return poly
  }

  private syncPolygonToConfig(polygon: FabricPolygon): void {
    const idx = polygon.areaIndex
    if (idx === undefined || !this.zones[idx]) return
    const absPoints = this.getAbsolutePoints(polygon)
    this.zones[idx].points = absPoints.map(p => this.canvasToImg(p.x, p.y))
    this.onZonesChanged(this.zones)
  }

  private onPolygonModified(e: fabric.IEvent): void {
    const obj = e.target as FabricPolygon | null
    if (obj && obj.areaIndex !== undefined) this.syncPolygonToConfig(obj)
  }

  private onSelectionChangedHandler(e: fabric.IEvent & { selected?: fabric.Object[] }): void {
    const obj = e.selected?.[0] as FabricPolygon | null
    if (obj && obj.areaIndex !== undefined) {
      const btnVertexEdit = document.getElementById('btnVertexEdit') as HTMLButtonElement | null
      if (btnVertexEdit) btnVertexEdit.disabled = false
      this.onSelectionChanged(obj.areaIndex)
    }
  }

  private onSelectionClearedHandler(): void {
    if (this.isVertexEditMode) this.disableVertexEdit()
    const btnVertexEdit = document.getElementById('btnVertexEdit') as HTMLButtonElement | null
    if (btnVertexEdit) { btnVertexEdit.disabled = true; btnVertexEdit.classList.remove('active') }
    this.onSelectionChanged(null)
  }

  // ── Vertex Editing ────────────────────────────────────────────────────────

  private getObjectSizeWithStroke(object: fabric.Polygon) {
    const stroke = new fabric.Point(
      object.strokeUniform ? 1 / object.scaleX! : 1,
      object.strokeUniform ? 1 / object.scaleY! : 1,
    ).multiply(object.strokeWidth ?? 0)
    return new fabric.Point(object.width! + stroke.x, object.height! + stroke.y)
  }

  private polygonPositionHandler(this: { pointIndex: number }, _dim: unknown, _finalMatrix: unknown, fabricObject: FabricPolygon) {
    const x = fabricObject.points![this.pointIndex].x - (fabricObject.pathOffset?.x ?? 0)
    const y = fabricObject.points![this.pointIndex].y - (fabricObject.pathOffset?.y ?? 0)
    return fabric.util.transformPoint(
      new fabric.Point(x, y),
      fabric.util.multiplyTransformMatrices(
        fabricObject.canvas!.viewportTransform!,
        fabricObject.calcTransformMatrix()
      )
    )
  }

  private actionHandler(eventData: MouseEvent, transform: fabric.Transform, x: number, y: number): boolean {
    const polygon = transform.target as FabricPolygon
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentControl = (polygon.controls as any)[(polygon as any).__corner]
    const mouseLocalPosition = polygon.toLocalPoint(new fabric.Point(x, y), 'center', 'center')
    const polygonBaseSize = this.getObjectSizeWithStroke(polygon)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const size = (polygon as any)._getTransformedDimensions(0, 0)
    polygon.points![currentControl.pointIndex] = {
      x: mouseLocalPosition.x * polygonBaseSize.x / size.x + (polygon.pathOffset?.x ?? 0),
      y: mouseLocalPosition.y * polygonBaseSize.y / size.y + (polygon.pathOffset?.y ?? 0),
    } as fabric.Point
    return true
  }

  private anchorWrapper(anchorIndex: number, fn: typeof this.actionHandler) {
    return (eventData: MouseEvent, transform: fabric.Transform, x: number, y: number): boolean => {
      const fabricObject = transform.target as FabricPolygon
      const absolutePoint = fabric.util.transformPoint(
        new fabric.Point(
          fabricObject.points![anchorIndex].x - (fabricObject.pathOffset?.x ?? 0),
          fabricObject.points![anchorIndex].y - (fabricObject.pathOffset?.y ?? 0),
        ),
        fabricObject.calcTransformMatrix()
      )
      const actionPerformed = fn.call(this, eventData, transform, x, y)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(fabricObject as any)._setPositionDimensions({})
      const polygonBaseSize = this.getObjectSizeWithStroke(fabricObject)
      const newX = (fabricObject.points![anchorIndex].x - (fabricObject.pathOffset?.x ?? 0)) / polygonBaseSize.x
      const newY = (fabricObject.points![anchorIndex].y - (fabricObject.pathOffset?.y ?? 0)) / polygonBaseSize.y
      fabricObject.setPositionByOrigin(absolutePoint, String(newX + 0.5), String(newY + 0.5))
      return actionPerformed
    }
  }

  private enableVertexEdit(polygon: FabricPolygon): void {
    this.isVertexEditMode = true
    polygon.edit = true
    polygon.objectCaching = false
    polygon.hasBorders = false
    const lastControl = polygon.points!.length - 1
    polygon.controls = polygon.points!.reduce((acc: Record<string, fabric.Control>, _point, index) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      acc['p' + index] = new fabric.Control({
        positionHandler: this.polygonPositionHandler.bind({ pointIndex: index }),
        actionHandler: this.anchorWrapper(index > 0 ? index - 1 : lastControl, this.actionHandler.bind(this)),
        actionName: 'modifyPolygon',
        cursorStyle: 'crosshair',
        pointIndex: index,
      } as unknown as fabric.Control)
      return acc
    }, {})
    this.canvas.requestRenderAll()
    const btn = document.getElementById('btnVertexEdit')
    btn?.classList.add('active')
    if (btn) btn.title = 'Thoát sửa đỉnh (Esc)'
  }

  private disableVertexEdit(): void {
    this.isVertexEditMode = false
    const poly = this.canvas.getActiveObject() as FabricPolygon | null
    if (poly && poly.areaIndex !== undefined) {
      poly.edit = false
      poly.hasBorders = true
      poly.controls = fabric.Object.prototype.controls
      this.syncPolygonToConfig(poly)
    }
    this.canvas.requestRenderAll()
    const btn = document.getElementById('btnVertexEdit')
    btn?.classList.remove('active')
    if (btn) btn.title = 'Sửa đỉnh'
  }

  toggleVertexEdit(): void {
    if (this.isVertexEditMode) { this.disableVertexEdit(); return }
    const poly = this.canvas.getActiveObject() as FabricPolygon | null
    if (poly && poly.areaIndex !== undefined) this.enableVertexEdit(poly)
  }

  // ── Drawing new polygon ───────────────────────────────────────────────────

  startDrawing(): void {
    if (!this.isStreamReady) {
      showToast('Vui lòng kết nối stream trước khi vẽ', 'error'); return
    }
    if (this.isDrawingMode) return
    this.isDrawingMode = true
    this.canvas.discardActiveObject()
    this.canvas.selection = false
    this.canvas.defaultCursor = 'crosshair'
    this.tempPoints = []; this.tempCircles = []; this.lastClickMs = 0

    document.getElementById('drawingHint')!.style.display = 'block'
    document.getElementById('btnAddArea')!.style.display = 'none'
    ;(document.getElementById('btnCancelDraw') as HTMLElement).style.display = 'inline-flex'
    ;(document.getElementById('btnVertexEdit') as HTMLButtonElement).disabled = true
  }

  cancelDrawing(): void {
    this.tempCircles.forEach(c => this.canvas.remove(c))
    if (this.previewLine) { this.canvas.remove(this.previewLine); this.previewLine = null }
    this.tempPoints = []; this.tempCircles = []
    this.exitDrawingMode()
  }

  private exitDrawingMode(): void {
    this.isDrawingMode = false
    this.canvas.selection = true
    this.canvas.defaultCursor = 'default'
    document.getElementById('drawingHint')!.style.display = 'none'
    ;(document.getElementById('btnAddArea') as HTMLElement).style.display = 'inline-flex'
    ;(document.getElementById('btnCancelDraw') as HTMLElement).style.display = 'none'
  }

  private addTempPoint(x: number, y: number): void {
    this.tempPoints.push({ x, y })
    const color = AREA_COLORS[this.zones.length % AREA_COLORS.length]
    const circle = new fabric.Circle({
      left: x - 5, top: y - 5, radius: 5,
      fill: color.stroke, stroke: '#fff', strokeWidth: 1.5,
      selectable: false, evented: false, originX: 'left', originY: 'top',
    })
    this.canvas.add(circle)
    this.tempCircles.push(circle)
    this.canvas.renderAll()
  }

  private finishDrawing(): void {
    if (this.tempPoints.length < 3) {
      showToast('Cần ít nhất 3 đỉnh để tạo đa giác', 'error'); return
    }
    this.tempCircles.forEach(c => this.canvas.remove(c))
    if (this.previewLine) { this.canvas.remove(this.previewLine); this.previewLine = null }

    const newIdx = this.zones.length
    const newZone: ZoneConfig = {
      name: 'area_' + (newIdx + 1),
      goal_pose: { x: 0, y: 0, theta: 90 },
      points: this.tempPoints.map(p => this.canvasToImg(p.x, p.y)),
    }
    this.zones.push(newZone)

    this.tempPoints = []; this.tempCircles = []
    this.exitDrawingMode()

    this.addPolygonToCanvas(newIdx)
    this.canvas.renderAll()
    this.onZonesChanged(this.zones)

    // Auto-select new polygon
    const polys = this.canvas.getObjects('polygon') as FabricPolygon[]
    const newPoly = polys.find(p => p.areaIndex === newIdx)
    if (newPoly) { this.canvas.setActiveObject(newPoly); this.canvas.renderAll() }

    showToast('Đã thêm vùng mới — nhập tên và nhấn Áp dụng', 'success')
  }

  private onMouseDown(opt: fabric.IEvent): void {
    if (!this.isDrawingMode) return
    const now = Date.now()
    const pt = this.canvas.getPointer(opt.e as MouseEvent)

    if (now - this.lastClickMs < 350) {
      if (this.tempCircles.length > 0) {
        this.canvas.remove(this.tempCircles.pop()!)
        this.tempPoints.pop()
      }
      if (this.previewLine) { this.canvas.remove(this.previewLine); this.previewLine = null }
      this.finishDrawing()
      this.lastClickMs = 0
    } else {
      this.addTempPoint(pt.x, pt.y)
      this.lastClickMs = now
    }
  }

  private onMouseMove(opt: fabric.IEvent): void {
    if (!this.isDrawingMode || this.tempPoints.length === 0) return
    const pt = this.canvas.getPointer(opt.e as MouseEvent)
    const last = this.tempPoints[this.tempPoints.length - 1]
    if (this.previewLine) this.canvas.remove(this.previewLine)
    this.previewLine = new fabric.Line([last.x, last.y, pt.x, pt.y], {
      stroke: '#3b7df8', strokeWidth: 1.5, strokeDashArray: [5, 4],
      selectable: false, evented: false,
    })
    this.canvas.add(this.previewLine)
    this.canvas.renderAll()
  }

  // ── Public methods for sidebar interaction ────────────────────────────────

  selectAreaByIdx(idx: number): void {
    const polys = this.canvas.getObjects('polygon') as FabricPolygon[]
    const poly = polys.find(p => p.areaIndex === idx)
    if (poly) { this.canvas.setActiveObject(poly); this.canvas.renderAll() }
    const btnVertexEdit = document.getElementById('btnVertexEdit') as HTMLButtonElement | null
    if (btnVertexEdit) btnVertexEdit.disabled = false
  }

  deleteArea(idx: number): void {
    this.zones.splice(idx, 1)
    this.canvas.getObjects('polygon').forEach(p => this.canvas.remove(p))
    this.zones.forEach((_, i) => this.addPolygonToCanvas(i))
    this.canvas.discardActiveObject()
    this.canvas.renderAll()
    this.onZonesChanged(this.zones)
  }
}
