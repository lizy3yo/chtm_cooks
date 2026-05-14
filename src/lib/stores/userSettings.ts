import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface UserSettings {
	// Appearance
	darkMode: boolean;
	fontSize: 'small' | 'medium' | 'large' | 'extra-large';
	reducedMotion: boolean;
	highContrast: boolean;

	// Features
	aiChatbotEnabled: boolean;
	notificationsEnabled: boolean;
	soundEnabled: boolean;

	// Accessibility
	screenReaderOptimized: boolean;
	keyboardNavigationHints: boolean;
}

const defaultSettings: UserSettings = {
	// Appearance
	darkMode: false,
	fontSize: 'medium',
	reducedMotion: false,
	highContrast: false,

	// Features
	aiChatbotEnabled: true,
	notificationsEnabled: true,
	soundEnabled: true,

	// Accessibility
	screenReaderOptimized: false,
	keyboardNavigationHints: false
};

// Current user ID for scoping settings
let currentUserId: string | null = null;

function getStorageKey(): string {
	// Use user-specific key if logged in, otherwise use guest key
	return currentUserId ? `userSettings_${currentUserId}` : 'userSettings_guest';
}

function getInitialSettings(): UserSettings {
	if (!browser) return defaultSettings;

	try {
		const stored = localStorage.getItem(getStorageKey());
		if (stored) {
			const parsed = JSON.parse(stored);
			return { ...defaultSettings, ...parsed };
		}
	} catch (error) {
		console.error('Failed to load user settings:', error);
	}

	// Migrate legacy themeStore preference (stored as 'theme' = 'dark'|'light')
	try {
		const legacyTheme = localStorage.getItem('theme');
		if (legacyTheme === 'dark' || legacyTheme === 'light') {
			return { ...defaultSettings, darkMode: legacyTheme === 'dark' };
		}
	} catch {}

	return defaultSettings;
}

function applySettings(settings: UserSettings) {
	if (!browser) return;

	// Apply dark mode
	const html = document.documentElement;
	if (settings.darkMode) {
		html.classList.add('dark');
	} else {
		html.classList.remove('dark');
	}

	// Apply font size
	html.classList.remove('text-sm', 'text-base', 'text-lg', 'text-xl');
	switch (settings.fontSize) {
		case 'small':
			html.classList.add('text-sm');
			break;
		case 'medium':
			html.classList.add('text-base');
			break;
		case 'large':
			html.classList.add('text-lg');
			break;
		case 'extra-large':
			html.classList.add('text-xl');
			break;
	}

	// Apply reduced motion
	if (settings.reducedMotion) {
		html.classList.add('reduce-motion');
	} else {
		html.classList.remove('reduce-motion');
	}

	// Apply high contrast
	if (settings.highContrast) {
		html.classList.add('high-contrast');
	} else {
		html.classList.remove('high-contrast');
	}

	// Save to localStorage with user-specific key
	try {
		localStorage.setItem(getStorageKey(), JSON.stringify(settings));
	} catch (error) {
		console.error('Failed to save user settings:', error);
	}
}

function createUserSettingsStore() {
	const initial = getInitialSettings();
	const { subscribe, set, update } = writable<UserSettings>(initial);

	// Apply initial settings
	if (browser) {
		applySettings(initial);
	}

	return {
		subscribe,
		update: (updater: (settings: UserSettings) => UserSettings) => {
			update((current) => {
				const updated = updater(current);
				applySettings(updated);
				return updated;
			});
		},
		set: (settings: UserSettings) => {
			applySettings(settings);
			set(settings);
		},
		reset: () => {
			applySettings(defaultSettings);
			set(defaultSettings);
		},
		updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
			update((current) => {
				const updated = { ...current, [key]: value };
				applySettings(updated);
				return updated;
			});
		},
		/**
		 * Initialize settings for a specific user
		 * This should be called when user logs in to load their specific settings
		 */
		initializeForUser: (userId: string | null) => {
			currentUserId = userId;
			const userSettings = getInitialSettings();
			applySettings(userSettings);
			set(userSettings);
		}
	};
}

export const userSettingsStore = createUserSettingsStore();
