/**
 * Toast Notification Store
 * 
 * Global toast notification system for success, error, warning, and info messages
 * Industry-standard implementation with auto-dismiss, manual dismiss, and deduplication
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
	id: string;
	type: ToastType;
	message: string;
	title?: string;
	duration?: number; // milliseconds, 0 = no auto-dismiss
	dismissible?: boolean;
}

interface ToastStore {
	toasts: Toast[];
}

const initialState: ToastStore = {
	toasts: []
};

// Deduplication tracking
const recentToasts = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 3000; // 3 seconds

function createToastStore() {
	const { subscribe, update } = writable<ToastStore>(initialState);

	let toastCounter = 0;

	/**
	 * Generate a unique key for toast deduplication
	 */
	function getToastKey(type: ToastType, message: string, title?: string): string {
		return `${type}:${title || ''}:${message}`;
	}

	/**
	 * Check if toast is a duplicate within the deduplication window
	 */
	function isDuplicate(type: ToastType, message: string, title?: string): boolean {
		const key = getToastKey(type, message, title);
		const lastShown = recentToasts.get(key);
		
		if (lastShown && Date.now() - lastShown < DEDUPLICATION_WINDOW_MS) {
			return true;
		}
		
		// Update last shown time
		recentToasts.set(key, Date.now());
		
		// Cleanup old entries
		for (const [k, time] of recentToasts.entries()) {
			if (Date.now() - time > DEDUPLICATION_WINDOW_MS) {
				recentToasts.delete(k);
			}
		}
		
		return false;
	}

	const store = {
		subscribe,

		/**
		 * Add a toast notification with deduplication
		 */
		add: (toast: Omit<Toast, 'id'>) => {
			if (!browser) return;

			// Check for duplicates
			if (isDuplicate(toast.type, toast.message, toast.title)) {
				return; // Skip duplicate toast
			}

			const id = `toast-${Date.now()}-${toastCounter++}`;
			const newToast: Toast = {
				id,
				dismissible: true,
				...toast,
				// Ensure duration has a default if not provided
				duration: toast.duration !== undefined ? toast.duration : 2000
			};

			update((state) => ({
				toasts: [...state.toasts, newToast]
			}));

			// Auto-dismiss if duration is set
			if (newToast.duration && newToast.duration > 0) {
				setTimeout(() => {
					store.dismiss(id);
				}, newToast.duration);
			}

			return id;
		},

		/**
		 * Dismiss a specific toast
		 */
		dismiss: (id: string) => {
			update((state) => ({
				toasts: state.toasts.filter((t) => t.id !== id)
			}));
		},

		/**
		 * Dismiss all toasts
		 */
		dismissAll: () => {
			update(() => initialState);
		},

		/**
		 * Convenience methods for different toast types
		 */
		success: (message: string, title?: string, duration?: number) => {
			return store.add({ type: 'success', message, title, duration });
		},

		error: (message: string, title?: string, duration?: number) => {
			return store.add({ type: 'error', message, title, duration });
		},

		warning: (message: string, title?: string, duration?: number) => {
			return store.add({ type: 'warning', message, title, duration });
		},

		info: (message: string, title?: string, duration?: number) => {
			return store.add({ type: 'info', message, title, duration });
		}
	};

	return store;
}

export const toastStore = createToastStore();
