export function backDestination(state: { modal: boolean; menu: boolean; page: string }): 'modal' | 'menu' | 'overview' | 'exit' {
  if (state.modal) return 'modal'
  if (state.menu) return 'menu'
  return state.page === 'overview' ? 'exit' : 'overview'
}
