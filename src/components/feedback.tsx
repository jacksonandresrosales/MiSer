import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

export type ToastKind = 'success' | 'error'
export type ToastState = { id: number; message: string; kind: ToastKind; action?: { label: string; run: () => void } }
export type Notify = (message: string, kind?: ToastKind, action?: ToastState['action']) => void

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const counter = useRef(0)
  const notify = useCallback<Notify>((message, kind = 'success', action) => setToast({ id: ++counter.current, message, kind, action }), [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(current => current?.id === toast.id ? null : current), toast.action ? 5000 : 3200)
    return () => window.clearTimeout(timer)
  }, [toast])
  return { toast, notify, dismiss: useCallback(() => setToast(null), []) }
}

/** The live region is always mounted so screen readers announce every new message. */
export function ToastRegion({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  return <div className="toast-region" aria-live="polite" aria-atomic="true">
    {toast && <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : undefined}>
      {toast.kind === 'error' ? <AlertCircle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
      <span>{toast.message}</span>
      {toast.action && <button type="button" className="toast-action" onClick={() => { toast.action?.run(); onDismiss() }}>{toast.action.label}</button>}
    </div>}
  </div>
}

export type ConfirmRequest = { title: string; text: string; confirmLabel: string; danger?: boolean }

export function useConfirm() {
  const [request, setRequest] = useState<(ConfirmRequest & { resolve: (value: boolean) => void }) | null>(null)
  const ask = useCallback((next: ConfirmRequest) => new Promise<boolean>(resolve => setRequest({ ...next, resolve })), [])
  const answer = useCallback((value: boolean) => setRequest(current => { current?.resolve(value); return null }), [])
  return { request, ask, answer }
}

export function ConfirmDialog({ request, onAnswer }: { request: ConfirmRequest | null; onAnswer: (value: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!request) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    return () => opener?.focus()
  }, [request])
  if (!request) return null
  return <div className="sheet-backdrop confirm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onAnswer(false) }}>
    <section className="sheet confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onAnswer(false) } }}>
      <h2 id="confirm-title">{request.title}</h2>
      <p id="confirm-text">{request.text}</p>
      <div className="sheet-actions">
        <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={() => onAnswer(false)}>Cancelar</button>
        <button type="button" className={`btn ${request.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => onAnswer(true)}>{request.confirmLabel}</button>
      </div>
    </section>
  </div>
}
