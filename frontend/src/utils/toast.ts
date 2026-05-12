// ─── Toast Notification ──────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info'

export function showToast(message: string, type: ToastType = 'info'): void {
  const container = document.getElementById('toastContainer')
  if (!container) return

  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  container.appendChild(toast)

  setTimeout(() => {
    toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease'
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(8px)'
    setTimeout(() => toast.remove(), 220)
  }, 3000)
}
