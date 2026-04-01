<script lang="ts">
	import { onMount } from 'svelte';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import { loadingStore } from '$lib/stores/loading';
	import { inventoryHistoryAPI, archivedItemsAPI, deletedItemsAPI } from '$lib/api/inventoryHistory';
	import type { InventoryHistoryEntry, DeletedItem } from '$lib/api/inventoryHistory';

	type Tab = 'activity-logs' | 'archived' | 'deleted';
	
	let activeTab = $state<Tab>('activity-logs');
	let loading = $state(false);
	
	// Activity Logs state
	let activityLogs = $state<InventoryHistoryEntry[]>([]);
	let activityTotal = $state(0);
	let activityPage = $state(1);
	let activityLimit = $state(50);
	
	// Archived Items state
	let archivedItems = $state<any[]>([]);
	let archivedTotal = $state(0);
	let archivedPage = $state(1);
	let archivedLimit = $state(50);
	let archivedSearch = $state('');
	
	// Recently Deleted state
	let deletedItems = $state<DeletedItem[]>([]);
	let deletedTotal = $state(0);
	let deletedPage = $state(1);
	let deletedLimit = $state(50);
	let deletedSearch = $state('');

	// Filters for activity logs
	let filterAction = $state('');
	let filterEntityType = $state('');
	let filterStartDate = $state('');
	let filterEndDate = $state('');

	// Load data on mount
	onMount(async () => {
		await loadActivityLogs();
	});

	// Switch tabs
	function switchTab(tab: Tab) {
		activeTab = tab;
		if (tab === 'activity-logs' && activityLogs.length === 0) {
			loadActivityLogs();
		} else if (tab === 'archived' && archivedItems.length === 0) {
			loadArchivedItems();
		} else if (tab === 'deleted' && deletedItems.length === 0) {
			loadDeletedItems();
		}
	}

	// Load Activity Logs
	async function loadActivityLogs() {
		try {
			loading = true;
			loadingStore.start();
			const response = await inventoryHistoryAPI.getHistory({
				action: filterAction || undefined,
				entityType: filterEntityType as any || undefined,
				startDate: filterStartDate || undefined,
				endDate: filterEndDate || undefined,
				page: activityPage,
				limit: activityLimit
			});
			activityLogs = response.history;
			activityTotal = response.total;
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to load activity logs');
		} finally {
			loading = false;
			loadingStore.stop();
		}
	}

	// Load Archived Items
	async function loadArchivedItems() {
		try {
			loading = true;
			loadingStore.start();
			const response = await archivedItemsAPI.getArchived({
				search: archivedSearch || undefined,
				page: archivedPage,
				limit: archivedLimit
			});
			archivedItems = response.items;
			archivedTotal = response.total;
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to load archived items');
		} finally {
			loading = false;
			loadingStore.stop();
		}
	}

	// Load Recently Deleted Items
	async function loadDeletedItems() {
		try {
			loading = true;
			loadingStore.start();
			const response = await deletedItemsAPI.getDeleted({
				search: deletedSearch || undefined,
				page: deletedPage,
				limit: deletedLimit
			});
			deletedItems = response.items;
			deletedTotal = response.total;
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to load deleted items');
		} finally {
			loading = false;
			loadingStore.stop();
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
			loading = true;
			await archivedItemsAPI.restore(item.id);
			toastStore.success(`"${item.name}" has been restored to active inventory`);
			await loadArchivedItems();
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to restore item');
		} finally {
			loading = false;
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
			loading = true;
			await deletedItemsAPI.restore(item.id, item.type);
			toastStore.success(`"${itemName}" has been restored successfully`);
			await loadDeletedItems();
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to restore item');
		} finally {
			loading = false;
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
			loading = true;
			await deletedItemsAPI.permanentlyDelete(item.id, item.type);
			toastStore.success(`"${itemName}" has been permanently deleted`);
			await loadDeletedItems();
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to permanently delete item');
		} finally {
			loading = false;
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

<div class="space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Inventory History</h1>
		<p class="mt-1 text-sm text-gray-500">View activity logs, archived items, and recently deleted records</p>
	</div>

	<!-- Loading Spinner -->
	{#if loading}
		<div class="flex items-center justify-center py-8">
			<div class="h-12 w-12 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600"></div>
		</div>
	{/if}

	<!-- Tabs Navigation -->
	<div class="border-b border-gray-200 bg-white shadow-sm">
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
	<div class="rounded-lg bg-white shadow">
		{#if activeTab === 'activity-logs'}
			<!-- Activity Logs Tab -->
			<div class="p-6">
				<div class="mb-6">
					<h3 class="text-lg font-semibold text-gray-900">Activity Logs & Audit Trail</h3>
					<p class="mt-1 text-sm text-gray-500">Complete audit trail of all inventory operations</p>
				</div>

				<!-- Filters -->
				<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
					<div>
						<label for="action-filter" class="block text-sm font-medium text-gray-700">Action</label>
						<select
							id="action-filter"
							bind:value={filterAction}
							onchange={() => loadActivityLogs()}
							class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
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
						<label for="entity-filter" class="block text-sm font-medium text-gray-700">Type</label>
						<select
							id="entity-filter"
							bind:value={filterEntityType}
							onchange={() => loadActivityLogs()}
							class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
						>
							<option value="">All Types</option>
							<option value="item">Items</option>
							<option value="category">Categories</option>
						</select>
					</div>

					<div>
						<label for="start-date" class="block text-sm font-medium text-gray-700">Start Date</label>
						<input
							type="date"
							id="start-date"
							bind:value={filterStartDate}
							onchange={() => loadActivityLogs()}
							class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
						/>
					</div>

					<div>
						<label for="end-date" class="block text-sm font-medium text-gray-700">End Date</label>
						<input
							type="date"
							id="end-date"
							bind:value={filterEndDate}
							onchange={() => loadActivityLogs()}
							class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
						/>
					</div>
				</div>

				<!-- Activity Logs Table -->
				{#if activityLogs.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
						<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
													disabled={loading}
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
						<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
													disabled={loading}
													class="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
												>
													<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 15L3 9m0 0l6-6m-6 6h12a6 6 0 010 12h-3"/>
													</svg>
													Restore
												</button>
												<button
													onclick={() => permanentlyDelete(item)}
													disabled={loading}
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
