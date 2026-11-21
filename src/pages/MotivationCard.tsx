import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { ExternalLink, Quote, RefreshCw } from 'lucide-react'
import { philosophyQuotes } from '../quotes'
import { nextLocalQuoteIndex } from '../quoteRotation'
import { localMotivationQuotes, quoteIdentity, readDailyMotivationQuote, readSeenMotivationQuotes, requestApiQuote, saveDailyMotivationQuote, saveSeenMotivationQuote, seenMotivationQuotesKey, type MotivationQuote } from '../lib/motivationQuotes'

export function MotivationCard() {
  const [quote, setQuote] = useState<MotivationQuote>(() => {
    const cached = readDailyMotivationQuote()
    if (cached) return cached
    const today = new Date()
    return philosophyQuotes[(today.getFullYear() * 372 + today.getMonth() * 31 + today.getDate()) % philosophyQuotes.length]
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const seenQuotes = useRef(readSeenMotivationQuotes())
  const initialized = useRef(false)
  const markSeen = useCallback((item: MotivationQuote) => { const key = quoteIdentity(item); seenQuotes.current.add(key); saveSeenMotivationQuote(item) }, [])
  const inFlight = useRef(false)
  const nextQuote = useCallback(async (initial = false) => {
    if (inFlight.current) return
    inFlight.current = true
    await Promise.resolve()
    setLoading(true); setMessage('')
    try {
      if (initial) markSeen(quote)
      let apiFailed = false
      try {
        for (let attempt = 0; !Capacitor.isNativePlatform() && attempt < 3; attempt++) {
          const candidate = await requestApiQuote()
          if (!candidate) continue
          const key = quoteIdentity(candidate)
          if (seenQuotes.current.has(key)) continue
          markSeen(candidate); saveDailyMotivationQuote(candidate); setQuote(candidate); return
        }
      } catch { apiFailed = true }
      const rotation = nextLocalQuoteIndex(localMotivationQuotes.map(quoteIdentity), seenQuotes.current, quoteIdentity(quote))
      const fallback = localMotivationQuotes[rotation.index]
      if (rotation.reset) {
        seenQuotes.current = new Set([quoteIdentity(quote)])
        try { localStorage.setItem(seenMotivationQuotesKey, JSON.stringify([...seenQuotes.current])) } catch { /* Rotation still works in memory. */ }
      }
      if (fallback) {
        markSeen(fallback); saveDailyMotivationQuote(fallback); setQuote(fallback)
        setMessage(Capacitor.isNativePlatform() ? 'Frase de tu colección sin conexión.' : apiFailed ? 'Sin respuesta del servicio; mostramos una frase de tu colección.' : 'Frase de tu colección.')
      }
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [markSeen, quote])
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const cached = readDailyMotivationQuote()
    if (cached) { markSeen(cached); return }
    void nextQuote(true)
  }, [markSeen, nextQuote])
  return <aside className="motivation-card" aria-label="Frase para hoy">
    <span className="motivation-icon"><Quote size={20} /></span>
    <div className="motivation-copy"><span className="eyebrow">UNA IDEA PARA HOY</span><blockquote>“{quote.text}”</blockquote><div className="motivation-credit"><strong>{quote.author}</strong>{quote.work && <span>· {quote.work}</span>}{quote.translation && <span>· versión libre</span>}<a href={quote.source} target="_blank" rel="noopener noreferrer">{quote.sourceLabel ?? 'Fuente'} <ExternalLink size={12} /></a></div>{message && <small className="motivation-message" role="status">{message}</small>}</div>
    <button className="motivation-next" type="button" onClick={() => void nextQuote()} disabled={loading} aria-label={loading ? 'Buscando otra frase' : 'Ver otra frase'} title={loading ? 'Buscando otra frase' : 'Ver otra frase'}><RefreshCw size={16} className={loading ? 'motivation-spinning' : ''} /></button>
  </aside>
}
