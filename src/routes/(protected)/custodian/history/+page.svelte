<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import { historyStore } from '$lib/stores/history';
	import { inventoryHistoryAPI, archivedItemsAPI, deletedItemsAPI } from '$lib/api/inventoryHistory';
	import type { InventoryHistoryEntry, DeletedItem } from '$lib/api/inventoryHistory';
	import { borrowRequestsAPI } from '$lib/api/borrowRequests';
	import { catalogAPI } from '$lib/api/catalog';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	import HistorySkeletonLoader from '$lib/components/ui/HistorySkeletonLoader.svelte';

	type Tab = 'activity-logs' | 'request-history' | 'archived' | 'deleted';
	
	let activeTab = $state<Tab>('activity-logs');
	
	// Get cached data from store
	const cachedStore = browser ? get(historyStore) : null;
	const hasCachedData = cachedStore && 
		cachedStore.activityLogsLoaded && 
		historyStore.isActivityLogsCacheValid();
	
	let initialLoadComplete = $state(hasCachedData);
	
	// Activity Logs state - from store
	let activityLogs = $state<InventoryHistoryEntry[]>(hasCachedData ? cachedStore!.activityLogs : []);
	let activityTotal = $state(hasCachedData ? cachedStore!.activityTotal : 0);
	let activityPage = $state(1);
	let activityLimit = $state(50);
	let activityLogsLoaded = $state(hasCachedData); // Track if activity logs have been loaded
	
	// Archived Items state
	let archivedItems = $state<any[]>([]);
	let archivedTotal = $state(0);
	let archivedPage = $state(1);
	let archivedLimit = $state(50);
	let archivedSearch = $state('');
	let archivedLoaded = $state(false); // Track if archived items have been loaded
	
	// Recently Deleted state
	let deletedItems = $state<DeletedItem[]>([]);
	let deletedTotal = $state(0);
	let deletedPage = $state(1);
	let deletedLimit = $state(50);
	let deletedSearch = $state('');
	let deletedLoaded = $state(false); // Track if deleted items have been loaded

	// Filters for activity logs
	let filterAction = $state('');
	let filterEntityType = $state('');
	let filterStartDate = $state('');
	let filterEndDate = $state('');
	let activitySearchQuery = $state('');

	// Request History state
	let requestHistory = $state<any[]>([]);
	let requestHistoryTotal = $state(0);
	let requestHistoryPage = $state(1);
	let requestHistoryLimit = $state(50);
	let requestHistorySearch = $state('');
	let requestHistoryLoaded = $state(false); // Track if request history has been loaded
	let showRequestDetailModal = $state(false);
	let selectedHistoryRequest = $state<any>(null);
	let itemPictureCache = $state<Map<string, string>>(new Map());

	// Real-time sync state
	let liveSyncActive = $state(false);
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let refreshInFlight = false;
	let pendingRefresh = false;

	// Load data on mount
	onMount(() => {
		console.log('[HISTORY] Component mounted');
		console.log('[HISTORY] Has cached data:', hasCachedData);
		console.log('[HISTORY] Cache valid:', historyStore.isActivityLogsCacheValid());

		// Only load if we don't have valid cached data
		if (!hasCachedData) {
			console.log('[HISTORY] No valid cache, loading from API...');
			Promise.all([
				loadActivityLogs(true) // Force refresh since no cache
			])
				.then(() => {
					console.log('[HISTORY] Data loaded successfully');
					setTimeout(() => {
						initialLoadComplete = true;
					}, 150);
				})
				.catch((err) => {
					console.error('[HISTORY] Failed to load data:', err);
					initialLoadComplete = true;
				});
		} else {
			console.log('[HISTORY] Using cached data from store');
		}

		// Subscribe to real-time inventory changes via SSE
		const unsubscribeSSE = inventoryHistoryAPI.subscribeToChanges(() => {
			console.log('[HISTORY] SSE event received, scheduling refresh');
			scheduleRefresh();
		});
		liveSyncActive = true;

		// Periodic refresh every 30 seconds
		const pollInterval = setInterval(() => {
			void refreshData();
		}, 30_000);

		// Refresh on window focus
		const onFocus = () => {
			void refreshData();
		};
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				void refreshData();
			}
		};

		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		// Cleanup function
		return () => {
			console.log('[HISTORY] Component unmounting');
			unsubscribeSSE();
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			clearInterval(pollInterval);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	// Switch tabs
	function switchTab(tab: Tab) {
		activeTab = tab;
		// Only load data if it hasn't been loaded yet
		if (tab === 'activity-logs' && !activityLogsLoaded) {
			loadActivityLogs();
		} else if (tab === 'request-history' && !requestHistoryLoaded) {
			loadRequestHistory();
		} else if (tab === 'archived' && !archivedLoaded) {
			loadArchivedItems();
		} else if (tab === 'deleted' && !deletedLoaded) {
			loadDeletedItems();
		}
	}

	// Load Activity Logs
	async function loadActivityLogs(forceRefresh = false) {
		try {
			const response = await inventoryHistoryAPI.getHistory({
				action: filterAction || undefined,
				entityType: filterEntityType as any || undefined,
				startDate: filterStartDate || undefined,
				endDate: filterEndDate || undefined,
				page: activityPage,
				limit: activityLimit,
				forceRefresh
			});
			activityLogs = response.history;
			activityTotal = response.total;
			activityLogsLoaded = true;
			
			// Save to store for persistence across navigation
			historyStore.setActivityLogs(response.history, response.total);
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to load activity logs');
		}
	}

	// Schedule a refresh with debouncing
	function scheduleRefresh(): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			refreshData();
		}, 250);
	}

	// Refresh all data
	async function refreshData(): Promise<void> {
		if (refreshInFlight) {
			pendingRefresh = true;
			return;
		}

		refreshInFlight = true;
		try {
			inventoryHistoryAPI.invalidateCache();
			
			// Refresh the current tab's data without showing loading spinner
			if (activeTab === 'activity-logs') {
				await loadActivityLogs(true);
			} else if (activeTab === 'request-history') {
				borrowRequestsAPI.invalidateCache();
				await loadRequestHistory();
			} else if (activeTab === 'archived') {
				await loadArchivedItems();
			} else if (activeTab === 'deleted') {
				await loadDeletedItems();
			}
		} finally {
			refreshInFlight = false;
			if (pendingRefresh) {
				pendingRefresh = false;
				await refreshData();
			}
		}
	}

	// Load Request History
	async function loadRequestHistory() {
		try {
			const response = await borrowRequestsAPI.list({
				statuses: ['returned', 'resolved', 'cancelled', 'rejected'],
				page: requestHistoryPage,
				limit: requestHistoryLimit
			});
			requestHistory = response.requests;
			requestHistoryTotal = response.total;
			requestHistoryLoaded = true;
			await backfillItemPictures();
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to load request history');
		}
	}

	// Backfill item pictures from catalog
	async function backfillItemPictures(): Promise<void> {
		const missingIds = new Set<string>();
		for (const req of requestHistory) {
			for (const item of req.items) {
				if (item.itemId && !item.picture && !itemPictureCache.has(item.itemId)) {
					missingIds.add(item.itemId);
				}
			}
		}

		if (missingIds.size === 0) return;

		try {
			const response = await catalogAPI.getCatalog({ availability: 'all', limit: 300 });
			const next = new Map(itemPictureCache);
			for (const catalogItem of response.items) {
				if (missingIds.has(catalogItem.id) && catalogItem.picture) {
					next.set(catalogItem.id, catalogItem.picture);
				}
			}
			itemPictureCache = next;
		} catch {
			// Keep graceful fallback when catalog pictures are unavailable.
		}
	}

	// Load Archived Items
	async function loadArchivedItems() {
		try {
			const response = await archivedItemsAPI.getArchived({
				search: archivedSearch || undefined,
				page: archivedPage,
				limit: archivedLimit
			});
			archivedItems = response.items;
			archivedTotal = response.total;
			archivedLoaded = true;
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to load archived items');
		}
	}

	// Load Recently Deleted Items
	async function loadDeletedItems() {
		try {
			const response = await deletedItemsAPI.getDeleted({
				search: deletedSearch || undefined,
				page: deletedPage,
				limit: deletedLimit
			});
			deletedItems = response.items;
			deletedTotal = response.total;
			deletedLoaded = true;
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to load deleted items');
		}
	}

	// Restore archived item
	async function restoreArchivedItem(item: any) {
		const confirmed = await confirmStore.info(
			`Restore "${item.name}" to active inventory?`,
			'Restore Item',
			'Restore',
			'Cancel'
		);

		if (!confirmed) return;

		try {
			await archivedItemsAPI.restore(item.id);
			toastStore.success(`"${item.name}" has been restored to active inventory`);
			await loadArchivedItems();
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to restore item');
		}
	}

	// Restore deleted item
	async function restoreDeletedItem(item: DeletedItem) {
		const itemName = item.type === 'category' ? item.categoryData.name : item.itemData.name;
		const confirmed = await confirmStore.info(
			`Restore "${itemName}" from deleted items?`,
			'Restore Item',
			'Restore',
			'Cancel'
		);

		if (!confirmed) return;

		try {
			await deletedItemsAPI.restore(item.id, item.type);
			toastStore.success(`"${itemName}" has been restored successfully`);
			await loadDeletedItems();
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to restore item');
		}
	}

	// Permanently delete item
	async function permanentlyDelete(item: DeletedItem) {
		const itemName = item.type === 'category' ? item.categoryData.name : item.itemData.name;
		const confirmed = await confirmStore.danger(
			`Permanently delete "${itemName}"? This action CANNOT be undone.`,
			'Permanent Deletion',
			'Delete Forever',
			'Cancel'
		);

		if (!confirmed) return;

		try {
			await deletedItemsAPI.permanentlyDelete(item.id, item.type);
			toastStore.success(`"${itemName}" has been permanently deleted`);
			await loadDeletedItems();
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to permanently delete item');
		}
	}

	// Format timestamp
	function formatTimestamp(date: Date | string): string {
		const d = new Date(date);
		return new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(d);
	}

	// Format request ID
	function formatRequestId(id: string): string {
		return `REQ-${id.slice(-6).toUpperCase()}`;
	}

	// Get status badge color for requests
	function getRequestStatusColor(status: string): string {
		const colors: Record<string, string> = {
			returned: 'bg-green-100 text-green-800',
			resolved: 'bg-emerald-100 text-emerald-800',
			cancelled: 'bg-gray-100 text-gray-800',
			rejected: 'bg-red-100 text-red-800'
		};
		return colors[status] || 'bg-gray-100 text-gray-800';
	}

	// Open request detail modal
	function openRequestDetailModal(request: any) {
		selectedHistoryRequest = request;
		showRequestDetailModal = true;
	}

	// Close request detail modal
	function closeRequestDetailModal() {
		showRequestDetailModal = false;
		selectedHistoryRequest = null;
	}

	// Get action badge color
	function getActionColor(action: string): string {
		const colors: Record<string, string> = {
			created: 'bg-green-100 text-green-800',
			updated: 'bg-blue-100 text-blue-800',
			deleted: 'bg-red-100 text-red-800',
			archived: 'bg-gray-100 text-gray-800',
			restored: 'bg-emerald-100 text-emerald-800',
			quantity_changed: 'bg-purple-100 text-purple-800'
		};
		return colors[action] || 'bg-gray-100 text-gray-800';
	}

	// Get role badge
	function getRoleBadge(role: string): string {
		const badges: Record<string, string> = {
			superadmin: 'bg-purple-100 text-purple-800',
			custodian: 'bg-blue-100 text-blue-800',
			instructor: 'bg-green-100 text-green-800'
		};
		return badges[role] || 'bg-gray-100 text-gray-800';
	}
</script>

<svelte:head>
	<title>History - CHTM Cooks</title>
</svelte:head>

{#if !initialLoadComplete}
	<HistorySkeletonLoader {activeTab} />
{:else}
<div class="space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Inventory History</h1>
		<p class="mt-1 text-sm text-gray-500">View activity logs, archived items, and recently deleted records</p>
	</div>

	<!-- Tabs Navigation -->
	<div class="rounded-t-lg border-b border-gray-200 bg-white shadow-sm">
		<nav class="-mb-px flex" aria-label="Tabs">
			<button
				onclick={() => switchTab('activity-logs')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'activity-logs'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
					</svg>
					Activity Logs
					{#if activityTotal > 0}
						<span class="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{activityTotal}</span>
					{/if}
				</div>
			</button>

			<button
				onclick={() => switchTab('request-history')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'request-history'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
					</svg>
					Request History
					{#if requestHistoryTotal > 0}
						<span class="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{requestHistoryTotal}</span>
					{/if}
				</div>
			</button>
			
			<button
				onclick={() => switchTab('archived')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'archived'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
					</svg>
					Archived
					{#if archivedTotal > 0}
						<span class="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{archivedTotal}</span>
					{/if}
				</div>
			</button>
			
			<button
				onclick={() => switchTab('deleted')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'deleted'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
					</svg>
					Recently Deleted
					{#if deletedTotal > 0}
						<span class="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">{deletedTotal}</span>
					{/if}
				</div>
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	<div class="rounded-b-lg bg-white shadow-sm">{#if activeTab === 'activity-logs'}
			<!-- Activity Logs Tab -->
			<div class="p-6">
				<div class="mb-6">
					<h3 class="text-lg font-semibold text-gray-900">Activity Logs & Audit Trail</h3>
					<p class="mt-1 text-sm text-gray-500">Complete audit trail of all inventory operations</p>
				</div>

				<!-- Search Bar -->
				<div class="mb-6">
					<div class="relative">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
							<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
						</div>
						<input
							type="text"
							placeholder="Search by entity name, user, or IP address..."
							bind:value={activitySearchQuery}
							class="block w-full rounded-lg border border-gray-300 bg-white py-3 pl-11 pr-4 text-sm text-gray-900 placeholder-gray-500 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0"
						/>
					</div>
				</div>

				<!-- Filters -->
				<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
					<div>
						<label for="action-filter" class="block text-sm font-medium text-gray-700 mb-1">Action</label>
						<select
							id="action-filter"
							bind:value={filterAction}
							onchange={() => loadActivityLogs()}
							class="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0"
						>
							<option value="">All Actions</option>
							<option value="created">Created</option>
							<option value="updated">Updated</option>
							<option value="deleted">Deleted</option>
							<option value="archived">Archived</option>
							<option value="restored">Restored</option>
							<option value="quantity_changed">Quantity Changed</option>
						</select>
					</div>

					<div>
						<label for="entity-filter" class="block text-sm font-medium text-gray-700 mb-1">Type</label>
						<select
							id="entity-filter"
							bind:value={filterEntityType}
							onchange={() => loadActivityLogs()}
							class="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0"
						>
							<option value="">All Types</option>
							<option value="item">Items</option>
							<option value="category">Categories</option>
						</select>
					</div>

					<div>
						<label for="start-date" class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
						<input
							type="date"
							id="start-date"
							bind:value={filterStartDate}
							onchange={() => loadActivityLogs()}
							class="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0"
						/>
					</div>

					<div>
						<label for="end-date" class="block text-sm font-medium text-gray-700 mb-1">End Date</label>
						<input
							type="date"
							id="end-date"
							bind:value={filterEndDate}
							onchange={() => loadActivityLogs()}
							class="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0"
						/>
					</div>
				</div>

				<!-- Activity Logs Table -->
				{#if activityLogs.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No activity logs found</h3>
						<p class="mt-2 text-sm text-gray-500">Activity logs will appear here as operations are performed.</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead>
								<tr class="border-b border-gray-200 bg-gray-50">
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Timestamp</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Action</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Type</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Entity</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">User</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Role</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">IP Address</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each activityLogs as log}
									<tr class="hover:bg-gray-50 transition-colors">
										<td class="px-6 py-4 text-sm text-gray-600">{formatTimestamp(log.timestamp)}</td>
										<td class="px-6 py-4">
											<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getActionColor(log.action)}">
												{log.action.replace('_', ' ').toUpperCase()}
											</span>
										</td>
										<td class="px-6 py-4 text-sm text-gray-600 capitalize">{log.entityType}</td>
										<td class="px-6 py-4 text-sm font-medium text-gray-900">{log.entityName}</td>
										<td class="px-6 py-4 text-sm text-gray-600">{log.userName}</td>
										<td class="px-6 py-4">
											<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getRoleBadge(log.userRole)}">
												{log.userRole}
											</span>
										</td>
										<td class="px-6 py-4 text-sm text-gray-500">{log.ipAddress || 'N/A'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Pagination -->
					{#if activityTotal > activityLimit}
						<div class="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
							<div class="text-sm text-gray-700">
								Showing {(activityPage - 1) * activityLimit + 1} to {Math.min(activityPage * activityLimit, activityTotal)} of {activityTotal} entries
							</div>
							<div class="flex gap-2">
								<button
									onclick={() => { activityPage--; loadActivityLogs(); }}
									disabled={activityPage === 1}
									class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									Previous
								</button>
								<button
									onclick={() => { activityPage++; loadActivityLogs(); }}
									disabled={activityPage >= Math.ceil(activityTotal / activityLimit)}
									class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									Next
								</button>
							</div>
						</div>
					{/if}
				{/if}
			</div>

		{:else if activeTab === 'request-history'}
			<!-- Request History Tab -->
			<div class="p-6">
				<div class="mb-6">
					<h3 class="text-lg font-semibold text-gray-900">Borrow Request History</h3>
					<p class="mt-1 text-sm text-gray-500">Complete history of all student borrow requests processed by custodians</p>
				</div>

				<!-- Search Bar -->
				<div class="mb-6">
					<div class="relative">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
							<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
						</div>
						<input
							type="text"
							placeholder="Search by request ID, student name, or item..."
							bind:value={requestHistorySearch}
							class="block w-full rounded-lg border border-gray-300 bg-white py-3 pl-11 pr-4 text-sm text-gray-900 placeholder-gray-500 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0"
						/>
					</div>
				</div>

				<!-- Request History Table -->
				{#if requestHistory.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No request history found</h3>
						<p class="mt-2 text-sm text-gray-500">Completed, resolved, cancelled, and rejected requests will appear here.</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead>
								<tr class="border-b border-gray-200 bg-gray-50">
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Request ID</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Student</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Items</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each requestHistory as request}
									<tr 
										onclick={() => openRequestDetailModal(request)}
										class="cursor-pointer hover:bg-gray-50 transition-colors"
									>
										<td class="px-6 py-4 text-sm font-medium text-gray-900">{formatRequestId(request.id)}</td>
										<td class="px-6 py-4">
											{#if request.student}
												<div class="flex items-center gap-3">
													<div
														class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-semibold text-pink-700 ring-2 ring-pink-200"
													>
														{#if request.student.profilePhotoUrl}
															<img
																src={request.student.profilePhotoUrl}
																alt={request.student.fullName || 'Student'}
																class="h-full w-full object-cover"
																loading="lazy"
															/>
														{:else}
															{(request.student.fullName || request.student.firstName || 'ST')
																.split(' ')
																.filter(Boolean)
																.slice(0, 2)
																.map((part: string) => part[0]?.toUpperCase() || '')
																.join('')}
														{/if}
													</div>
													<div>
														<div class="text-sm font-medium text-gray-900">
															{request.student.fullName || `${request.student.firstName || ''} ${request.student.lastName || ''}`.trim() || 'N/A'}
														</div>
														<div class="text-xs text-gray-500">{request.student.email || 'N/A'}</div>
													</div>
												</div>
											{:else}
												<div class="text-sm text-gray-500">N/A</div>
											{/if}
										</td>
										<td class="px-6 py-4 text-sm text-gray-600">
											{#if request.items.length === 1}
												{request.items[0].name}
											{:else}
												{request.items.length} items
											{/if}
										</td>
										<td class="px-6 py-4">
											<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getRequestStatusColor(request.status)}">
												{request.status.replace('_', ' ').toUpperCase()}
											</span>
										</td>
										<td class="px-6 py-4 text-sm text-gray-600">{formatTimestamp(request.createdAt)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Pagination -->
					{#if requestHistoryTotal > requestHistoryLimit}
						<div class="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
							<div class="text-sm text-gray-700">
								Showing {(requestHistoryPage - 1) * requestHistoryLimit + 1} to {Math.min(requestHistoryPage * requestHistoryLimit, requestHistoryTotal)} of {requestHistoryTotal} requests
							</div>
							<div class="flex gap-2">
								<button
									onclick={() => { requestHistoryPage--; loadRequestHistory(); }}
									disabled={requestHistoryPage === 1}
									class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									Previous
								</button>
								<button
									onclick={() => { requestHistoryPage++; loadRequestHistory(); }}
									disabled={requestHistoryPage >= Math.ceil(requestHistoryTotal / requestHistoryLimit)}
									class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									Next
								</button>
							</div>
						</div>
					{/if}
				{/if}
			</div>

		{:else if activeTab === 'archived'}
			<!-- Archived Items Tab -->
			<div class="p-6">
				<div class="mb-6 flex items-center justify-between">
					<div>
						<h3 class="text-lg font-semibold text-gray-900">Archived Items</h3>
						<p class="mt-1 text-sm text-gray-500">Items archived from active inventory. Can be restored anytime.</p>
					</div>

					<!-- Search -->
					<div class="w-64">
						<input
							type="text"
							placeholder="Search archived items..."
							bind:value={archivedSearch}
							onkeyup={(e) => { if (e.key === 'Enter') loadArchivedItems(); }}
							class="block w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
						/>
					</div>
				</div>

				{#if archivedItems.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No archived items</h3>
						<p class="mt-2 text-sm text-gray-500">Archived items will appear here.</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead>
								<tr class="border-b border-gray-200 bg-gray-50">
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Item Name</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Category</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Last Quantity</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Condition</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Archived Date</th>
									<th class="px-6 py-3 text-center text-sm font-semibold text-gray-900">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each archivedItems as item}
									<tr class="hover:bg-gray-50 transition-colors">
										<td class="px-6 py-4 text-sm font-medium text-gray-900">{item.name}</td>
										<td class="px-6 py-4 text-sm text-gray-600">{item.category || 'N/A'}</td>
										<td class="px-6 py-4 text-sm text-gray-600">{item.quantity}</td>
										<td class="px-6 py-4 text-sm">
											<span class="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
												{item.condition}
											</span>
										</td>
										<td class="px-6 py-4 text-sm text-gray-600">{formatTimestamp(item.updatedAt)}</td>
										<td class="px-6 py-4 text-center">
											<div class="flex items-center justify-center gap-2">
												<button
													onclick={() => restoreArchivedItem(item)}
													class="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
												>
													<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 15L3 9m0 0l6-6m-6 6h12a6 6 0 010 12h-3"/>
													</svg>
													Restore
												</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Pagination -->
					{#if archivedTotal > archivedLimit}
						<div class="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
							<div class="text-sm text-gray-700">
								Showing {(archivedPage - 1) * archivedLimit + 1} to {Math.min(archivedPage * archivedLimit, archivedTotal)} of {archivedTotal} items
							</div>
							<div class="flex gap-2">
								<button
									onclick={() => { archivedPage--; loadArchivedItems(); }}
									disabled={archivedPage === 1}
									class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									Previous
								</button>
								<button
									onclick={() => { archivedPage++; loadArchivedItems(); }}
									disabled={archivedPage >= Math.ceil(archivedTotal / archivedLimit)}
									class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									Next
								</button>
							</div>
						</div>
					{/if}
				{/if}
			</div>

		{:else if activeTab === 'deleted'}
			<!-- Recently Deleted Tab -->
			<div class="p-6">
				<div class="mb-6 flex items-center justify-between">
					<div>
						<h3 class="text-lg font-semibold text-gray-900">Recently Deleted Items</h3>
						<p class="mt-1 text-sm text-gray-500">Items automatically deleted after 30 days. Restore before expiration.</p>
					</div>

					<!-- Search -->
					<div class="w-64">
						<input
							type="text"
							placeholder="Search deleted items..."
							bind:value={deletedSearch}
							onkeyup={(e) => { if (e.key === 'Enter') loadDeletedItems(); }}
							class="block w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
						/>
					</div>
				</div>

				{#if deletedItems.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No recently deleted items</h3>
						<p class="mt-2 text-sm text-gray-500">Deleted items will appear here for 30 days before permanent deletion.</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead>
								<tr class="border-b border-gray-200 bg-gray-50">
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Type</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Name</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Category</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Deleted By</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Deleted Date</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Days Left</th>
									<th class="px-6 py-3 text-center text-sm font-semibold text-gray-900">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each deletedItems as item}
									{@const data = item.type === 'category' ? item.categoryData : item.itemData}
									<tr class="hover:bg-gray-50 transition-colors">
										<td class="px-6 py-4 text-sm">
											<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {item.type === 'category' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">
												{item.type === 'category' ? 'Category' : 'Item'}
											</span>
										</td>
										<td class="px-6 py-4 text-sm font-medium text-gray-900">{data.name}</td>
										<td class="px-6 py-4 text-sm text-gray-600">
											{item.type === 'category' ? 'N/A' : (data.category || 'N/A')}
										</td>
										<td class="px-6 py-4 text-sm text-gray-600">{item.deletedByName}</td>
										<td class="px-6 py-4 text-sm text-gray-600">{formatTimestamp(item.deletedAt)}</td>
										<td class="px-6 py-4">
											<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {item.daysRemaining <= 7 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}">
												{item.daysRemaining} days
											</span>
										</td>
										<td class="px-6 py-4 text-center">
											<div class="flex items-center justify-center gap-2">
												<button
													onclick={() => restoreDeletedItem(item)}
													class="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
												>
													<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 15L3 9m0 0l6-6m-6 6h12a6 6 0 010 12h-3"/>
													</svg>
													Restore
												</button>
												<button
													onclick={() => permanentlyDelete(item)}
													class="inline-flex items-center rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
												>
													<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
													</svg>
													Delete Forever
												</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Pagination -->
					{#if deletedTotal > deletedLimit}
						<div class="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
							<div class="text-sm text-gray-700">
								Showing {(deletedPage - 1) * deletedLimit + 1} to {Math.min(deletedPage * deletedLimit, deletedTotal)} of {deletedTotal} items
							</div>
							<div class="flex gap-2">
								<button
									onclick={() => { deletedPage--; loadDeletedItems(); }}
									disabled={deletedPage === 1}
									class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									Previous
								</button>
								<button
									onclick={() => { deletedPage++; loadDeletedItems(); }}
									disabled={deletedPage >= Math.ceil(deletedTotal / deletedLimit)}
									class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									Next
								</button>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>
{/if}

<!-- Request Detail Modal -->
{#if showRequestDetailModal && selectedHistoryRequest}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
			aria-hidden="true"
		></div>
		<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
			<div
				class="animate-scaleIn relative w-full max-w-4xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
			>
				<!-- Header -->
				<div
					class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-8 sm:py-6"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="flex min-w-0 flex-1 items-start gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30 sm:h-12 sm:w-12"
							>
								<svg
									class="h-5 w-5 text-white sm:h-6 sm:w-6"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2.5"
										d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									/>
								</svg>
							</div>
							<div class="min-w-0 flex-1">
								<h2 class="text-lg font-bold text-gray-900 sm:text-xl md:text-2xl">
									Request Details
								</h2>
								<p class="mt-0.5 font-mono text-xs font-semibold text-pink-600 sm:text-sm">
									{formatRequestId(selectedHistoryRequest.id)}
								</p>
								<div
									class="mt-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5 {getRequestStatusColor(selectedHistoryRequest.status)} shadow-sm ring-1 ring-black/5"
								>
									<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
									<span class="text-[10px] font-bold sm:text-xs"
										>{selectedHistoryRequest.status.replace('_', ' ').toUpperCase()}</span
									>
								</div>
							</div>
						</div>
						<button
							onclick={closeRequestDetailModal}
							aria-label="Close modal"
							class="rounded-xl p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 sm:p-2.5"
						>
							<svg
								class="h-5 w-5 sm:h-6 sm:w-6"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</div>
				</div>

				<!-- Content -->
				<div class="max-h-[70vh] overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
					<div class="space-y-6 sm:space-y-8">
						<!-- Student Information -->
						<div>
							<h3
								class="mb-4 flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase"
							>
								<div class="h-1 w-1 rounded-full bg-pink-500"></div>
								Student Information
							</h3>
							<div
								class="rounded-2xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-4 sm:p-5"
							>
								{#if selectedHistoryRequest.student}
									<div class="flex items-center gap-4">
										<div
											class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-lg font-semibold text-pink-700 ring-2 ring-pink-200 sm:h-16 sm:w-16 sm:text-xl"
										>
											{#if selectedHistoryRequest.student.profilePhotoUrl}
												<img
													src={selectedHistoryRequest.student.profilePhotoUrl}
													alt={selectedHistoryRequest.student.fullName || 'Student'}
													class="h-full w-full object-cover"
													loading="lazy"
												/>
											{:else}
												{(selectedHistoryRequest.student.fullName || selectedHistoryRequest.student.firstName || 'ST')
													.split(' ')
													.filter(Boolean)
													.slice(0, 2)
													.map((part: string) => part[0]?.toUpperCase() || '')
													.join('')}
											{/if}
										</div>
										<div class="min-w-0 flex-1">
											<p class="text-base font-bold text-gray-900 sm:text-lg">
												{selectedHistoryRequest.student.fullName || `${selectedHistoryRequest.student.firstName || ''} ${selectedHistoryRequest.student.lastName || ''}`.trim() || 'N/A'}
											</p>
											{#if selectedHistoryRequest.student.yearLevel || selectedHistoryRequest.student.block}
												<p class="mt-0.5 text-xs text-gray-600 sm:text-sm">
													{selectedHistoryRequest.student.yearLevel || 'N/A'} • Block {selectedHistoryRequest.student.block || 'N/A'}
												</p>
											{/if}
											<div
												class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500"
											>
												<span class="truncate">{selectedHistoryRequest.student.email || 'N/A'}</span>
											</div>
										</div>
									</div>
								{:else}
									<p class="text-sm text-gray-500">Student information not available</p>
								{/if}
							</div>
						</div>

						<!-- Request Information -->
						<div>
							<h3
								class="mb-4 flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase"
							>
								<div class="h-1 w-1 rounded-full bg-pink-500"></div>
								Request Information
							</h3>
							<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
								<div
									class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
								>
									<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
										<svg
											class="h-3.5 w-3.5 text-pink-500 sm:h-4 sm:w-4"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
											/>
										</svg>
										<p
											class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
										>
											Request Date
										</p>
									</div>
									<p class="text-sm font-bold text-gray-900 sm:text-base">
										{formatTimestamp(selectedHistoryRequest.createdAt)}
									</p>
								</div>
								<div
									class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
								>
									<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
										<svg
											class="h-3.5 w-3.5 text-pink-500 sm:h-4 sm:w-4"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
											/>
										</svg>
										<p
											class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
										>
											Borrow Period
										</p>
									</div>
									<p class="text-sm font-bold text-gray-900 sm:text-base">
										{new Date(selectedHistoryRequest.borrowDate).toLocaleDateString('en-US', {
											month: 'short',
											day: 'numeric'
										})} – {new Date(selectedHistoryRequest.returnDate).toLocaleDateString('en-US', {
											month: 'short',
											day: 'numeric'
										})}
									</p>
								</div>
								<div
									class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
								>
									<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
										<svg
											class="h-3.5 w-3.5 text-pink-500 sm:h-4 sm:w-4"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
											/>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
											/>
										</svg>
										<p
											class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
										>
											Usage Location
										</p>
									</div>
									<p class="text-sm font-bold text-gray-900 sm:text-base">
										{#if selectedHistoryRequest.usageLocation === 'school'}
											<span class="inline-flex items-center gap-1.5">
												<span class="h-2 w-2 rounded-full bg-green-500"></span>
												In-School Use
											</span>
										{:else if selectedHistoryRequest.usageLocation === 'outdoor'}
											<span class="inline-flex items-center gap-1.5">
												<span class="h-2 w-2 rounded-full bg-blue-500"></span>
												Outdoor/Off-Campus
											</span>
										{:else}
											<span class="text-gray-400">Not specified</span>
										{/if}
									</p>
								</div>
								{#if selectedHistoryRequest.returnedAt}
									<div
										class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
									>
										<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
											<svg
												class="h-3.5 w-3.5 text-pink-500 sm:h-4 sm:w-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
												/>
											</svg>
											<p
												class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
											>
												Returned At
											</p>
										</div>
										<p class="text-sm font-bold text-gray-900 sm:text-base">
											{formatTimestamp(selectedHistoryRequest.returnedAt)}
										</p>
									</div>
								{/if}
								<div
									class="group col-span-1 rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:col-span-2 sm:p-4"
								>
									<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
										<svg
											class="h-3.5 w-3.5 text-pink-500 sm:h-4 sm:w-4"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
											/>
										</svg>
										<p
											class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
										>
											Purpose & Details
										</p>
									</div>
									<p class="text-sm leading-relaxed font-semibold text-gray-900 sm:text-base">
										{selectedHistoryRequest.purpose || 'N/A'}
									</p>
								</div>
							</div>
						</div>

						<!-- Requested Items -->
						<div>
							<h3
								class="mb-4 flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase"
							>
								<div class="h-1 w-1 rounded-full bg-pink-500"></div>
								Requested Items ({selectedHistoryRequest.items.length})
							</h3>
							<div class="grid gap-3 sm:grid-cols-2">
								{#each selectedHistoryRequest.items as item}
									{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
									<div
										class="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-pink-200 hover:shadow-md"
									>
										{#if pic}
											<img
												src={pic}
												alt={item.name}
												class="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-gray-100"
												loading="lazy"
											/>
										{:else}
											<div
												class="h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-gray-100"
											>
												<ItemImagePlaceholder size="sm" />
											</div>
										{/if}
										<div class="min-w-0 flex-1">
											<p
												class="truncate text-sm font-semibold text-gray-900 transition-colors group-hover:text-pink-600"
											>
												{item.name}
											</p>
											<p class="mt-0.5 text-xs text-gray-500">
												{#if item.category}
													{item.category} •
												{/if}
												Qty: {item.quantity}
											</p>
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>
				</div>

				<!-- Footer -->
				<div
					class="sticky bottom-0 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-8 sm:py-5"
				>
					<button
						onclick={closeRequestDetailModal}
						class="w-full rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-bold text-gray-700 transition-all hover:bg-gray-200 active:scale-[0.98] sm:px-6 sm:py-3"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
