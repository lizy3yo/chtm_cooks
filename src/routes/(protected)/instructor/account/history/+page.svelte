<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { toastStore } from '$lib/stores/toast';
	import { profileStore } from '$lib/stores/profile';
	import { borrowRequestsAPI } from '$lib/api/borrowRequests';
	import { catalogAPI } from '$lib/api/catalog';
	import { inventoryHistoryAPI } from '$lib/api/inventoryHistory';
	import type { InventoryHistoryEntry } from '$lib/api/inventoryHistory';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';

	type Tab = 'activity-logs' | 'request-history';
	
	let activeTab = $state<Tab>('activity-logs');
	
	// Get current user email reactively from store
	let currentUserEmail = $state('');
	
	// Update email when profile loads
	$effect(() => {
		if (browser && $profileStore.profile?.email) {
			currentUserEmail = $profileStore.profile.email;
			console.log('[USER-EMAIL] Set to:', currentUserEmail);
		}
	});
	
	let initialLoadComplete = $state(false);
	let activityLogsLoading = $state(true);
	let requestHistoryLoading = $state(true);
	let inFlightLoadId = 0;

	// Activity Logs state
	let activityLogs = $state<InventoryHistoryEntry[]>([]);
	let activityTotal = $state(0);
	let activityPage = $state(1);
	let activityLimit = $state(20); // Items per page
	let activityLogsLoaded = $state(false);
	let activityLogsRefreshing = $state(false);

	const activeTabLoading = $derived(
		activeTab === 'activity-logs' ? activityLogsLoading : requestHistoryLoading
	);
	
	// Filters for activity logs
	let filterAction = $state('');
	let filterEntityType = $state('');
	let filterStartDate = $state('');
	let filterEndDate = $state('');
	let activitySearchQuery = $state('');
	let showActivityFilters = $state(false);
	let filterMyActivitiesOnly = $state(false);

	// Request History state
	let requestHistory = $state<any[]>([]);
	let requestHistoryTotal = $state(0);
	let requestHistoryPage = $state(1);
	let requestHistoryLimit = $state(50);
	let requestHistorySearch = $state('');
	let requestHistoryLoaded = $state(false);
	let requestHistoryFilterStatus = $state('');
	let requestHistoryFilterStartDate = $state('');
	let requestHistoryFilterEndDate = $state('');
	let showRequestHistoryFilters = $state(false);
	let showRequestDetailModal = $state(false);
	let selectedHistoryRequest = $state<any>(null);
	let itemPictureCache = $state<Map<string, string>>(new Map());

	// Load data on mount with caching
	onMount(() => {
		// Load profile if not already loaded
		if (browser && !$profileStore.profile) {
			console.log('[PROFILE] Loading profile...');
			import('$lib/api/profile').then(({ profileApi }) => {
				profileApi.get().then((profile: any) => {
					console.log('[PROFILE] Loaded:', profile.email);
					currentUserEmail = profile.email;
					// Update the profile store so $effect can react to it
					profileStore.setProfile(profile);
				}).catch((err: any) => {
					console.error('[PROFILE] Failed to load:', err);
				});
			});
		} else if (browser && $profileStore.profile?.email) {
			// Profile already loaded, set email immediately
			currentUserEmail = $profileStore.profile.email;
			console.log('[PROFILE] Already loaded:', currentUserEmail);
		}
		
		// Check for cached activity logs first for instant render
		const cachedActivityLogs = inventoryHistoryAPI.peekCachedHistory({
			action: filterAction || undefined,
			entityType: filterEntityType as any || undefined,
			startDate: filterStartDate || undefined,
			endDate: filterEndDate || undefined,
			page: activityPage,
			limit: activityLimit
		});

		if (cachedActivityLogs) {
			activityLogs = cachedActivityLogs.history;
			activityTotal = cachedActivityLogs.total;
			activityLogsLoaded = true;
			activityLogsLoading = false;
			initialLoadComplete = true;
			console.log('[HISTORY-CACHE] Using cached activity logs:', cachedActivityLogs.history.length, 'items');
			
			// Background progressive loading
			loadAllHistoryProgressive(true).catch((err) => {
				console.error('[HISTORY] Background progressive refresh failed:', err);
			});
		} else {
			loadAllHistoryProgressive(true).then(() => {
				initialLoadComplete = true;
			}).catch((err) => {
				console.error('[HISTORY] Failed progressive load:', err);
				initialLoadComplete = true;
			});
		}

		// Set up periodic background refresh (every 5 minutes)
		const refreshInterval = setInterval(() => {
			console.log('[HISTORY-AUTO-REFRESH] Refreshing activity logs in background...');
			loadActivityLogs(true).catch((err) => {
				console.error('[HISTORY-AUTO-REFRESH] Failed:', err);
			});
		}, 5 * 60 * 1000);

		return () => {
			clearInterval(refreshInterval);
		};
	});

	// Set up real-time inventory change subscription
	onMount(() => {
		console.log('[HISTORY-SSE] Setting up inventory change subscription');
		const unsubscribe = inventoryHistoryAPI.subscribeToChanges((event) => {
			console.log('[HISTORY-SSE] ✓ Inventory change received:', event);
			console.log('[HISTORY-SSE] Refreshing activity logs...');
			
			// Refresh activity logs in background when inventory changes
			loadActivityLogs(false, true).then(() => {
				console.log('[HISTORY-SSE] Activity logs refreshed successfully');
			}).catch((err) => {
				console.error('[HISTORY-SSE] Failed to refresh activity logs:', err);
			});
		});
		
		console.log('[HISTORY-SSE] Subscription created');
		
		return () => {
			console.log('[HISTORY-SSE] Unsubscribing from inventory changes');
			unsubscribe();
		};
	});

	// Switch tabs
	function switchTab(tab: Tab) {
		activeTab = tab;
		if (tab === 'activity-logs' && !activityLogsLoaded) {
			loadActivityLogs();
		} else if (tab === 'request-history' && !requestHistoryLoaded) {
			loadRequestHistory();
		}
	}

	async function loadAllHistoryProgressive(forceRefresh = true) {
		const loadId = ++inFlightLoadId;
		
		const activityPromise = inventoryHistoryAPI.getHistory({
			action: filterAction || undefined,
			entityType: filterEntityType as any || undefined,
			startDate: filterStartDate || undefined,
			endDate: filterEndDate || undefined,
			page: activityPage,
			limit: activityLimit,
			forceRefresh
		});

		const requestsPromise = borrowRequestsAPI.list({
			statuses: ['returned', 'resolved', 'cancelled', 'rejected'],
			page: requestHistoryPage,
			limit: requestHistoryLimit
		});

		const results = await Promise.allSettled([activityPromise, requestsPromise]);

		if (loadId !== inFlightLoadId) return;

		// 1. Settle Activity Logs (first)
		const actRes = results[0];
		if (actRes.status === 'fulfilled') {
			activityLogs = actRes.value.history;
			activityTotal = actRes.value.total;
			activityLogsLoaded = true;
		}
		activityLogsLoading = false;

		// 2. Settle Request History (second)
		await new Promise(r => setTimeout(r, 120));
		if (loadId !== inFlightLoadId) return;

		const reqRes = results[1];
		if (reqRes.status === 'fulfilled') {
			requestHistory = reqRes.value.requests;
			requestHistoryTotal = reqRes.value.total;
			requestHistoryLoaded = true;
			await backfillItemPictures();
		}
		requestHistoryLoading = false;
	}

	// Load Activity Logs
	async function loadActivityLogs(showLoader = true, forceRefresh = false) {
		if (showLoader) {
			if (activityLogs.length === 0) activityLogsLoading = true;
			await loadAllHistoryProgressive(forceRefresh);
		} else {
			try {
				activityLogsRefreshing = true;
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
			} catch (err: any) {
				toastStore.error(err.message || 'Failed to load activity logs');
			} finally {
				activityLogsRefreshing = false;
			}
		}
	}

	// Refresh activity logs
	async function refreshActivityLogs() {
		await loadActivityLogs(true, true);
		toastStore.success('Activity logs refreshed');
	}

	// Change activity logs page
	function goToActivityPage(pageNum: number): void {
		if (pageNum >= 1 && pageNum <= Math.ceil(activityTotal / activityLimit)) {
			activityPage = pageNum;
			loadActivityLogs(true, true);
		}
	}

	// Load Request History
	async function loadRequestHistory(showLoader = true) {
		if (showLoader) {
			if (requestHistory.length === 0) requestHistoryLoading = true;
			await loadAllHistoryProgressive(true);
		} else {
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

	// Activity log detail modal
	let showActivityDetailModal = $state(false);
	let selectedActivityLog = $state<InventoryHistoryEntry | null>(null);

	function openActivityDetailModal(log: InventoryHistoryEntry) {
		selectedActivityLog = log;
		showActivityDetailModal = true;
	}

	function closeActivityDetailModal() {
		showActivityDetailModal = false;
		selectedActivityLog = null;
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

	// Filtered data using derived state
	const filteredActivityLogs = $derived.by(() => {
		let filtered = activityLogs;

		console.log('[FILTER] ===== FILTER DEBUG START =====');
		console.log('[FILTER] Total logs:', filtered.length);
		console.log('[FILTER] Current user email:', currentUserEmail);
		console.log('[FILTER] My Activities filter active:', filterMyActivitiesOnly);
		console.log('[FILTER] Profile store email:', $profileStore.profile?.email);

		// Exclude superadmin activities for instructors
		filtered = filtered.filter(log => log.userRole !== 'superadmin');
		console.log('[FILTER] After excluding superadmin:', filtered.length);

		// Apply "My Activities Only" filter
		if (filterMyActivitiesOnly && currentUserEmail) {
			console.log('[FILTER] Applying My Activities filter...');
			console.log('[FILTER] Sample log userNames:', filtered.slice(0, 3).map(log => log.userName));
			
			filtered = filtered.filter(log => {
				const matches = log.userName === currentUserEmail;
				if (!matches) {
					console.log('[FILTER] Excluding:', log.userName, '(not matching', currentUserEmail, ')');
				} else {
					console.log('[FILTER] ✓ Including:', log.userName);
				}
				return matches;
			});
			console.log('[FILTER] After My Activities filter:', filtered.length);
		}

		// Apply action filter
		if (filterAction) {
			filtered = filtered.filter(log => log.action === filterAction);
			console.log('[FILTER] After action filter:', filtered.length);
		}

		// Apply entity type filter
		if (filterEntityType) {
			filtered = filtered.filter(log => log.entityType === filterEntityType);
			console.log('[FILTER] After entity type filter:', filtered.length);
		}

		// Apply date range filter
		if (filterStartDate) {
			const startDate = new Date(filterStartDate);
			filtered = filtered.filter(log => new Date(log.timestamp) >= startDate);
			console.log('[FILTER] After start date filter:', filtered.length);
		}

		if (filterEndDate) {
			const endDate = new Date(filterEndDate);
			endDate.setHours(23, 59, 59, 999);
			filtered = filtered.filter(log => new Date(log.timestamp) <= endDate);
			console.log('[FILTER] After end date filter:', filtered.length);
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
			console.log('[FILTER] After search filter:', filtered.length);
		}

		console.log('[FILTER] ===== FILTER DEBUG END =====');
		return filtered;
	});

	// Derived pagination values
	const activityTotalPages = $derived(Math.max(1, Math.ceil(activityTotal / activityLimit)));

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
</script>

<svelte:head>
	<title>History - CHTM Cooks</title>
</svelte:head>

{#if activeTabLoading && (activeTab === 'activity-logs' ? activityLogs.length === 0 : requestHistory.length === 0)}
	<!-- Professional Skeleton Loader -->
	<div class="space-y-6 animate-pulse">
		<!-- Header Skeleton -->
		<div>
			<div class="h-8 w-48 bg-gray-200 rounded sm:h-9 sm:w-64"></div>
			<div class="mt-1 h-4 w-64 bg-gray-100 rounded sm:w-96"></div>
		</div>

		<!-- Tabs Skeleton -->
		<div class="border-b border-gray-200">
			<nav class="-mb-px flex" aria-label="Tabs">
				{#each Array(2) as _, i}
					<div class="flex flex-1 items-center justify-center gap-2 border-b-2 {i === 0 ? 'border-pink-500' : 'border-transparent'} px-1 py-3">
						<div class="h-4 w-20 bg-gray-200 rounded sm:w-28"></div>
						<div class="h-5 w-8 bg-gray-200 rounded-full"></div>
					</div>
				{/each}
			</nav>
		</div>

		<!-- Content Skeleton -->
		<div class="rounded-xl bg-white shadow-sm">
			<div class="p-4 sm:p-6">
				<!-- Section Header Skeleton -->
				<div class="mb-4 sm:mb-6">
					<div class="h-6 w-56 bg-gray-200 rounded sm:h-7 sm:w-72"></div>
					<div class="mt-1 h-4 w-72 bg-gray-100 rounded sm:w-96"></div>
				</div>

				<!-- Search Bar and Buttons Skeleton -->
				<div class="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row">
					<div class="flex-1">
						<div class="h-11 w-full bg-gray-100 rounded-lg sm:h-12"></div>
					</div>
					<div class="flex gap-2">
						<div class="h-11 w-32 bg-gray-100 rounded-lg sm:h-12 sm:w-36"></div>
						<div class="h-11 w-20 bg-gray-100 rounded-lg sm:h-12 sm:w-24"></div>
						<div class="h-11 w-20 bg-gray-100 rounded-lg sm:h-12 sm:w-24"></div>
					</div>
				</div>

				<!-- Table Skeleton -->
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b border-gray-200 bg-gray-50">
								<th class="w-16 px-4 py-3 text-left">
									<div class="h-4 w-6 bg-gray-200 rounded"></div>
								</th>
								{#each Array(6) as _}
									<th class="px-6 py-3 text-left">
										<div class="h-4 w-20 bg-gray-200 rounded sm:w-24"></div>
									</th>
								{/each}
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200">
							{#each Array(10) as _, rowIndex}
								<tr class="{rowIndex % 3 === 0 ? 'bg-pink-50/30' : ''}">
									<td class="w-16 px-4 py-4">
										<div class="h-4 w-6 bg-gray-200 rounded"></div>
									</td>
									<td class="px-6 py-4">
										<div class="h-4 w-32 bg-gray-100 rounded"></div>
									</td>
									<td class="px-6 py-4">
										<div class="h-6 w-28 bg-gray-100 rounded-full"></div>
									</td>
									<td class="px-6 py-4">
										<div class="h-4 w-16 bg-gray-100 rounded"></div>
									</td>
									<td class="px-6 py-4">
										<div class="h-4 w-40 bg-gray-100 rounded"></div>
									</td>
									<td class="px-6 py-4">
										<div class="flex items-center gap-2">
											{#if rowIndex % 3 === 0}
												<div class="h-2 w-2 bg-pink-300 rounded-full"></div>
											{/if}
											<div class="h-4 w-36 bg-gray-100 rounded"></div>
										</div>
									</td>
									<td class="px-6 py-4">
										<div class="h-6 w-24 bg-gray-100 rounded-full"></div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Pagination Skeleton -->
				<div class="mt-6 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-6">
					<div class="h-4 w-48 bg-gray-100 rounded"></div>
					<div class="flex items-center gap-1">
						<div class="h-8 w-8 bg-gray-100 rounded-md"></div>
						{#each Array(5) as _}
							<div class="h-8 w-8 bg-gray-100 rounded-md"></div>
						{/each}
						<div class="h-8 w-8 bg-gray-100 rounded-md"></div>
					</div>
				</div>
			</div>
		</div>
	</div>
{:else}
<div class="space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">History</h1>
		<p class="mt-1 text-sm text-gray-500">View activity logs and request history</p>
	</div>

	<!-- Tabs Navigation -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex" aria-label="Tabs">
			<button
				onclick={() => switchTab('activity-logs')}
				class="flex flex-1 items-center justify-center gap-2 border-b-2 px-1 py-3 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm {activeTab === 'activity-logs'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<span class="hidden sm:inline">Activity Logs</span>
				<span class="sm:hidden">Activity</span>
				{#if activityTotal > 0}
					<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {activeTab === 'activity-logs' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'}">
						{activityTotal}
					</span>
				{/if}
			</button>

			<button
				onclick={() => switchTab('request-history')}
				class="flex flex-1 items-center justify-center gap-2 border-b-2 px-1 py-3 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm {activeTab === 'request-history'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<span class="hidden sm:inline">Request History</span>
				<span class="sm:hidden">Requests</span>
				{#if requestHistoryTotal > 0}
					<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {activeTab === 'request-history' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'}">
						{requestHistoryTotal}
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
					<div class="flex items-center justify-between">
						<div>
							<h3 class="text-base font-semibold text-gray-900 sm:text-lg">Activity Logs & Audit Trail</h3>
							<p class="mt-1 text-xs text-gray-500 sm:text-sm">Complete audit trail of all inventory operations</p>
						</div>
						{#if filterMyActivitiesOnly && filteredActivityLogs.length > 0}
							<div class="rounded-full bg-pink-100 px-3 py-1 text-xs font-medium text-pink-700 sm:px-4 sm:py-1.5 sm:text-sm">
								{filteredActivityLogs.length} {filteredActivityLogs.length === 1 ? 'activity' : 'activities'}
							</div>
						{/if}
					</div>
				</div>

				<!-- Search Bar and Filter Button -->
				<div class="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row">
					<div class="relative flex-1">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
							<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
						</div>
						<input
							type="text"
							placeholder="Search by entity name, user..."
							bind:value={activitySearchQuery}
							class="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-500 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0"
						/>
					</div>
					<div class="flex gap-2">
						<button
							onclick={() => filterMyActivitiesOnly = !filterMyActivitiesOnly}
							class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:flex-none sm:gap-2 sm:px-4 sm:text-sm {filterMyActivitiesOnly ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
							aria-pressed={filterMyActivitiesOnly}
						>
							<svg class="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
							</svg>
							<span class="whitespace-nowrap">
								<span class="sm:hidden">Mine</span>
								<span class="hidden sm:inline">My Activities</span>
							</span>
						</button>
						<button
							onclick={() => showActivityFilters = !showActivityFilters}
							class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border bg-white px-3 py-2.5 text-xs font-medium shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:flex-none sm:gap-2 sm:px-4 sm:text-sm {showActivityFilters ? 'border-pink-500 bg-pink-50 text-pink-600' : 'border-gray-300 text-gray-700'}"
							aria-expanded={showActivityFilters}
						>
							<svg class="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
							</svg>
							<span class="whitespace-nowrap">Filters</span>
						</button>
					</div>
				</div>

				<!-- Filters Section -->
				{#if showActivityFilters}
					<div class="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:mb-6 sm:space-y-4">
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

						<div class="flex justify-between">
							<button
								onclick={() => loadActivityLogs(true)}
								class="rounded-lg bg-pink-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:text-sm"
							>
								Apply Filters
							</button>
							<button
								onclick={() => {
									filterAction = '';
									filterEntityType = '';
									filterStartDate = '';
									filterEndDate = '';
									loadActivityLogs(true);
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
							{#if filterMyActivitiesOnly}
								You haven't performed any activities yet. Try editing an item in the catalog to see your activities here.
							{:else if filterAction || filterEntityType || filterStartDate || filterEndDate || activitySearchQuery}
								No logs match your current filters. Try adjusting your search criteria.
							{:else}
								Activity logs will appear here as operations are performed.
							{/if}
						</p>
						{#if filterMyActivitiesOnly}
							<button
								onclick={() => filterMyActivitiesOnly = false}
								class="mt-4 text-sm font-medium text-pink-600 hover:text-pink-700"
							>
								Show all activities
							</button>
						{/if}
					</div>
				{:else}
					<!-- Mobile: tap-to-open row list -->
					<div class="sm:hidden divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
						{#each filteredActivityLogs as log, index}
							{@const isMyActivity = log.userName === currentUserEmail}
							{@const rowNumber = (activityPage - 1) * activityLimit + index + 1}
							<button
								onclick={() => openActivityDetailModal(log)}
								class="w-full text-left flex items-center gap-3 px-3 py-3 transition-colors {isMyActivity ? 'bg-pink-50/40 active:bg-pink-100' : 'bg-white active:bg-gray-100'}"
							>
								<!-- Row number -->
								<span class="shrink-0 w-5 text-right text-xs font-medium text-gray-400">{rowNumber}</span>

								<!-- Two-line content block -->
								<div class="min-w-0 flex-1">
									<!-- Line 1: entity name (full width, no competition) -->
									<p class="truncate text-sm font-semibold text-gray-900 leading-snug">{log.entityName}</p>
									<!-- Line 2: badge + timestamp -->
									<div class="mt-1 flex items-center gap-2">
										<span class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none {getActionColor(log.action)}">
											{log.action.replace(/_/g, ' ')}
										</span>
										{#if isMyActivity}
											<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-pink-500"></span>
										{/if}
										<span class="truncate text-xs text-gray-400">{formatTimestamp(log.timestamp)}</span>
									</div>
								</div>

								<!-- Chevron -->
								<svg class="h-4 w-4 shrink-0 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
								</svg>
							</button>
						{/each}
					</div>

					<!-- Desktop: full table -->
					<div class="hidden sm:block overflow-x-auto rounded-lg border border-gray-200">
						<table class="w-full">
							<thead>
								<tr class="border-b border-gray-200 bg-gray-50">
									<th class="w-12 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">#</th>
									<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Timestamp</th>
									<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Action</th>
									<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
									<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Entity</th>
									<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">User</th>
									<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Role</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each filteredActivityLogs as log, index}
									{@const isMyActivity = log.userName === currentUserEmail}
									{@const rowNumber = (activityPage - 1) * activityLimit + index + 1}
									<tr
										onclick={() => openActivityDetailModal(log)}
										class="cursor-pointer transition-colors {isMyActivity ? 'bg-pink-50/50 hover:bg-pink-100/60' : 'hover:bg-gray-50'}"
									>
										<td class="w-12 px-4 py-3.5 text-sm font-medium text-gray-400">{rowNumber}</td>
										<td class="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{formatTimestamp(log.timestamp)}</td>
										<td class="px-4 py-3.5">
											<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap {getActionColor(log.action)}">
												{log.action.replace('_', ' ').toUpperCase()}
											</span>
										</td>
										<td class="px-4 py-3.5 text-sm text-gray-600 capitalize whitespace-nowrap">{log.entityType}</td>
										<td class="px-4 py-3.5 text-sm font-medium text-gray-900 max-w-[200px] truncate">{log.entityName}</td>
										<td class="px-4 py-3.5">
											<div class="flex items-center gap-1.5">
												{#if isMyActivity}
													<span class="flex h-1.5 w-1.5 shrink-0 rounded-full bg-pink-500" title="Your activity"></span>
												{/if}
												<span class="text-sm text-gray-600 truncate max-w-[180px]">{log.userName || 'N/A'}</span>
											</div>
										</td>
										<td class="px-4 py-3.5">
											<div class="flex items-center justify-between gap-2">
												<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap {getRoleBadge(log.userRole)}">
													{log.userRole?.toUpperCase() || 'N/A'}
												</span>
												<svg class="h-3.5 w-3.5 shrink-0 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
												</svg>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Pagination -->
					{#if activityTotal > activityLimit}
						<Pagination
							currentPage={activityPage}
							totalPages={activityTotalPages}
							totalItems={activityTotal}
							itemsPerPage={activityLimit}
							onPageChange={(p) => goToActivityPage(p)}
							class="mt-4"
						/>
					{/if}
				{/if}
			</div>
			{:else if activeTab === 'request-history'}
			<!-- Request History Tab -->
			<div>
				<div class="mb-4 sm:mb-6">
					<h3 class="text-base font-semibold text-gray-900 sm:text-lg">Student Borrow Request History</h3>
					<p class="mt-1 text-xs text-gray-500 sm:text-sm">Complete history of all student borrow requests you've reviewed</p>
				</div>

				<!-- Search Bar and Filter Button -->
				<div class="mb-4 flex gap-2 sm:mb-6">
					<div class="relative flex-1">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
							<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
						</div>
						<input
							type="text"
							placeholder="Search requests..."
							bind:value={requestHistorySearch}
							class="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-500 shadow-sm transition-colors hover:border-gray-400 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0"
						/>
					</div>
					<button
						onclick={() => showRequestHistoryFilters = !showRequestHistoryFilters}
						class="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2.5 text-xs font-medium shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-0 sm:gap-2 sm:px-4 sm:text-sm {showRequestHistoryFilters ? 'border-pink-500 bg-pink-50 text-pink-600' : 'border-gray-300 text-gray-700'}"
						aria-expanded={showRequestHistoryFilters}
					>
						<svg class="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
						</svg>
						<span class="whitespace-nowrap">Filters</span>
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
									<option value="rejected">Declined</option>
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
								Completed, resolved, cancelled, and declined requests will appear here.
							{/if}
						</p>
					</div>
				{:else}
					<!-- Mobile: tap-to-open row list -->
					<div class="sm:hidden divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
						{#each filteredRequestHistory as request, index}
							{@const rowNumber = (requestHistoryPage - 1) * requestHistoryLimit + index + 1}
							<button
								onclick={() => openRequestDetailModal(request)}
								class="w-full text-left flex items-center gap-3 bg-white px-3 py-3 transition-colors active:bg-gray-100"
							>
								<!-- Row number -->
								<span class="shrink-0 w-5 text-right text-xs font-medium text-gray-400">{rowNumber}</span>

								<!-- Student avatar -->
								{#if request.student}
									<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-1 ring-pink-200">
										{#if request.student.profilePhotoUrl}
											<img src={request.student.profilePhotoUrl} alt={request.student.fullName || 'Student'} class="h-full w-full object-cover" loading="lazy" />
										{:else}
											{(request.student.fullName || request.student.firstName || 'ST').split(' ').filter(Boolean).slice(0, 2).map((p: string) => p[0]?.toUpperCase() || '').join('')}
										{/if}
									</div>
								{/if}

								<!-- Two-line content block -->
								<div class="min-w-0 flex-1">
									<!-- Line 1: student name (full width) -->
									<p class="truncate text-sm font-semibold text-gray-900 leading-snug">
										{request.student?.fullName || `${request.student?.firstName || ''} ${request.student?.lastName || ''}`.trim() || 'N/A'}
									</p>
									<!-- Line 2: status badge + date -->
									<div class="mt-1 flex items-center gap-2">
										<span class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none {getRequestStatusColor(request.status)}">
											{request.status.replace('_', ' ')}
										</span>
										<span class="truncate text-xs text-gray-400">{formatTimestamp(request.createdAt)}</span>
									</div>
								</div>

								<!-- Chevron -->
								<svg class="h-4 w-4 shrink-0 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
								</svg>
							</button>
						{/each}
					</div>

					<!-- Desktop: full table -->
					<div class="hidden sm:block overflow-x-auto rounded-lg border border-gray-200">
						<table class="w-full">
							<thead>
								<tr class="border-b border-gray-200 bg-gray-50">
									<th class="w-12 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">#</th>
									<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Request ID</th>
									<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Student</th>
									<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Items</th>
									<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
									<th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Date</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each filteredRequestHistory as request, index}
									{@const rowNumber = (requestHistoryPage - 1) * requestHistoryLimit + index + 1}
									<tr
										onclick={() => openRequestDetailModal(request)}
										class="cursor-pointer transition-colors hover:bg-gray-50"
									>
										<td class="w-12 px-4 py-3.5 text-sm font-medium text-gray-400">{rowNumber}</td>
										<td class="px-4 py-3.5 text-sm font-mono font-semibold text-pink-600 whitespace-nowrap">{formatRequestId(request.id)}</td>
										<td class="px-4 py-3.5">
											{#if request.student}
												<div class="flex items-center gap-3">
													<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-2 ring-pink-200">
														{#if request.student.profilePhotoUrl}
															<img src={request.student.profilePhotoUrl} alt={request.student.fullName || 'Student'} class="h-full w-full object-cover" loading="lazy" />
														{:else}
															{(request.student.fullName || request.student.firstName || 'ST').split(' ').filter(Boolean).slice(0, 2).map((part: string) => part[0]?.toUpperCase() || '').join('')}
														{/if}
													</div>
													<div class="min-w-0">
														<div class="truncate text-sm font-medium text-gray-900 max-w-[160px]">
															{request.student.fullName || `${request.student.firstName || ''} ${request.student.lastName || ''}`.trim() || 'N/A'}
														</div>
														<div class="truncate text-xs text-gray-500 max-w-[160px]">{request.student.email || 'N/A'}</div>
													</div>
												</div>
											{:else}
												<span class="text-sm text-gray-400">N/A</span>
											{/if}
										</td>
										<td class="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
											{#if request.items.length === 1}
												{request.items[0].name}
											{:else}
												{request.items.length} items
											{/if}
										</td>
										<td class="px-4 py-3.5">
											<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap {getRequestStatusColor(request.status)}">
												{request.status.replace('_', ' ').toUpperCase()}
											</span>
										</td>
										<td class="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{formatTimestamp(request.createdAt)}</td>
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
			{/if}
		</div>
	</div>
</div>
{/if}

<!-- Activity Log Detail Modal (bottom sheet on mobile, centered dialog on desktop) -->
{#if showActivityDetailModal && selectedActivityLog}
	{@const log = selectedActivityLog}
	{@const isMyActivity = log.userName === currentUserEmail}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<!-- Backdrop -->
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
			aria-hidden="true"
			onclick={closeActivityDetailModal}
		></div>
		<!-- Bottom sheet on mobile, centered dialog on desktop -->
		<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
			<div class="animate-scaleIn relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">

				<!-- Handle (mobile only) -->
				<div class="flex justify-center pt-3 sm:hidden">
					<div class="h-1 w-10 rounded-full bg-gray-300"></div>
				</div>

				<!-- Header -->
				<div class="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur-sm sm:px-6">
					<div class="flex items-start justify-between gap-3">
						<div class="flex min-w-0 flex-1 items-center gap-3">
							<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30">
								<svg class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
								</svg>
							</div>
							<div class="min-w-0">
								<h2 class="truncate text-base font-bold text-gray-900 sm:text-lg">{log.entityName}</h2>
								<p class="text-xs text-gray-500 capitalize">{log.entityType}</p>
							</div>
						</div>
						<button
							onclick={closeActivityDetailModal}
							aria-label="Close"
							class="rounded-xl p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95"
						>
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					</div>
				</div>

				<!-- Content -->
				<div class="max-h-[65vh] overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
					<div class="space-y-4">

						<!-- Action & Role -->
						<div class="flex flex-wrap gap-2">
							<span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold {getActionColor(log.action)}">
								{log.action.replace(/_/g, ' ').toUpperCase()}
							</span>
							<span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold {getRoleBadge(log.userRole)}">
								{log.userRole?.toUpperCase() || 'N/A'}
							</span>
							{#if isMyActivity}
								<span class="inline-flex items-center gap-1.5 rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-700">
									<span class="h-1.5 w-1.5 rounded-full bg-pink-500"></span>
									My Activity
								</span>
							{/if}
						</div>

						<!-- Detail fields -->
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<!-- Timestamp -->
							<div class="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
								<p class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Timestamp</p>
								<p class="mt-1 text-sm font-semibold text-gray-900">{formatTimestamp(log.timestamp)}</p>
							</div>

							<!-- Entity -->
							<div class="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
								<p class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Entity</p>
								<p class="mt-1 text-sm font-semibold text-gray-900">{log.entityName}</p>
								<p class="mt-0.5 text-xs capitalize text-gray-500">{log.entityType}</p>
							</div>

							<!-- Performed by -->
							<div class="rounded-xl border border-gray-200 bg-gray-50 p-3.5 sm:col-span-2">
								<p class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Performed By</p>
								<p class="mt-1 break-all text-sm font-semibold text-gray-900">{log.userName || 'N/A'}</p>
								<p class="mt-0.5 text-xs capitalize text-gray-500">{log.userRole || 'N/A'}</p>
							</div>

							<!-- Changes -->
							{#if log.changes && log.changes.length > 0}
								<div class="rounded-xl border border-gray-200 bg-gray-50 p-3.5 sm:col-span-2">
									<p class="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
										Changes ({log.changes.length})
									</p>
									<div class="space-y-2">
										{#each log.changes as change}
											<div class="rounded-lg border border-gray-100 bg-white px-3 py-2.5">
												<p class="text-xs font-semibold capitalize text-gray-700">{change.field.replace(/_/g, ' ')}</p>
												<div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
													<span class="rounded-md bg-red-50 px-2 py-1 font-mono text-red-600 line-through">{change.oldValue ?? '—'}</span>
													<svg class="h-3 w-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
													</svg>
													<span class="rounded-md bg-green-50 px-2 py-1 font-mono text-green-700">{change.newValue ?? '—'}</span>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{:else}
								<div class="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-3.5 sm:col-span-2">
									<p class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Changes</p>
									<p class="mt-1 text-sm text-gray-400">No field-level changes recorded for this action.</p>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Footer -->
				<div class="sticky bottom-0 border-t border-gray-100 bg-white/95 px-5 py-4 backdrop-blur-sm sm:px-6">
					<button
						onclick={closeActivityDetailModal}
						class="w-full rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-bold text-gray-700 transition-all hover:bg-gray-200 active:scale-[0.98]"
					>
						Close
					</button>
				</div>
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
							<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
								<!-- Desktop Table Header -->
								<div class="hidden sm:grid grid-cols-12 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
									<span class="col-span-8">Item</span>
									<span class="col-span-2 text-center">Code</span>
									<span class="col-span-2 text-center">Qty</span>
								</div>
								
								<!-- Table Rows -->
								<div class="divide-y divide-gray-100">
									{#each selectedHistoryRequest.items as item}
										{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
										{@const code = item.code ?? (item.itemId ? item.itemId.slice(-6).toUpperCase() : 'N/A')}
										<div class="grid items-center gap-3 bg-white p-3 sm:grid-cols-12 sm:p-4 transition-colors hover:bg-gray-50/50">
											<!-- Item Info -->
											<div class="col-span-12 flex items-center gap-3 sm:col-span-8 min-w-0">
												{#if pic}
													<img
														src={pic}
														alt={item.name}
														class="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-gray-200"
														loading="lazy"
													/>
												{:else}
													<div class="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-gray-200">
														<ItemImagePlaceholder size="sm" />
													</div>
												{/if}
												<div class="flex flex-col gap-1 min-w-0">
													<span class="truncate text-sm font-semibold text-gray-900">{item.name}</span>
												</div>
											</div>
											
											<!-- Mobile/Desktop Details -->
											<div class="col-span-6 flex items-center justify-between sm:col-span-2 sm:justify-center border-t border-gray-100 pt-3 sm:border-0 sm:pt-0">
												<span class="text-[10px] font-semibold text-gray-500 uppercase sm:hidden">Code</span>
												<span class="font-mono text-sm font-medium text-gray-600">{code}</span>
											</div>
											<div class="col-span-6 flex items-center justify-between sm:col-span-2 sm:justify-center border-t border-gray-100 pt-3 sm:border-0 sm:pt-0 border-l border-gray-100 pl-3 sm:border-0 sm:pl-0">
												<span class="text-[10px] font-semibold text-gray-500 uppercase sm:hidden">Qty</span>
												<span class="text-sm font-bold text-gray-900 tabular-nums">{item.quantity}</span>
											</div>
										</div>
									{/each}
								</div>
							</div>
						</div>

						<!-- Replacement Obligations Table -->
						{#if selectedHistoryRequest.items.some((item: any) => item.inspection && (item.inspection.replacementQuantity || 0) > 0)}
							<div class="mt-8 animate-fadeIn">
								<h3 class="mb-4 flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase">
									<div class="h-1 w-1 rounded-full bg-amber-500"></div>
									Replacement Obligations
								</h3>
								<div class="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
									<!-- Desktop Table Header -->
									<div class="hidden sm:grid grid-cols-12 border-b border-amber-100 bg-amber-50/50 px-4 py-2.5 text-[11px] font-semibold tracking-wide text-amber-900 uppercase">
										<span class="col-span-6">Item to Replace</span>
										<span class="col-span-3 text-center">Qty Required</span>
										<span class="col-span-3 text-right">Due Date</span>
									</div>
									
									<!-- Table Rows -->
									<div class="divide-y divide-amber-100/50">
										{#each selectedHistoryRequest.items.filter((item: any) => item.inspection && (item.inspection.replacementQuantity || 0) > 0) as item}
											{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
											{@const code = item.code ?? (item.itemId ? item.itemId.slice(-6).toUpperCase() : 'N/A')}
											<div class="grid items-center gap-3 bg-white p-3 sm:grid-cols-12 sm:p-4 hover:bg-amber-50/30 transition-colors">
												<div class="col-span-12 flex items-center gap-3 sm:col-span-6 min-w-0">
													{#if pic}
														<img src={pic} alt={item.name} class="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-amber-200/50" loading="lazy" />
													{:else}
														<div class="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-amber-200/50 text-amber-500/50">
															<ItemImagePlaceholder size="sm" />
														</div>
													{/if}
													<div class="flex flex-col gap-1 min-w-0">
														<span class="truncate text-sm font-semibold text-gray-900">{item.name}</span>
														<span class="text-[10px] font-semibold text-amber-600/80 uppercase">{code}</span>
														{#if item.inspection?.notes?.replace(/^\[Unit breakdown:[^\]]+\]\s*/i, '')}
															<span class="text-[11px] leading-relaxed text-amber-855 bg-amber-50/50 border border-amber-250/30 rounded-lg px-2.5 py-1 mt-1 font-medium w-fit max-w-full shadow-xs">
																<span class="font-bold text-amber-955">Note:</span> {item.inspection.notes.replace(/^\[Unit breakdown:[^\]]+\]\s*/i, '')}
															</span>
														{/if}
													</div>
												</div>
												<div class="col-span-6 flex items-center justify-between sm:col-span-3 sm:justify-center border-t border-amber-100/50 pt-3 sm:border-0 sm:pt-0">
													<span class="text-[10px] font-semibold text-amber-800 uppercase sm:hidden">Qty Required</span>
													<span class="text-sm font-bold text-amber-700 tabular-nums">{item.inspection.replacementQuantity}</span>
												</div>
												<div class="col-span-6 flex items-center justify-between sm:col-span-3 sm:justify-end border-t border-amber-100/50 pt-3 sm:border-0 sm:pt-0 border-l border-amber-100/50 pl-3 sm:border-0 sm:pl-0">
													<span class="text-[10px] font-semibold text-amber-800 uppercase sm:hidden">Due Date</span>
													<span class="text-xs font-semibold text-gray-700">
														{item.inspection.dueDate ? new Date(item.inspection.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}
													</span>
												</div>
											</div>
										{/each}
									</div>
								</div>
							</div>
						{/if}
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

