import { writable } from 'svelte/store';

export type Theme = 'light' | 'dark';

// Dark mode is removed — theme store remains but always uses 'light'.
const { subscribe, set } = writable<Theme>('light');

export const themeStore = {
	subscribe,
	// No-op toggle: keep light only
	toggle: () => set('light'),
	// Setting any theme always resolves to 'light'
	set: (_theme: Theme) => set('light'),
	// Init does nothing (no DOM or localStorage changes)
	init: () => {}
};
