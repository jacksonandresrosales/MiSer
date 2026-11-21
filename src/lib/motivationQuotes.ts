import { Capacitor } from '@capacitor/core'
import { philosophyQuotes } from '../quotes'
import { isoDate } from './format'

export type MotivationQuote = { text: string; author: string; work?: string; source: string; sourceLabel?: string; translation?: boolean }

export const localMotivationQuotes = philosophyQuotes as readonly MotivationQuote[]
export const seenMotivationQuotesKey = 'miser-seen-motivation-quotes'
const dailyMotivationQuoteKey = 'miser-daily-motivation-quote'

const normalizeQuotePart = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').replace(/[\p{P}\p{S}\s]+/gu, '')
export const quoteIdentity = (quote: MotivationQuote) => normalizeQuotePart(quote.text)

export const readSeenMotivationQuotes = () => {
  try {
    const value = JSON.parse(localStorage.getItem(seenMotivationQuotesKey) ?? '[]')
    return new Set<string>(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item: string) => {
      const separator = item.indexOf('|')
      return separator < 0 ? normalizeQuotePart(item) : normalizeQuotePart(item.slice(separator + 1))
    }) : [])
  }
  catch { return new Set<string>() }
}
export const saveSeenMotivationQuote = (quote: MotivationQuote) => {
  try { const seen = readSeenMotivationQuotes(); seen.add(quoteIdentity(quote)); localStorage.setItem(seenMotivationQuotesKey, JSON.stringify([...seen])) }
  catch { /* The quote remains visible if browser storage is unavailable. */ }
}
export const readDailyMotivationQuote = (): MotivationQuote | null => {
  try {
    const value = JSON.parse(localStorage.getItem(dailyMotivationQuoteKey) ?? 'null') as { date?: string; quote?: MotivationQuote } | null
    return value?.date === isoDate(new Date()) && value.quote?.text && value.quote.author ? value.quote : null
  } catch { return null }
}
export const saveDailyMotivationQuote = (quote: MotivationQuote) => {
  try { localStorage.setItem(dailyMotivationQuoteKey, JSON.stringify({ date: isoDate(new Date()), quote })) }
  catch { /* Daily display still works for this session. */ }
}
export async function requestApiQuote(): Promise<MotivationQuote | null> {
  if (Capacitor.isNativePlatform()) return null // Android uses the bundled quotes; /api is hosted only on the web.
  const response = await fetch('/api/quote?language=es', { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error('No se pudo consultar la API de frases.')
  const result: unknown = await response.json()
  if (!result || typeof result !== 'object') return null
  const entry = result as { quote?: unknown; author?: unknown }
  if (typeof entry.quote !== 'string' || !entry.quote.trim() || typeof entry.author !== 'string' || !entry.author.trim()) return null
  return { text: entry.quote.trim(), author: entry.author.trim(), source: 'https://github.com/gpalleschi/quotes_api', sourceLabel: 'Base de frases' }
}
