import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'

type Props = { title: string; dirty: boolean; busy?: boolean; onClose: () => void; onBusyClose?: () => void; children: ReactNode }

/** Sheet on phones, dialog on larger screens. Traps focus, protects unsaved changes and answers Escape and Android back. */
export function ModalShell({ title, dirty, busy = false, onClose, onBusyClose, children }: Props) {
  const dialogRef = useRef<HTMLElement>(null)
  const [discardPrompt, setDiscardPrompt] = useState(false)

  const requestClose = useCallback(() => {
    if (busy) { onBusyClose?.(); return }
    if (discardPrompt) { setDiscardPrompt(false); return }
    if (dirty) setDiscardPrompt(true)
    else onClose()
  }, [busy, discardPrompt, dirty, onBusyClose, onClose])

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>(discardPrompt ? '[data-keep-editing]' : '[data-autofocus], form input, form textarea, form select')?.focus()
  }, [discardPrompt])

  useEffect(() => {
    const close = () => requestClose()
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener('miser-close-modal', close)
    window.addEventListener('beforeunload', warn)
    return () => { window.removeEventListener('miser-close-modal', close); window.removeEventListener('beforeunload', warn) }
  }, [dirty, requestClose])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); requestClose(); return }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]')].filter(element => element.getClientRects().length)
    if (!focusable.length) return
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus() }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus() }
  }

  return <div className="sheet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose() }}>
    <section ref={dialogRef} className="sheet" role={discardPrompt ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="sheet-title" onKeyDown={onKeyDown}>
      <span className="sheet-handle" aria-hidden="true" />
      <div className="sheet-head"><h2 id="sheet-title">{discardPrompt ? 'Cambios sin guardar' : title}</h2><button type="button" className="icon-button" onClick={requestClose} aria-label="Cerrar"><X size={20} /></button></div>
      {discardPrompt && <div className="discard-confirmation"><p>Si cierras ahora, perderás lo que escribiste.</p><div className="sheet-actions"><button type="button" className="btn btn-secondary" data-keep-editing onClick={() => setDiscardPrompt(false)}>Seguir editando</button><button type="button" className="btn btn-danger" onClick={onClose}>Descartar</button></div></div>}
      <div hidden={discardPrompt}>{children}</div>
    </section>
  </div>
}

/** Field error wiring: returns props for the input and the message element. */
export function fieldError(id: string, message: string | undefined) {
  return {
    input: message ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {},
    message: message ? <p id={`${id}-error`} className="field-error" role="alert">{message}</p> : null,
  }
}
