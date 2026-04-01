import { writable } from 'svelte/store';

function createLoadingStore() {
	const { subscribe, set, update } = writable(false);
	
	let activeRequests = 0;
	
	return {
		subscribe,
		start: () => {
			activeRequests++;
			set(true);
		},
		stop: () => {
			activeRequests = Math.max(0, activeRequests - 1);
			if (activeRequests === 0) {
				set(false);
			}
		},
		reset: () => {
			activeRequests = 0;
			set(false);
		}
	};
}

export const loadingStore = createLoadingStore();
