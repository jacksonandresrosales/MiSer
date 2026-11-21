export type BackDestination = 'modal' | 'previous' | 'overview' | 'exit'

/** Android back closes the open layer first, then returns to the previous tab, then to Resumen, then exits. */
export function backDestination(state: { modal: boolean; page: string; history?: readonly string[] }): BackDestination {
  if (state.modal) return 'modal'
  if (state.history?.length) return 'previous'
  return state.page === 'overview' ? 'exit' : 'overview'
}
