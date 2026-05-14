/**
 * themeStore — thin compatibility wrapper over userSettingsStore.darkMode
 *
 * Industry-standard approach: single source of truth for dark mode.
 * Both the top-nav toggle and the settings page toggle go through
 * userSettingsStore, so they are always in sync.
 */
import { derived } from 'svelte/store';
import { userSettingsStore } from '$lib/stores/userSettings';

export type Theme = 'light' | 'dark';

/** Read-only derived store: 'dark' | 'light' */
export const themeStore = {
	subscribe: derived(userSettingsStore, ($s) => ($s.darkMode ? 'dark' : 'light') as Theme).subscribe,

	toggle() {
		let current = false;
		const unsub = userSettingsStore.subscribe((s) => (current = s.darkMode));
		unsub();
		userSettingsStore.updateSetting('darkMode', !current);
	},

	set(theme: Theme) {
		userSettingsStore.updateSetting('darkMode', theme === 'dark');
	},

	/** No-op: userSettingsStore already initialises itself on import */
	init() {}
};
