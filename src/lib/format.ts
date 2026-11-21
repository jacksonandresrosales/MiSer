const locale = 'es-EC'
const currencyFormatter = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const shortDateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
const longDateFormatter = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const todayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' })
const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'long' })
const monthYearFormatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
const dayHeadingFormatter = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' })
const stampFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' })

/** Date-only strings are read at noon so time zones never move them to another day. */
export const localDate = (value: string) => new Date(`${value}T12:00:00`)
export const currency = (value: number) => currencyFormatter.format(value)
export const shortDate = (value: string | Date) => shortDateFormatter.format(typeof value === 'string' ? localDate(value) : value)
export const longDate = (value: string | Date) => longDateFormatter.format(typeof value === 'string' ? localDate(value) : value)
export const todayLabel = (value: Date) => todayFormatter.format(value)
export const monthName = (value: Date) => monthFormatter.format(value)
export const monthYear = (value: Date) => monthYearFormatter.format(value)
export const dayHeading = (value: string) => dayHeadingFormatter.format(localDate(value))
export const stamp = (value: string | Date) => stampFormatter.format(typeof value === 'string' ? new Date(value) : value)
export const monthId = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
export const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const newId = () => crypto.randomUUID()
