/**
 * Confirmation Dialog Store
 * 
 * Global confirmation dialog system for user confirmations
 * Industry-standard implementation with promise-based API
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type ConfirmType = 'danger' | 'warning' | 'info' | 'default';

export interface ConfirmDialog {
	id: string;
	type: ConfirmType;
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	onConfirm: () => void;
	onCancel: () => void;
}

interface ConfirmStore {
	dialogs: ConfirmDialog[];
}

const initialState: ConfirmStore = {
	dialogs: []
};

function createConfirmStore() {
	const { subscribe, update } = writable<ConfirmStore>(initialState);

	let dialogCounter = 0;

	const store = {
		subscribe,

		/**
		 * Show a confirmation dialog
		 * Returns a promise that resolves to true if confirmed, false if cancelled
		 */
		confirm: (options: {
			title?: string;
			message: string;
			type?: ConfirmType;
			confirmText?: string;
			cancelText?: string;
		}): Promise<boolean> => {
			if (!browser) return Promise.resolve(false);

			return new Promise((resolve) => {
				const id = `confirm-${Date.now()}-${dialogCounter++}`;
				
				const newDialog: ConfirmDialog = {
					id,
					type: options.type || 'default',
					title: options.title || 'Confirm Action',
					message: options.message,
					confirmText: options.confirmText || 'Confirm',
					cancelText: options.cancelText || 'Cancel',
					onConfirm: () => {
						store.dismiss(id);
						resolve(true);
					},
					onCancel: () => {
						store.dismiss(id);
						resolve(false);
					}
				};

				update((state) => ({
					dialogs: [...state.dialogs, newDialog]
				}));
			});
		},

		/**
		 * Dismiss a specific dialog
		 */
		dismiss: (id: string) => {
			update((state) => ({
				dialogs: state.dialogs.filter((d) => d.id !== id)
			}));
		},

		/**
		 * Dismiss all dialogs
		 */
		dismissAll: () => {
			update(() => initialState);
		},

		/**
		 * Convenience methods for different dialog types
		 */
		danger: (
			message: string,
			title?: string,
			confirmText?: string,
			cancelText?: string
		): Promise<boolean> => {
			return store.confirm({
				type: 'danger',
				title: title || 'Confirm Deletion',
				message,
				confirmText: confirmText || 'Delete',
				cancelText: cancelText || 'Cancel'
			});
		},

		warning: (
			message: string,
			title?: string,
			confirmText?: string,
			cancelText?: string
		): Promise<boolean> => {
			return store.confirm({
				type: 'warning',
				title: title || 'Warning',
				message,
				confirmText,
				cancelText
			});
		},

		info: (
			message: string,
			title?: string,
			confirmText?: string,
			cancelText?: string
		): Promise<boolean> => {
			return store.confirm({
				type: 'info',
				title: title || 'Confirm',
				message,
				confirmText,
				cancelText
			});
		}
	};

	return store;
}

export const confirmStore = createConfirmStore();
