/**
 * Toast Notification Store
 * 
 * Global toast notification system for success, error, warning, and info messages
 * Industry-standard implementation with auto-dismiss and manual dismiss options
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

function createToastStore() {
	const { subscribe, update } = writable<ToastStore>(initialState);

	let toastCounter = 0;

	const store = {
		subscribe,

		/**
		 * Add a toast notification
		 */
		add: (toast: Omit<Toast, 'id'>) => {
			if (!browser) return;

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
