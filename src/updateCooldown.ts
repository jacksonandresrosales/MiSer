export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
export function shouldCheckUpdate(manual: boolean, lastAttempt: number | null, now: number): boolean {
  return manual || lastAttempt === null || now < lastAttempt || now - lastAttempt >= UPDATE_CHECK_INTERVAL_MS
}
