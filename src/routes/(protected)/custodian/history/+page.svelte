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
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import ActionMenu from '$lib/components/ui/ActionMenu.svelte';
	import { RotateCcw, Trash2 } from 'lucide-svelte';

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
	let showActivityFilters = $state(false);

	// Request History state
	let requestHistory = $state<any[]>([]);
	let requestHistoryTotal = $state(0);
	let requestHistoryPage = $state(1);
	let requestHistoryLimit = $state(50);
	let requestHistorySearch = $state('');
	let requestHistoryLoaded = $state(false); // Track if request history has been loaded
	let requestHistoryFilterStatus = $state('');
	let requestHistoryFilterStartDate = $state('');
	let requestHistoryFilterEndDate = $state('');
	let showRequestHistoryFilters = $state(false);
	let showRequestDetailModal = $state(false);
	let selectedHistoryRequest = $state<any>(null);
	let itemPictureCache = $state<Map<string, string>>(new Map());

	// Archived Items filters
	let archivedFilterCondition = $state('');
	let archivedFilterCategory = $state('');
	let showArchivedFilters = $state(false);

	// Deleted Items filters
	let deletedFilterType = $state('');
	let deletedFilterDaysLeft = $state('');
	let showDeletedFilters = $state(false);

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
		// Always reload data when switching to a tab to ensure fresh state.
		// forceRefresh=true bypasses the server cache so mutations are reflected immediately.
		if (tab === 'activity-logs') {
			loadActivityLogs();
		} else if (tab === 'request-history') {
			loadRequestHistory();
		} else if (tab === 'archived') {
			loadArchivedItems(true);
		} else if (tab === 'deleted') {
			loadDeletedItems(true);
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
				await loadArchivedItems(true);
			} else if (activeTab === 'deleted') {
				await loadDeletedItems(true);
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
	async function loadArchivedItems(forceRefresh = false) {
		try {
			const response = await archivedItemsAPI.getArchived({
				search: archivedSearch || undefined,
				page: archivedPage,
				limit: archivedLimit,
				forceRefresh
			});
			archivedItems = response.items;
			archivedTotal = response.total;
			archivedLoaded = true;
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to load archived items');
		}
	}

	// Load Recently Deleted Items
	async function loadDeletedItems(forceRefresh = false) {
		try {
			const response = await deletedItemsAPI.getDeleted({
				search: deletedSearch || undefined,
				page: deletedPage,
				limit: deletedLimit,
				forceRefresh
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
			await loadArchivedItems(true);
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
			await loadDeletedItems(true);
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
			await loadDeletedItems(true);
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

	// Filtered data using derived state
	const filteredActivityLogs = $derived.by(() => {
		let filtered = activityLogs;

		// Apply action filter
		if (filterAction) {
			filtered = filtered.filter(log => log.action === filterAction);
		}

		// Apply entity type filter
		if (filterEntityType) {
			filtered = filtered.filter(log => log.entityType === filterEntityType);
		}

		// Apply date range filter
		if (filterStartDate) {
			const startDate = new Date(filterStartDate);
			filtered = filtered.filter(log => new Date(log.timestamp) >= startDate);
		}

		if (filterEndDate) {
			const endDate = new Date(filterEndDate);
			endDate.setHours(23, 59, 59, 999); // Include the entire end date
			filtered = filtered.filter(log => new Date(log.timestamp) <= endDate);
		}

		// Apply search filter
		if (activitySearchQuery) {
			const query = activitySearchQuery.toLowerCase();
			filtered = filtered.filter(log => {
				const entityName = log.entityName || '';
				const userName = log.userName || '';
				const ipAddress = log.ipAddress || '';
				const userRole = log.userRole || '';
				
				return (
					entityName.toLowerCase().includes(query) ||
					userName.toLowerCase().includes(query) ||
					ipAddress.toLowerCase().includes(query) ||
					userRole.toLowerCase().includes(query)
				);
			});
		}

		return filtered;
	});

	const filteredRequestHistory = $derived.by(() => {
		let filtered = requestHistory;

		// Apply status filter
		if (requestHistoryFilterStatus) {
			filtered = filtered.filter(req => req.status === requestHistoryFilterStatus);
		}

		// Apply date range filter
		if (requestHistoryFilterStartDate) {
			const startDate = new Date(requestHistoryFilterStartDate);
			filtered = filtered.filter(req => new Date(req.createdAt) >= startDate);
		}

		if (requestHistoryFilterEndDate) {
			const endDate = new Date(requestHistoryFilterEndDate);
			endDate.setHours(23, 59, 59, 999); // Include the entire end date
			filtered = filtered.filter(req => new Date(req.createdAt) <= endDate);
		}

		// Apply search filter
		if (requestHistorySearch) {
			const query = requestHistorySearch.toLowerCase();
			filtered = filtered.filter(req => {
				const studentName = req.student?.fullName || req.student?.firstName || '';
				const studentEmail = req.student?.email || '';
				const requestId = req.id || '';
				const items = req.items?.map((item: any) => item.name).join(' ') || '';
				
				return (
					studentName.toLowerCase().includes(query) ||
					studentEmail.toLowerCase().includes(query) ||
					requestId.toLowerCase().includes(query) ||
					items.toLowerCase().includes(query)
				);
			});
		}

		return filtered;
	});

	const filteredArchivedItems = $derived.by(() => {
		let filtered = archivedItems;

		// Apply condition filter
		if (archivedFilterCondition) {
			filtered = filtered.filter(item => 
				item.condition?.toLowerCase() === archivedFilterCondition.toLowerCase()
			);
		}

		// Apply category filter
		if (archivedFilterCategory) {
			filtered = filtered.filter(item => item.category === archivedFilterCategory);
		}

		// Apply search filter
		if (archivedSearch) {
			const query = archivedSearch.toLowerCase();
			filtered = filtered.filter(item => {
				const name = item.name || '';
				const category = item.category || '';
				return (
					name.toLowerCase().includes(query) ||
					category.toLowerCase().includes(query)
				);
			});
		}

		return filtered;
	});

	const filteredDeletedItems = $derived.by(() => {
		let filtered = deletedItems;

		// Apply type filter
		if (deletedFilterType) {
			filtered = filtered.filter(item => item.type === deletedFilterType);
		}

		// Apply days left filter
		if (deletedFilterDaysLeft) {
			filtered = filtered.filter(item => {
				const daysLeft = item.daysRemaining || 0;
				if (deletedFilterDaysLeft === 'urgent') return daysLeft <= 7;
				if (deletedFilterDaysLeft === 'moderate') return daysLeft > 7 && daysLeft <= 15;
				if (deletedFilterDaysLeft === 'safe') return daysLeft > 15;
				return true;
			});
		}

		// Apply search filter
		if (deletedSearch) {
			const query = deletedSearch.toLowerCase();
			filtered = filtered.filter(item => {
				const data = item.type === 'category' ? item.categoryData : item.itemData;
				const name = data?.name || '';
				const category = item.type === 'item' ? (data?.category || '') : '';
				const deletedBy = item.deletedByName || '';
				
				return (
					name.toLowerCase().includes(query) ||
					category.toLowerCase().includes(query) ||
					deletedBy.toLowerCase().includes(query)
				);
			});
		}

		return filtered;
	});
</script>

<svelte:head>
	<title>History - CHTM Cooks</title>
</svelte:head>

<style>
	/* Hide scrollbar for Chrome, Safari and Opera */
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}

	/* Hide scrollbar for IE, Edge and Firefox */
	.scrollbar-hide {
		-ms-overflow-style: none;  /* IE and Edge */
		scrollbar-width: none;  /* Firefox */
	}
</style>

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
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex" aria-label="Tabs">
			<button
				onclick={() => switchTab('activity-logs')}
				class="flex flex-1 items-center justify-center gap-1 border-b-2 px-1 py-3 text-[11px] font-medium whitespace-nowrap transition-colors sm:text-sm {activeTab === 'activity-logs'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<span class="hidden sm:inline">Activity Logs</span>
				<span class="sm:hidden">Activity</span>
				{#if activityTotal > 0}
					<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'activity-logs' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
						{activityTotal}
					</span>
				{/if}
			</button>

			<button
				onclick={() => switchTab('request-history')}
				class="flex flex-1 items-center justify-center gap-1 border-b-2 px-1 py-3 text-[11px] font-medium whitespace-nowrap transition-colors sm:text-sm {activeTab === 'request-history'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<span class="hidden sm:inline">Requests</span>
				<span class="sm:hidden">Requests</span>
				{#if requestHistoryTotal > 0}
					<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'request-history' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
						{requestHistoryTotal}
					</span>
				{/if}
			</button>
			
			<button
				onclick={() => switchTab('archived')}
				class="flex flex-1 items-center justify-center gap-1 border-b-2 px-1 py-3 text-[11px] font-medium whitespace-nowrap transition-colors sm:text-sm {activeTab === 'archived'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Archived
				{#if archivedTotal > 0}
					<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'archived' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
						{archivedTotal}
					</span>
				{/if}
			</button>
			
			<button
				onclick={() => switchTab('deleted')}
				class="flex flex-1 items-center justify-center gap-1 border-b-2 px-1 py-3 text-[11px] font-medium whitespace-nowrap transition-colors sm:text-sm {activeTab === 'deleted'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<span class="hidden sm:inline">Deleted</span>
				<span class="sm:hidden">Deleted</span>
				{#if deletedTotal > 0}
					<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'deleted' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}">
						{deletedTotal}
					</span>
				{/if}
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	<div class="rounded-xl bg-white shadow-sm">
		<div class="p-4 sm:p-6">
			{#if activeTab === 'activity-logs'}
			<!-- Activity Logs Tab -->
			<div>
				<div class="mb-4 sm:mb-6">
					<h3 class="text-base font-semibold text-gray-900 sm:text-lg">Activity Logs & Audit Trail</h3>
					<p class="mt-1 text-xs text-gray-500 sm:text-sm">Complete audit trail of all inventory operations</p>
				</div>

				<!-- Search Bar and Filter Button -->
				<div class="mb-4 flex gap-2 sm:mb-6">
					<div class="relative flex-1">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 sm:pl-4">
							<svg class="h-4 w-4 text-gray-400 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
						</div>
						<input
							type="text"
							placeholder="Search by entity name, user..."
							bind:value={activitySearchQuery}
							class="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-500 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:py-3 sm:pl-11 sm:pr-4"
						/>
					</div>
					<button
						onclick={() => showActivityFilters = !showActivityFilters}
						class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-3 {showActivityFilters ? 'bg-gray-50 border-pink-500 text-pink-600' : ''}"
					>
						<svg class="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
						</svg>
						<span class="hidden sm:inline">Filters</span>
					</button>
				</div>

				<!-- Filters Section -->
				{#if showActivityFilters}
					<div class="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:mb-6 sm:space-y-4">
						<!-- Row 1: Action and Type -->
						<div class="grid grid-cols-2 gap-3 sm:gap-4">
							<div>
								<label for="action-filter" class="mb-1 block text-xs font-medium text-gray-700 sm:text-sm">Action</label>
								<select
									id="action-filter"
									bind:value={filterAction}
									class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-2.5"
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
								<label for="entity-filter" class="mb-1 block text-xs font-medium text-gray-700 sm:text-sm">Type</label>
								<select
									id="entity-filter"
									bind:value={filterEntityType}
									class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-2.5"
								>
									<option value="">All Types</option>
									<option value="item">Items</option>
									<option value="category">Categories</option>
								</select>
							</div>
						</div>

						<!-- Row 2: Start Date and End Date -->
						<div class="grid grid-cols-2 gap-3 sm:gap-4">
							<div>
								<label for="start-date" class="mb-1 block text-xs font-medium text-gray-700 sm:text-sm">Start Date</label>
								<input
									type="date"
									id="start-date"
									bind:value={filterStartDate}
									class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-2.5"
								/>
							</div>

							<div>
								<label for="end-date" class="mb-1 block text-xs font-medium text-gray-700 sm:text-sm">End Date</label>
								<input
									type="date"
									id="end-date"
									bind:value={filterEndDate}
									class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-2.5"
								/>
							</div>
						</div>

						<!-- Clear Filters Button -->
						<div class="flex justify-end">
							<button
								onclick={() => {
									filterAction = '';
									filterEntityType = '';
									filterStartDate = '';
									filterEndDate = '';
								}}
								class="text-xs font-medium text-pink-600 hover:text-pink-700 sm:text-sm"
							>
								Clear Filters
							</button>
						</div>
					</div>
				{/if}

				<!-- Activity Logs Table -->
				{#if filteredActivityLogs.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No activity logs found</h3>
						<p class="mt-2 text-sm text-gray-500">
							{#if filterAction || filterEntityType || filterStartDate || filterEndDate || activitySearchQuery}
								No logs match your current filters. Try adjusting your search criteria.
							{:else}
								Activity logs will appear here as operations are performed.
							{/if}
						</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead>
								<tr class="border-b border-gray-200 bg-gray-50">
									<th class="w-10 px-3 py-3 text-center text-xs font-semibold text-gray-400">#</th>
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
								{#each filteredActivityLogs as log, i}
									<tr class="hover:bg-gray-50 transition-colors">
										<td class="px-3 py-4 text-center">
											<span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500">{(activityPage - 1) * activityLimit + i + 1}</span>
										</td>
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
						<Pagination
							currentPage={activityPage}
							totalPages={Math.ceil(activityTotal / activityLimit)}
							totalItems={activityTotal}
							itemsPerPage={activityLimit}
							onPageChange={(p) => { activityPage = p; loadActivityLogs(); }}
							class="mt-4"
						/>
					{:else if filteredActivityLogs.length < activityLogs.length}
						<div class="mt-4 border-t border-gray-200 pt-4 text-center text-xs text-gray-700 sm:text-sm">
							Showing {filteredActivityLogs.length} of {activityLogs.length} entries (filtered)
						</div>
					{/if}
				{/if}
			</div>

		{:else if activeTab === 'request-history'}
			<!-- Request History Tab -->
			<div>
				<div class="mb-4 sm:mb-6">
					<h3 class="text-base font-semibold text-gray-900 sm:text-lg">Borrow Request History</h3>
					<p class="mt-1 text-xs text-gray-500 sm:text-sm">Complete history of all student borrow requests processed by custodians</p>
				</div>

				<!-- Search Bar and Filter Button -->
				<div class="mb-4 flex gap-2 sm:mb-6">
					<div class="relative flex-1">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 sm:pl-4">
							<svg class="h-4 w-4 text-gray-400 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
						</div>
						<input
							type="text"
							placeholder="Search requests..."
							bind:value={requestHistorySearch}
							class="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-500 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:py-3 sm:pl-11 sm:pr-4"
						/>
					</div>
					<button
						onclick={() => showRequestHistoryFilters = !showRequestHistoryFilters}
						class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-3 {showRequestHistoryFilters ? 'bg-gray-50 border-pink-500 text-pink-600' : ''}"
					>
						<svg class="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
						</svg>
						<span class="hidden sm:inline">Filters</span>
					</button>
				</div>

				<!-- Filters Section -->
				{#if showRequestHistoryFilters}
					<div class="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:mb-6 sm:space-y-4">
						<!-- Row 1: Status and Date Range -->
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
							<div>
								<label for="request-status-filter" class="mb-1 block text-xs font-medium text-gray-700 sm:text-sm">Status</label>
								<select
									id="request-status-filter"
									bind:value={requestHistoryFilterStatus}
									class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-2.5"
								>
									<option value="">All Statuses</option>
									<option value="returned">Returned</option>
									<option value="resolved">Resolved</option>
									<option value="cancelled">Cancelled</option>
									<option value="rejected">Rejected</option>
								</select>
							</div>

							<div>
								<label for="request-start-date" class="mb-1 block text-xs font-medium text-gray-700 sm:text-sm">Start Date</label>
								<input
									type="date"
									id="request-start-date"
									bind:value={requestHistoryFilterStartDate}
									class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-2.5"
								/>
							</div>

							<div>
								<label for="request-end-date" class="mb-1 block text-xs font-medium text-gray-700 sm:text-sm">End Date</label>
								<input
									type="date"
									id="request-end-date"
									bind:value={requestHistoryFilterEndDate}
									class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-2.5"
								/>
							</div>
						</div>

						<!-- Clear Filters Button -->
						<div class="flex justify-end">
							<button
								onclick={() => {
									requestHistoryFilterStatus = '';
									requestHistoryFilterStartDate = '';
									requestHistoryFilterEndDate = '';
									loadRequestHistory();
								}}
								class="text-xs font-medium text-pink-600 hover:text-pink-700 sm:text-sm"
							>
								Clear Filters
							</button>
						</div>
					</div>
				{/if}

				<!-- Request History Table -->
				{#if filteredRequestHistory.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No request history found</h3>
						<p class="mt-2 text-sm text-gray-500">
							{#if requestHistoryFilterStatus || requestHistoryFilterStartDate || requestHistoryFilterEndDate || requestHistorySearch}
								No requests match your current filters. Try adjusting your search criteria.
							{:else}
								Completed, resolved, cancelled, and rejected requests will appear here.
							{/if}
						</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead>
								<tr class="border-b border-gray-200 bg-gray-50">
									<th class="w-10 px-3 py-3 text-center text-xs font-semibold text-gray-400">#</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Request ID</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Student</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Items</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each filteredRequestHistory as request, i}
									<tr 
										onclick={() => openRequestDetailModal(request)}
										class="cursor-pointer hover:bg-gray-50 transition-colors"
									>
										<td class="px-3 py-4 text-center">
											<span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500">{(requestHistoryPage - 1) * requestHistoryLimit + i + 1}</span>
										</td>
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
						<Pagination
							currentPage={requestHistoryPage}
							totalPages={Math.ceil(requestHistoryTotal / requestHistoryLimit)}
							totalItems={requestHistoryTotal}
							itemsPerPage={requestHistoryLimit}
							onPageChange={(p) => { requestHistoryPage = p; loadRequestHistory(); }}
							class="mt-4"
						/>
					{:else if filteredRequestHistory.length < requestHistory.length}
						<div class="mt-4 border-t border-gray-200 pt-4 text-center text-xs text-gray-700 sm:text-sm">
							Showing {filteredRequestHistory.length} of {requestHistory.length} requests (filtered)
						</div>
					{/if}
				{/if}
			</div>

		{:else if activeTab === 'archived'}
			<!-- Archived Items Tab -->
			<div>
				<div class="mb-4 sm:mb-6">
					<h3 class="text-base font-semibold text-gray-900 sm:text-lg">Archived Items</h3>
					<p class="mt-1 text-xs text-gray-500 sm:text-sm">Items archived from active inventory. Can be restored anytime.</p>
				</div>

				<!-- Search Bar and Filter Button -->
				<div class="mb-4 flex gap-2 sm:mb-6">
					<div class="relative flex-1">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 sm:pl-4">
							<svg class="h-4 w-4 text-gray-400 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
						</div>
						<input
							type="text"
							placeholder="Search archived items..."
							bind:value={archivedSearch}
							onkeyup={(e) => { if (e.key === 'Enter') loadArchivedItems(); }}
							class="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-500 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:py-3 sm:pl-11 sm:pr-4"
						/>
					</div>
					<button
						onclick={() => showArchivedFilters = !showArchivedFilters}
						class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-3 {showArchivedFilters ? 'bg-gray-50 border-pink-500 text-pink-600' : ''}"
					>
						<svg class="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
						</svg>
						<span class="hidden sm:inline">Filters</span>
					</button>
				</div>

				<!-- Filters Section -->
				{#if showArchivedFilters}
					<div class="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:mb-6 sm:space-y-4">
						<!-- Row 1: Condition and Category -->
						<div class="grid grid-cols-2 gap-3 sm:gap-4">
							<div>
								<label for="archived-condition-filter" class="mb-1 block text-xs font-medium text-gray-700 sm:text-sm">Condition</label>
								<select
									id="archived-condition-filter"
									bind:value={archivedFilterCondition}
									class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-2.5"
								>
									<option value="">All Conditions</option>
									<option value="good">Good</option>
									<option value="fair">Fair</option>
									<option value="poor">Poor</option>
									<option value="damaged">Damaged</option>
								</select>
							</div>

							<div>
								<label for="archived-category-filter" class="mb-1 block text-xs font-medium text-gray-700 sm:text-sm">Category</label>
								<select
									id="archived-category-filter"
									bind:value={archivedFilterCategory}
									class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-2.5"
								>
									<option value="">All Categories</option>
									<option value="Cookware">Cookware</option>
									<option value="Utensils">Utensils</option>
									<option value="Appliances">Appliances</option>
									<option value="Bakeware">Bakeware</option>
								</select>
							</div>
						</div>

						<!-- Clear Filters Button -->
						<div class="flex justify-end">
							<button
								onclick={() => {
									archivedFilterCondition = '';
									archivedFilterCategory = '';
									loadArchivedItems();
								}}
								class="text-xs font-medium text-pink-600 hover:text-pink-700 sm:text-sm"
							>
								Clear Filters
							</button>
						</div>
					</div>
				{/if}

				{#if filteredArchivedItems.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No archived items</h3>
						<p class="mt-2 text-sm text-gray-500">
							{#if archivedFilterCondition || archivedFilterCategory || archivedSearch}
								No items match your current filters. Try adjusting your search criteria.
							{:else}
								Archived items will appear here.
							{/if}
						</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead>
								<tr class="border-b border-gray-200 bg-gray-50">
									<th class="w-10 px-3 py-3 text-center text-xs font-semibold text-gray-400">#</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Item Name</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Category</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Last Quantity</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Condition</th>
									<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Archived Date</th>
									<th class="px-6 py-3 text-center text-sm font-semibold text-gray-900">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each filteredArchivedItems as item, i}
									<tr class="hover:bg-gray-50 transition-colors">
										<td class="px-3 py-4 text-center">
											<span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500">{(archivedPage - 1) * archivedLimit + i + 1}</span>
										</td>
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
													class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 active:scale-95"
													title="Restore to active inventory"
												>
													<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
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
						<Pagination
							currentPage={archivedPage}
							totalPages={Math.ceil(archivedTotal / archivedLimit)}
							totalItems={archivedTotal}
							itemsPerPage={archivedLimit}
							onPageChange={(p) => { archivedPage = p; loadArchivedItems(); }}
							class="mt-4"
						/>
					{:else if filteredArchivedItems.length < archivedItems.length}
						<div class="mt-4 border-t border-gray-200 pt-4 text-center text-xs text-gray-700 sm:text-sm">
							Showing {filteredArchivedItems.length} of {archivedItems.length} items (filtered)
						</div>
					{/if}
				{/if}
			</div>

		{:else if activeTab === 'deleted'}
			<!-- Recently Deleted Tab -->
			<div>
				<div class="mb-4 sm:mb-6">
					<h3 class="text-base font-semibold text-gray-900 sm:text-lg">Recently Deleted Items</h3>
					<p class="mt-1 text-xs text-gray-500 sm:text-sm">Items automatically deleted after 30 days. Restore before expiration.</p>
				</div>

				<!-- Search Bar and Filter Button -->
				<div class="mb-4 flex gap-2 sm:mb-6">
					<div class="relative flex-1">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 sm:pl-4">
							<svg class="h-4 w-4 text-gray-400 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
						</div>
						<input
							type="text"
							placeholder="Search deleted items..."
							bind:value={deletedSearch}
							onkeyup={(e) => { if (e.key === 'Enter') loadDeletedItems(); }}
							class="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-500 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:py-3 sm:pl-11 sm:pr-4"
						/>
					</div>
					<button
						onclick={() => showDeletedFilters = !showDeletedFilters}
						class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-3 {showDeletedFilters ? 'bg-gray-50 border-pink-500 text-pink-600' : ''}"
					>
						<svg class="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
						</svg>
						<span class="hidden sm:inline">Filters</span>
					</button>
				</div>

				<!-- Filters Section -->
				{#if showDeletedFilters}
					<div class="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:mb-6 sm:space-y-4">
						<!-- Row 1: Type and Days Left -->
						<div class="grid grid-cols-2 gap-3 sm:gap-4">
							<div>
								<label for="deleted-type-filter" class="mb-1 block text-xs font-medium text-gray-700 sm:text-sm">Type</label>
								<select
									id="deleted-type-filter"
									bind:value={deletedFilterType}
									class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-2.5"
								>
									<option value="">All Types</option>
									<option value="item">Items</option>
									<option value="category">Categories</option>
								</select>
							</div>

							<div>
								<label for="deleted-days-filter" class="mb-1 block text-xs font-medium text-gray-700 sm:text-sm">Days Left</label>
								<select
									id="deleted-days-filter"
									bind:value={deletedFilterDaysLeft}
									class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:px-4 sm:py-2.5"
								>
									<option value="">All</option>
									<option value="urgent">≤ 7 days (Urgent)</option>
									<option value="moderate">8-15 days</option>
									<option value="safe">> 15 days</option>
								</select>
							</div>
						</div>

						<!-- Clear Filters Button -->
						<div class="flex justify-end">
							<button
								onclick={() => {
									deletedFilterType = '';
									deletedFilterDaysLeft = '';
									loadDeletedItems();
								}}
								class="text-xs font-medium text-pink-600 hover:text-pink-700 sm:text-sm"
							>
								Clear Filters
							</button>
						</div>
					</div>
				{/if}

				{#if filteredDeletedItems.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No recently deleted items</h3>
						<p class="mt-2 text-sm text-gray-500">
							{#if deletedFilterType || deletedFilterDaysLeft || deletedSearch}
								No items match your current filters. Try adjusting your search criteria.
							{:else}
								Deleted items will appear here for 30 days before permanent deletion.
							{/if}
						</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead>
								<tr class="border-b border-gray-200 bg-gray-50">
									<th class="w-10 px-3 py-3 text-center text-xs font-semibold text-gray-400">#</th>
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
								{#each filteredDeletedItems as item, i}
									{@const data = item.type === 'category' ? item.categoryData : item.itemData}
									<tr class="hover:bg-gray-50 transition-colors">
										<td class="px-3 py-4 text-center">
											<span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500">{(deletedPage - 1) * deletedLimit + i + 1}</span>
										</td>
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
										<td class="px-6 py-4 text-center" onclick={(e) => e.stopPropagation()}>
											<ActionMenu
												align="right"
												triggerLabel="Item actions"
												items={[
													{
														label: 'Restore',
														icon: RotateCcw,
														variant: 'success',
														action: () => restoreDeletedItem(item)
													},
													{
														label: 'Remove Forever',
														icon: Trash2,
														variant: 'danger',
														divider: true,
														action: () => permanentlyDelete(item)
													}
												]}
											/>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Pagination -->
					{#if deletedTotal > deletedLimit}
						<Pagination
							currentPage={deletedPage}
							totalPages={Math.ceil(deletedTotal / deletedLimit)}
							totalItems={deletedTotal}
							itemsPerPage={deletedLimit}
							onPageChange={(p) => { deletedPage = p; loadDeletedItems(); }}
							class="mt-4"
						/>
					{:else if filteredDeletedItems.length < deletedItems.length}
						<div class="mt-4 border-t border-gray-200 pt-4 text-center text-xs text-gray-700 sm:text-sm">
							Showing {filteredDeletedItems.length} of {deletedItems.length} items (filtered)
						</div>
					{/if}
				{/if}
			</div>
		{/if}
		</div>
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
