<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { 
		Package, TrendingUp, AlertCircle, Info, Search, Download, 
		RefreshCw, CheckCircle, Wifi, WifiOff, XCircle, AlertTriangle, 
		BarChart3, Activity, Clock
	} from 'lucide-svelte';
	import { inventoryItemsAPI, type InventoryItem, subscribeToInventoryChanges } from '$lib/api/inventory';
	import { fetchAnalytics, peekCachedAnalytics, subscribeToAnalyticsChanges, type AnalyticsReport } from '$lib/api/analyticsReports';
	import { replacementObligationsAPI, type ReplacementObligation } from '$lib/api/replacementObligations';
	import { toastStore } from '$lib/stores/toast';
	import InventorySkeletonLoader from '$lib/components/ui/InventorySkeletonLoader.svelte';

	let activeTab = $state<'stock' | 'usage' | 'obligations'>('stock');
	let sseConnected = $state(false);
	let loading = $state(true);

	// Data
	let allItems = $state<InventoryItem[]>([]);
	let analytics = $state<AnalyticsReport | null>(browser ? peekCachedAnalytics({ period: 'month' }) : null);
	let obligations = $state<ReplacementObligation[]>([]);
	let searchQuery = $state('');

	let _pollInterval: ReturnType<typeof setInterval> | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;

	function hydrateFromCache(): boolean {
		const cachedItems = inventoryItemsAPI.peekCachedList({ limit: 1000 });
		if (!cachedItems) return false;

		allItems = cachedItems.items;
		loading = false;
		return true;
	}

	function scheduleRefresh(forceRefresh = false): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			void loadAllData(false, forceRefresh);
		}, 250);
	}

	// Pagination
	let currentPage = $state(1);
	const itemsPerPage = 20;

	// Filtered and paginated items
	const filteredAllItems = $derived(
		allItems.filter(i => !searchQuery || 
			i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
			i.category.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);
	
	const totalPages = $derived(Math.max(1, Math.ceil(filteredAllItems.length / itemsPerPage)));
	const items = $derived(filteredAllItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage));

	// Stats
	let lowStockCount = $derived(allItems.filter(i => (i.quantity - (i.currentCount || 0)) < 5).length);

	let unsubscribeAnalytics: (() => void) | null = null;
	let unsubscribeInventory: (() => void) | null = null;

	onMount(() => {
		hydrateFromCache();
		void loadAllData(allItems.length === 0, false);
		
		unsubscribeAnalytics = subscribeToAnalyticsChanges(() => {
			sseConnected = true;
			scheduleRefresh(true);
		});

		unsubscribeInventory = subscribeToInventoryChanges((event) => {
			sseConnected = true;
			scheduleRefresh(true);
			const msgs: Record<string, string> = {
				item_created: 'A new item was added',
				item_updated: 'An item was updated',
				item_deleted: 'An item was removed'
			};
			toastStore.info(msgs[event.action] || 'Inventory updated', 'Live Sync');
		});

		setTimeout(() => sseConnected = true, 1500);

		// --- 30-second polling fallback ---
		_pollInterval = setInterval(() => {
			void loadAllData(false, true);
		}, 30_000);

		// --- Refresh on tab/window focus ---
		const onFocus = () => { void loadAllData(false, true); };
		const onVisible = () => { if (document.visibilityState === 'visible') void loadAllData(false, true); };
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			unsubscribeAnalytics?.();
			unsubscribeInventory?.();
			if (_pollInterval !== null) clearInterval(_pollInterval);
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	async function loadAllData(showLoader = true, forceRefresh = true) {
		if (showLoader && allItems.length === 0) loading = true;
		try {
			const [itemsRes, analyticsRes, obsRes] = await Promise.all([
				inventoryItemsAPI.getAll({ limit: 1000, forceRefresh }),
				fetchAnalytics({ period: 'month', forceRefresh }),
				replacementObligationsAPI.getObligations({ limit: 100 }, { forceRefresh })
			]);
			allItems = itemsRes.items;
			analytics = analyticsRes;
			obligations = obsRes.obligations;
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to load inventory data');
		} finally {
			loading = false;
		}
	}

	/**
	 * Handle page navigation
	 */
	function goToPage(pageNum: number): void {
		if (pageNum >= 1 && pageNum <= totalPages) {
			currentPage = pageNum;
			// Scroll to top of table
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	/**
	 * Handle search input (debounced)
	 */
	let searchTimeout: ReturnType<typeof setTimeout>;
	function handleSearch(query: string): void {
		searchQuery = query;
		currentPage = 1; // Reset to first page on search
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			// Search is client-side, no need to refetch
		}, 300);
	}

	function formatDate(d: string | Date | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function exportData() {
		toastStore.info('Preparing export...', 'Export');
		const headers = ['ID', 'Name', 'Category', 'Total Stock', 'Current Variance', 'Status'];
		const rows = allItems.map(i => [
			i.id.slice(-6).toUpperCase(),
			`"${i.name}"`,
			`"${i.category}"`,
			i.currentCount ?? i.quantity,
			i.variance,
			i.status
		]);
		const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `inventory-export-${new Date().toISOString().split('T')[0]}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}


</script>

<svelte:head>
	<title>Inventory Overview | CHTM Cooks Superadmin</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Inventory Overview</h1>
			<p class="mt-0.5 text-sm text-gray-500">Comprehensive view of equipment inventory, usage, and replacement needs</p>
		</div>

	</div>

	{#if loading && allItems.length === 0}
		<InventorySkeletonLoader view="all-items" />
	{:else}
		<!-- High Level Stats -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-gray-500">Total Unique Items</p>
				<Package size={18} class="text-gray-400" />
			</div>
			<p class="mt-2 text-3xl font-bold text-gray-900">{allItems.length}</p>
			<p class="mt-1 text-xs text-gray-500">Across {new Set(allItems.map(i => i.category)).size} categories</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-gray-500">Total Physical Stock</p>
				<BarChart3 size={18} class="text-gray-400" />
			</div>
			<p class="mt-2 text-3xl font-bold text-emerald-600">{allItems.reduce((acc, curr) => acc + (curr.currentCount ?? curr.quantity), 0).toLocaleString()}</p>
			<p class="mt-1 text-xs text-gray-500">Total tracked units</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-gray-500">Low Stock Alerts</p>
				<AlertTriangle size={18} class="text-amber-500" />
			</div>
			<p class="mt-2 text-3xl font-bold {lowStockCount > 0 ? 'text-amber-600' : 'text-gray-900'}">{lowStockCount}</p>
			<p class="mt-1 text-xs text-gray-500">Items nearing depletion</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-gray-500">Pending Obligations</p>
				<RefreshCw size={18} class="text-pink-500" />
			</div>
			<p class="mt-2 text-3xl font-bold text-pink-600">{obligations.filter(o => o.status === 'pending').length}</p>
			<p class="mt-1 text-xs text-gray-500">Awaiting replacement</p>
		</div>
	</div>

	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6 overflow-x-auto">
			{#each [
				{ id: 'stock', label: 'Stock Levels', icon: Package },
				{ id: 'usage', label: 'Usage Statistics', icon: Activity },
				{ id: 'obligations', label: 'Replacement Obligations', icon: AlertCircle }
			] as tab}
				<button 
					onclick={() => activeTab = tab.id as any} 
					class="flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === tab.id ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
				>
					<tab.icon size={16} />
					{tab.label}
				</button>
			{/each}
		</nav>
	</div>

	<!-- Tab Content -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
			{#if activeTab === 'stock'}
				<div class="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
					<div class="relative flex-1 w-full">
						<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
						<input 
							type="text" 
							value={searchQuery}
							oninput={(e) => handleSearch((e.target as HTMLInputElement).value)}
							placeholder="Search inventory by name or category..." 
							class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" 
						/>
					</div>
					<button onclick={exportData} class="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50">
						<Download size={18} />
						Export CSV
					</button>
				</div>

				<!-- Results Info -->
				{#if !loading}
					<div class="px-6 py-3 border-b border-gray-100 bg-gray-50/30">
						<p class="text-sm text-gray-700">
							Showing <span class="font-semibold">{(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredAllItems.length)}</span> of <span class="font-semibold">{filteredAllItems.length}</span> {filteredAllItems.length === 1 ? 'item' : 'items'}
							{#if searchQuery}
								<button onclick={() => { searchQuery = ''; currentPage = 1; }} class="ml-2 text-pink-600 hover:text-pink-700 font-medium">
									Clear search
								</button>
							{/if}
						</p>
					</div>
				{/if}

				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Details</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
								<th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Stock</th>
								<th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Variance</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each items as item}
								<tr class="hover:bg-gray-50 transition-colors">
									<td class="whitespace-nowrap px-6 py-4">
										<div class="flex items-center gap-3">
											<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 border border-gray-200">
												{#if item.picture}
													<img src={item.picture} alt={item.name} class="h-10 w-10 rounded-lg object-cover" />
												{:else}
													<Package size={20} class="text-gray-400" />
												{/if}
											</div>
											<div>
												<p class="font-medium text-gray-900">{item.name}</p>
												<p class="text-xs text-gray-500">ID: {item.id.slice(-6).toUpperCase()}</p>
											</div>
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{item.category}</td>
									<td class="whitespace-nowrap px-6 py-4 text-center">
										<span class="inline-flex items-center justify-center rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700 ring-1 ring-blue-200 ring-inset">
											{item.currentCount ?? item.quantity}
										</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-center">
										{#if item.variance < 0}
											<span class="inline-flex items-center justify-center rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700 ring-1 ring-red-200 ring-inset">
												{item.variance}
											</span>
										{:else if item.variance > 0}
											<span class="inline-flex items-center justify-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200 ring-inset">
												+{item.variance}
											</span>
										{:else}
											<span class="inline-flex items-center justify-center rounded-full bg-gray-50 px-3 py-1 text-sm font-medium text-gray-600 ring-1 ring-gray-200 ring-inset">
												0
											</span>
										{/if}
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										{#if item.status === 'active'}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
												<CheckCircle size={12} /> Active
											</span>
										{:else}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-800">
												<Clock size={12} /> {item.status}
											</span>
										{/if}
									</td>
								</tr>
							{:else}
								<tr>
									<td colspan="5" class="px-6 py-12 text-center">
										<Package class="mx-auto h-10 w-10 text-gray-400 mb-3" />
										<p class="text-sm font-medium text-gray-900">No items found</p>
										<p class="text-sm text-gray-500 mt-1">
											{#if searchQuery}
												No items match "{searchQuery}"
											{:else}
												No inventory items available
											{/if}
										</p>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Pagination -->
				{#if !loading && filteredAllItems.length > itemsPerPage}
					<div class="flex items-center justify-between border-t border-gray-200 bg-gray-50/50 px-4 py-3 sm:px-6">
						<div class="hidden sm:block text-sm text-gray-500">
							Page {currentPage} of {totalPages}
						</div>
						<nav class="flex items-center gap-1 mx-auto sm:mx-0" aria-label="Pagination">
							<button
								onclick={() => goToPage(currentPage - 1)}
								disabled={currentPage === 1}
								class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-sm text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
								aria-label="Previous page"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
								</svg>
							</button>

							{#each Array.from({ length: totalPages }, (_, i) => i + 1) as page}
								{#if totalPages <= 7 || page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1}
									<button
										onclick={() => goToPage(page)}
										class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors {currentPage === page ? 'bg-pink-600 text-white shadow-sm' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
										aria-label="Page {page}"
										aria-current={currentPage === page ? 'page' : undefined}
									>
										{page}
									</button>
								{:else if (page === currentPage - 2 || page === currentPage + 2) && totalPages > 7}
									<span class="inline-flex h-9 w-9 items-center justify-center text-sm text-gray-400">…</span>
								{/if}
							{/each}

							<button
								onclick={() => goToPage(currentPage + 1)}
								disabled={currentPage === totalPages}
								class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-sm text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
								aria-label="Next page"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
								</svg>
							</button>
						</nav>
						<div class="hidden sm:block text-sm text-gray-500">
							{filteredAllItems.length} total items
						</div>
					</div>
				{/if}
			{/if}

			{#if activeTab === 'usage' && analytics}
				<div class="p-6">
					<div class="mb-6 flex items-center justify-between">
						<h3 class="text-lg font-bold text-gray-900">Most Borrowed Items</h3>
						<span class="text-sm text-gray-500">Past 30 Days</span>
					</div>
					<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{#each analytics.inventory.mostBorrowedItems.slice(0, 6) as item, i}
							<div class="relative flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 transition hover:bg-gray-100 hover:shadow-sm">
								<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-700 font-bold text-lg">
									#{i + 1}
								</div>
								<div>
									<h4 class="font-bold text-gray-900">{item.name}</h4>
									<p class="text-xs text-gray-500 mb-1">{item.category}</p>
									<span class="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 border border-gray-200 shadow-sm">
										<TrendingUp size={12} class="text-emerald-500" /> {item.totalBorrows} borrows
									</span>
								</div>
							</div>
						{:else}
							<p class="text-sm text-gray-500 col-span-full py-8 text-center border-2 border-dashed border-gray-200 rounded-xl">No usage statistics available for this period.</p>
						{/each}
					</div>

					<div class="mt-8 grid gap-6 lg:grid-cols-2">
						<!-- Utilization by Category -->
						<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
							<h3 class="mb-4 font-bold text-gray-900">Request Turnaround Averages</h3>
							<div class="space-y-4">
								<div class="flex items-center justify-between">
									<span class="text-sm text-gray-600">Approval Time</span>
									<span class="font-bold text-gray-900">{analytics.borrowRequests.turnaround.avgApprovalHours.toFixed(1)} hrs</span>
								</div>
								<div class="w-full bg-gray-200 rounded-full h-2">
									<div class="bg-blue-500 h-2 rounded-full" style="width: {Math.min(100, (analytics.borrowRequests.turnaround.avgApprovalHours / 24) * 100)}%"></div>
								</div>

								<div class="flex items-center justify-between mt-4">
									<span class="text-sm text-gray-600">Release Time</span>
									<span class="font-bold text-gray-900">{analytics.borrowRequests.turnaround.avgReleaseHours.toFixed(1)} hrs</span>
								</div>
								<div class="w-full bg-gray-200 rounded-full h-2">
									<div class="bg-emerald-500 h-2 rounded-full" style="width: {Math.min(100, (analytics.borrowRequests.turnaround.avgReleaseHours / 24) * 100)}%"></div>
								</div>
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col justify-center">
							<div class="text-center">
								<h3 class="font-bold text-gray-900 mb-2">Overall Inventory Status</h3>
								<div class="inline-flex items-center justify-center w-32 h-32 rounded-full border-8 border-pink-100 mb-4">
									<div class="text-center">
										<p class="text-2xl font-bold text-pink-600">{analytics.borrowRequests.statusBreakdown.find(s => s.status === 'borrowed')?.count || 0}</p>
										<p class="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Active<br>Loans</p>
									</div>
								</div>
								<div class="grid grid-cols-2 gap-4 mt-2">
									<div class="bg-gray-50 p-3 rounded-lg border border-gray-100">
										<p class="text-xl font-bold text-gray-900">{analytics.borrowRequests.statusBreakdown.find(s => s.status === 'pending_instructor')?.count || 0}</p>
										<p class="text-xs text-gray-500">Pending</p>
									</div>
									<div class="bg-gray-50 p-3 rounded-lg border border-gray-100">
										<p class="text-xl font-bold text-gray-900">{analytics.borrowRequests.overdueCount || 0}</p>
										<p class="text-xs text-red-500">Overdue</p>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/if}

			{#if activeTab === 'obligations'}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
								<th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each obligations as ob}
								<tr class="hover:bg-gray-50 transition-colors">
									<td class="whitespace-nowrap px-6 py-4">
										<p class="font-medium text-gray-900">{ob.itemName}</p>
										<p class="text-xs text-gray-500">Req: REQ-{ob.borrowRequestId.slice(-6).toUpperCase()}</p>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<p class="font-medium text-gray-900">{ob.studentName || 'Unknown Student'}</p>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<span class="inline-flex items-center gap-1.5 rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-800 capitalize">
											{ob.type}
										</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-center">
										<span class="font-bold text-gray-900">{ob.amount}</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
										{formatDate(ob.incidentDate)}
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										{#if ob.status === 'pending'}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-pink-100 px-2.5 py-1 text-xs font-medium text-pink-800">
												<Clock size={12} /> Pending
											</span>
										{:else}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
												<CheckCircle size={12} /> Resolved
											</span>
										{/if}
									</td>
								</tr>
							{:else}
								<tr>
									<td colspan="6" class="px-6 py-12 text-center">
										<div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 mb-4">
											<CheckCircle class="h-6 w-6 text-gray-400" />
										</div>
										<h3 class="text-sm font-medium text-gray-900">No Replacement Obligations</h3>
										<p class="mt-1 text-sm text-gray-500">All equipment replacements have been resolved.</p>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
	</div>
	{/if}
</div>
