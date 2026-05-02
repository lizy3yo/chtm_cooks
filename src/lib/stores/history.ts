import { writable } from 'svelte/store';
import type { InventoryHistoryEntry, DeletedItem } from '$lib/api/inventoryHistory';

/**
 * History Store - Persistent cache for inventory history data
 * Survives component unmount/remount during navigation
 */

interface HistoryCache {
	// Activity Logs
	activityLogs: InventoryHistoryEntry[];
	activityTotal: number;
	activityLogsTimestamp: number;
	
	// Request History
	requestHistory: any[];
	requestHistoryTotal: number;
	requestHistoryTimestamp: number;
	
	// Archived Items
	archivedItems: any[];
	archivedTotal: number;
	archivedTimestamp: number;
	
	// Deleted Items
	deletedItems: DeletedItem[];
	deletedTotal: number;
	deletedTimestamp: number;
	
	// Loaded flags
	activityLogsLoaded: boolean;
	requestHistoryLoaded: boolean;
	archivedLoaded: boolean;
	deletedLoaded: boolean;
}

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

const initialState: HistoryCache = {
	activityLogs: [],
	activityTotal: 0,
	activityLogsTimestamp: 0,
	
	requestHistory: [],
	requestHistoryTotal: 0,
	requestHistoryTimestamp: 0,
	
	archivedItems: [],
	archivedTotal: 0,
	archivedTimestamp: 0,
	
	deletedItems: [],
	deletedTotal: 0,
	deletedTimestamp: 0,
	
	activityLogsLoaded: false,
	requestHistoryLoaded: false,
	archivedLoaded: false,
	deletedLoaded: false
};

function createHistoryStore() {
	const { subscribe, update, set } = writable<HistoryCache>(initialState);

	return {
		subscribe,
		
		// Activity Logs
		setActivityLogs: (logs: InventoryHistoryEntry[], total: number) => {
			update(state => ({
				...state,
				activityLogs: logs,
				activityTotal: total,
				activityLogsTimestamp: Date.now(),
				activityLogsLoaded: true
			}));
		},
		
		isActivityLogsCacheValid: (): boolean => {
			let isValid = false;
			update(state => {
				isValid = state.activityLogsLoaded && 
					(Date.now() - state.activityLogsTimestamp) < CACHE_TTL_MS;
				return state;
			});
			return isValid;
		},
		
		// Request History
		setRequestHistory: (requests: any[], total: number) => {
			update(state => ({
				...state,
				requestHistory: requests,
				requestHistoryTotal: total,
				requestHistoryTimestamp: Date.now(),
				requestHistoryLoaded: true
			}));
		},
		
		isRequestHistoryCacheValid: (): boolean => {
			let isValid = false;
			update(state => {
				isValid = state.requestHistoryLoaded && 
					(Date.now() - state.requestHistoryTimestamp) < CACHE_TTL_MS;
				return state;
			});
			return isValid;
		},
		
		// Archived Items
		setArchivedItems: (items: any[], total: number) => {
			update(state => ({
				...state,
				archivedItems: items,
				archivedTotal: total,
				archivedTimestamp: Date.now(),
				archivedLoaded: true
			}));
		},
		
		isArchivedCacheValid: (): boolean => {
			let isValid = false;
			update(state => {
				isValid = state.archivedLoaded && 
					(Date.now() - state.archivedTimestamp) < CACHE_TTL_MS;
				return state;
			});
			return isValid;
		},
		
		// Deleted Items
		setDeletedItems: (items: DeletedItem[], total: number) => {
			update(state => ({
				...state,
				deletedItems: items,
				deletedTotal: total,
				deletedTimestamp: Date.now(),
				deletedLoaded: true
			}));
		},
		
		isDeletedCacheValid: (): boolean => {
			let isValid = false;
			update(state => {
				isValid = state.deletedLoaded && 
					(Date.now() - state.deletedTimestamp) < CACHE_TTL_MS;
				return state;
			});
			return isValid;
		},
		
		// Clear all cache
		clearCache: () => {
			set(initialState);
		},
		
		// Reset specific tab
		resetActivityLogs: () => {
			update(state => ({
				...state,
				activityLogs: [],
				activityTotal: 0,
				activityLogsTimestamp: 0,
				activityLogsLoaded: false
			}));
		},
		
		resetRequestHistory: () => {
			update(state => ({
				...state,
				requestHistory: [],
				requestHistoryTotal: 0,
				requestHistoryTimestamp: 0,
				requestHistoryLoaded: false
			}));
		},
		
		resetArchived: () => {
			update(state => ({
				...state,
				archivedItems: [],
				archivedTotal: 0,
				archivedTimestamp: 0,
				archivedLoaded: false
			}));
		},
		
		resetDeleted: () => {
			update(state => ({
				...state,
				deletedItems: [],
				deletedTotal: 0,
				deletedTimestamp: 0,
				deletedLoaded: false
			}));
		}
	};
}

export const historyStore = createHistoryStore();
