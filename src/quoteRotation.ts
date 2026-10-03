export function nextLocalQuoteIndex(keys: readonly string[], seen: ReadonlySet<string>, current: string) {
  const unseen = keys.findIndex(key => !seen.has(key))
  if (unseen >= 0) return { index: unseen, reset: false }
  const different = keys.findIndex(key => key !== current)
  return { index: different >= 0 ? different : keys.length ? 0 : -1, reset: true }
}
