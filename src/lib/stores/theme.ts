import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
	if (!browser) return 'light';
	const stored = localStorage.getItem('theme') as Theme | null;
	if (stored) return stored;
	return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
	if (!browser) return;
	const html = document.documentElement;
	if (theme === 'dark') html.classList.add('dark');
	else html.classList.remove('dark');
	try {
		localStorage.setItem('theme', theme);
	} catch {}
}

function createThemeStore() {
	const initial = getInitialTheme();
	const { subscribe, set } = writable<Theme>(initial);

	return {
		subscribe,
		toggle: () => {
			let current: Theme = 'light';
			const unsub = subscribe(v => (current = v));
			unsub();
			const next = current === 'light' ? 'dark' : 'light';
			applyTheme(next);
			set(next);
		},
		set: (theme: Theme) => {
			applyTheme(theme);
			set(theme);
		},
		init: () => {
			applyTheme(getInitialTheme());
		}
	};
}

export const themeStore = createThemeStore();
