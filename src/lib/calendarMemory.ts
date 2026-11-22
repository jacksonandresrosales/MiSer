/** Calendar state kept between visits to the tab, shared with the add button so it uses the selected day. */
export const calendarMemory: { view: 'week' | 'month'; selected: string | null } = { view: 'week', selected: null }
