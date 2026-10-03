export function backDestination(state: { modal: boolean; page: string }): 'modal' | 'overview' | 'exit' {
  if (state.modal) return 'modal'
  return state.page === 'overview' ? 'exit' : 'overview'
}
