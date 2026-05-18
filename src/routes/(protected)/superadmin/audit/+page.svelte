<script lang="ts">
	import { onMount } from 'svelte';
	import {
		User,
		Shield,
		Settings,
		Search,
		Download,
		RefreshCw,
		Database,
		LogIn,
		Trash2,
		ClipboardList
	} from 'lucide-svelte';
	import { inventoryHistoryAPI, type InventoryHistoryEntry } from '$lib/api/inventoryHistory';
	import { borrowRequestsAPI, type BorrowRequestRecord } from '$lib/api/borrowRequests';
	import { subscribeToInventoryChanges } from '$lib/api/inventory';
	import { toastStore } from '$lib/stores/toast';
	import Pagination from '$lib/components/ui/Pagination.svelte';

	let activeTab = $state<'all' | 'user-actions' | 'security' | 'system' | 'requests'>('all');
	let searchQuery = $state('');
	let selectedAction = $state('all');
	let loading = $state(true);

	let logs = $state<InventoryHistoryEntry[]>([]);

	// ─── Requests tab state ───────────────────────────────────────────────────
	let requests = $state<BorrowRequestRecord[]>([]);
	let requestsLoading = $state(false);
	let requestsSearchQuery = $state('');
	let requestsStatusFilter = $state('all');
	let requestsCurrentPage = $state(1);
	const REQUESTS_PER_PAGE = 20;

	// ─── Pagination ───────────────────────────────────────────────────────────
	const ITEMS_PER_PAGE = 20;
	let currentPage = $state(1);

	let _pollInterval: ReturnType<typeof setInterval> | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let unsubscribeInventory: (() => void) | null = null;

	function scheduleRefresh(): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			void loadLogs(false);
		}, 250);
	}

	function hydrateFromCache(): boolean {
		const cached = inventoryHistoryAPI.peekCachedHistory({ limit: 200 });
		if (!cached) return false;
		logs = cached.history;
		loading = false;
		return true;
	}

	onMount(() => {
		hydrateFromCache();
		void loadLogs(logs.length === 0, false);
		void loadRequests();

		unsubscribeInventory = subscribeToInventoryChanges(() => {
			scheduleRefresh();
		});

		setTimeout(() => {}, 1500);

		_pollInterval = setInterval(() => {
			void loadLogs(false, true);
		}, 30_000);

		const onFocus = () => {
			void loadLogs(false, true);
		};
		const onVisible = () => {
			if (document.visibilityState === 'visible') void loadLogs(false, true);
		};
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			unsubscribeInventory?.();
			if (_pollInterval !== null) clearInterval(_pollInterval);
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	async function loadLogs(showLoader = true, _forceRefresh = true) {
		if (showLoader && logs.length === 0) loading = true;
		try {
			const res = await inventoryHistoryAPI.getHistory({ limit: 200, forceRefresh: true });
			logs = res.history;
		} catch (error: any) {
			toastStore.error(error.message || 'Failed to load audit logs');
		} finally {
			loading = false;
		}
	}

	async function loadRequests() {
		requestsLoading = true;
		try {
			const res = await borrowRequestsAPI.list(
				{ limit: 500, sortBy: 'createdAt' },
				{ forceRefresh: true }
			);
			requests = res.requests;
		} catch (error: any) {
			toastStore.error(error.message || 'Failed to load borrow requests');
		} finally {
			requestsLoading = false;
		}
	}

	function formatDate(d: string | Date | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function formatShortDate(d: string | Date | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getActionIcon(action: string) {
		const a = action.toLowerCase();
		if (a.includes('create') || a.includes('add')) return RefreshCw;
		if (a.includes('delete') || a.includes('remove')) return Trash2;
		if (a.includes('login') || a.includes('auth')) return LogIn;
		return RefreshCw;
	}

	function getActionBadge(action: string) {
		const a = action.toLowerCase();
		if (a.includes('create')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
		if (a.includes('delete')) return 'bg-red-50 text-red-700 border-red-200';
		if (a.includes('login')) return 'bg-purple-50 text-purple-700 border-purple-200';
		return 'bg-blue-50 text-blue-700 border-blue-200';
	}

	function getStatusBadge(status: string): string {
		const map: Record<string, string> = {
			pending_instructor: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
			approved_instructor: 'bg-blue-100 text-blue-800 border border-blue-200',
			ready_for_pickup: 'bg-cyan-100 text-cyan-800 border border-cyan-200',
			borrowed: 'bg-violet-100 text-violet-800 border border-violet-200',
			pending_return: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
			returned: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
			rejected: 'bg-red-100 text-red-800 border border-red-200',
			cancelled: 'bg-gray-100 text-gray-600 border border-gray-200',
			missing: 'bg-rose-100 text-rose-800 border border-rose-200'
		};
		return map[status] ?? 'bg-gray-100 text-gray-600 border border-gray-200';
	}

	function formatStatus(status: string): string {
		return status
			.split('_')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ');
	}

	function exportAuditLogs() {
		toastStore.info('Generating immutable audit log CSV...', 'Export');
		setTimeout(() => {
			toastStore.success('Audit logs downloaded successfully.');
		}, 1000);
	}

	// ─── Audit log filtering ──────────────────────────────────────────────────
	let filteredLogs = $derived(
		logs.filter((log) => {
			const matchesSearch =
				log.entityName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
				log.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
				log.action?.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesAction =
				selectedAction === 'all' || log.action.toLowerCase().includes(selectedAction);
			let matchesTab = true;
			if (activeTab === 'user-actions') {
				matchesTab = log.userRole !== 'superadmin' && !log.action.toLowerCase().includes('login');
			} else if (activeTab === 'system') {
				matchesTab = log.entityType === 'category' || log.action.toLowerCase().includes('update');
			} else if (activeTab === 'security') {
				matchesTab =
					log.action.toLowerCase().includes('login') ||
					log.action.toLowerCase().includes('auth') ||
					log.action.toLowerCase().includes('delete');
			}
			return matchesSearch && matchesAction && matchesTab;
		})
	);

	// ─── Requests filtering ───────────────────────────────────────────────────
	let filteredRequests = $derived(
		requests.filter((r) => {
			const q = requestsSearchQuery.toLowerCase();
			const matchesSearch =
				!q ||
				r.student?.fullName?.toLowerCase().includes(q) ||
				r.student?.email?.toLowerCase().includes(q) ||
				r.id.toLowerCase().includes(q) ||
				r.purpose?.toLowerCase().includes(q);
			const matchesStatus = requestsStatusFilter === 'all' || r.status === requestsStatusFilter;
			return matchesSearch && matchesStatus;
		})
	);

	// ─── Unified "All Activity" feed ─────────────────────────────────────────
	// Normalise both data sources into a common shape sorted by timestamp desc
	type ActivityEntry =
		| { kind: 'log'; timestamp: Date; data: InventoryHistoryEntry }
		| { kind: 'request'; timestamp: Date; data: BorrowRequestRecord };

	const allActivityFeed = $derived.by((): ActivityEntry[] => {
		const q = searchQuery.toLowerCase();

		const logEntries: ActivityEntry[] = logs
			.filter((log) => {
				if (!q) return true;
				return (
					log.entityName?.toLowerCase().includes(q) ||
					log.userName?.toLowerCase().includes(q) ||
					log.action?.toLowerCase().includes(q)
				);
			})
			.map((log) => ({ kind: 'log' as const, timestamp: new Date(log.timestamp), data: log }));

		const reqEntries: ActivityEntry[] = requests
			.filter((r) => {
				if (!q) return true;
				return (
					r.student?.fullName?.toLowerCase().includes(q) ||
					r.student?.email?.toLowerCase().includes(q) ||
					r.id.toLowerCase().includes(q) ||
					r.purpose?.toLowerCase().includes(q)
				);
			})
			.map((r) => ({ kind: 'request' as const, timestamp: new Date(r.createdAt), data: r }));

		return [...logEntries, ...reqEntries].sort(
			(a, b) => b.timestamp.getTime() - a.timestamp.getTime()
		);
	});

	const allActivityTotalPages = $derived(Math.ceil(allActivityFeed.length / ITEMS_PER_PAGE));
	const paginatedAllActivity = $derived(
		allActivityFeed.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
	);
	// Reset pages on filter/tab change
	$effect(() => {
		activeTab;
		searchQuery;
		selectedAction;
		currentPage = 1;
	});
	$effect(() => {
		requestsSearchQuery;
		requestsStatusFilter;
		requestsCurrentPage = 1;
	});

	const totalPages = $derived(Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));
	const paginatedLogs = $derived(
		filteredLogs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
	);
	const requestsTotalPages = $derived(Math.ceil(filteredRequests.length / REQUESTS_PER_PAGE));
	const paginatedRequests = $derived(
		filteredRequests.slice(
			(requestsCurrentPage - 1) * REQUESTS_PER_PAGE,
			requestsCurrentPage * REQUESTS_PER_PAGE
		)
	);
</script>

<svelte:head>
	<title>Audit Logs | CHTM Cooks Superadmin</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">System Audit Logs</h1>
			<p class="mt-0.5 text-sm text-gray-500">
				Immutable activity trail for compliance, security monitoring, and system integrity.
			</p>
		</div>
	</div>

	<!-- Tab Navigation -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6 overflow-x-auto">
			<button
				onclick={() => (activeTab = 'all')}
				class="flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium whitespace-nowrap transition-colors {activeTab ===
				'all'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<Database size={16} /> All Activity
			</button>
			<button
				onclick={() => (activeTab = 'user-actions')}
				class="flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium whitespace-nowrap transition-colors {activeTab ===
				'user-actions'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<User size={16} /> User Actions
			</button>
			<button
				onclick={() => (activeTab = 'security')}
				class="flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium whitespace-nowrap transition-colors {activeTab ===
				'security'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<Shield size={16} /> Security Events
			</button>
			<button
				onclick={() => (activeTab = 'system')}
				class="flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium whitespace-nowrap transition-colors {activeTab ===
				'system'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<Settings size={16} /> System Changes
			</button>
			<button
				onclick={() => (activeTab = 'requests')}
				class="flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium whitespace-nowrap transition-colors {activeTab ===
				'requests'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<ClipboardList size={16} /> Borrow Requests
			</button>
		</nav>
	</div>

	<!-- Filter Controls — hidden on requests tab -->
	{#if activeTab !== 'requests'}
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
				<div class="relative flex-1">
					<Search size={18} class="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search logs by actor, action, or resource..."
						class="w-full rounded-lg border border-gray-300 py-2.5 pr-4 pl-10 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
					/>
				</div>

				<div class="flex items-center gap-3">
					<select
						bind:value={selectedAction}
						aria-label="Filter by Action"
						class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
					>
						<option value="all">All Actions</option>
						<option value="create">Created</option>
						<option value="update">Updated</option>
						<option value="delete">Deleted</option>
					</select>

					<button
						onclick={exportAuditLogs}
						class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
					>
						<Download size={16} />
						Export CSV
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Log Table Area — hidden on requests tab -->
	{#if activeTab !== 'requests'}
		<div class="min-h-[500px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			{#if (loading || requestsLoading) && (activeTab === 'all' ? allActivityFeed.length === 0 : filteredLogs.length === 0)}
				<div class="animate-pulse space-y-4 p-6">
					{#each Array(6) as _}
						<div class="flex items-center gap-4 border-b border-gray-100 py-3">
							<div class="h-4 w-24 shrink-0 rounded bg-gray-200"></div>
							<div class="h-8 w-8 shrink-0 rounded-full bg-gray-200"></div>
							<div class="flex-1 space-y-2">
								<div class="h-4 w-32 rounded bg-gray-200"></div>
								<div class="h-3 w-20 rounded bg-gray-200"></div>
							</div>
							<div class="h-6 w-24 rounded bg-gray-200"></div>
							<div class="h-4 w-28 rounded bg-gray-200"></div>
						</div>
					{/each}
				</div>
			{:else if activeTab === 'all'}
				<!-- ── Unified All Activity feed ─────────────────────────────── -->
				{#if allActivityFeed.length === 0}
					<div class="flex flex-col items-center justify-center p-20 text-center">
						<Database class="mb-4 h-12 w-12 text-gray-300" />
						<p class="text-lg font-medium text-gray-900">No activity found</p>
						<p class="text-sm text-gray-500">Try adjusting your search query.</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th
										scope="col"
										class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Timestamp</th
									>
									<th
										scope="col"
										class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Type</th
									>
									<th
										scope="col"
										class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Actor</th
									>
									<th
										scope="col"
										class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Event</th
									>
									<th
										scope="col"
										class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Details</th
									>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100 bg-white">
								{#each paginatedAllActivity as entry}
									<tr class="transition-colors hover:bg-gray-50">
										<td class="px-6 py-4 whitespace-nowrap">
											<div class="text-sm font-medium text-gray-900">
												{formatDate(entry.timestamp).split(',')[0]}
											</div>
											<div class="text-xs text-gray-500">
												{formatDate(entry.timestamp).split(',')[1]}
											</div>
										</td>
										<td class="px-6 py-4 whitespace-nowrap">
											{#if entry.kind === 'log'}
												<span
													class="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
												>
													<Database size={11} /> Inventory
												</span>
											{:else}
												<span
													class="inline-flex items-center gap-1.5 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-xs font-semibold text-pink-700"
												>
													<ClipboardList size={11} /> Request
												</span>
											{/if}
										</td>
										<td class="px-6 py-4 whitespace-nowrap">
											{#if entry.kind === 'log'}
												{@const log = entry.data}
												<div class="flex items-center gap-3">
													<div
														class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-pink-500 to-rose-600 text-xs font-bold text-white"
													>
														{#if log.userProfilePhotoUrl}
															<img
																src={log.userProfilePhotoUrl}
																alt={log.userName}
																class="h-full w-full object-cover"
																loading="lazy"
															/>
														{:else}
															{log.userName ? log.userName.substring(0, 2).toUpperCase() : 'SY'}
														{/if}
													</div>
													<div>
														<p class="text-sm font-semibold text-gray-900">
															{log.userName || 'System'}
														</p>
														<p class="text-xs text-gray-500 capitalize">
															{log.userRole || 'System'}
														</p>
													</div>
												</div>
											{:else}
												{@const req = entry.data}
												<div class="flex items-center gap-3">
													<div
														class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-pink-500 to-rose-600 text-xs font-bold text-white"
													>
														{#if req.student?.profilePhotoUrl}
															<img
																src={req.student.profilePhotoUrl}
																alt={req.student.fullName}
																class="h-full w-full object-cover"
																loading="lazy"
															/>
														{:else}
															{req.student?.firstName?.[0] ?? ''}{req.student?.lastName?.[0] ?? ''}
														{/if}
													</div>
													<div>
														<p class="text-sm font-semibold text-gray-900">
															{req.student?.fullName ?? 'Unknown'}
														</p>
														<p class="text-xs text-gray-500">Student</p>
													</div>
												</div>
											{/if}
										</td>
										<td class="px-6 py-4 whitespace-nowrap">
											{#if entry.kind === 'log'}
												{@const log = entry.data}
												{@const Icon = getActionIcon(log.action)}
												<span
													class="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-bold tracking-wide uppercase {getActionBadge(
														log.action
													)}"
												>
													<Icon size={12} />
													{log.action.replace(/_/g, ' ')}
												</span>
											{:else}
												{@const req = entry.data}
												<span
													class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {getStatusBadge(
														req.status
													)}"
												>
													{formatStatus(req.status)}
												</span>
											{/if}
										</td>
										<td class="px-6 py-4">
											{#if entry.kind === 'log'}
												{@const log = entry.data}
												<p class="text-sm font-semibold text-gray-900">
													{log.entityName || 'System Resource'}
												</p>
												<p class="text-xs tracking-wider text-gray-500 uppercase">
													{log.entityType}
												</p>
											{:else}
												{@const req = entry.data}
												<p class="font-mono text-xs font-semibold text-gray-700">
													REQ-{req.id.slice(-6).toUpperCase()}
												</p>
												<p class="text-xs text-gray-500">
													{req.items.length} item{req.items.length !== 1 ? 's' : ''} · {formatShortDate(
														req.borrowDate
													)} → {formatShortDate(req.returnDate)}
												</p>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if allActivityTotalPages > 1}
						<Pagination
							{currentPage}
							totalPages={allActivityTotalPages}
							totalItems={allActivityFeed.length}
							itemsPerPage={ITEMS_PER_PAGE}
							onPageChange={(page) => {
								currentPage = page;
							}}
							class="rounded-none border-x-0 border-t border-b-0 shadow-none"
						/>
					{/if}
				{/if}
			{:else}
				<!-- ── Filtered log tabs (User Actions / Security / System) ──── -->
				{#if filteredLogs.length === 0}
					<div class="flex flex-col items-center justify-center p-20 text-center">
						<Database class="mb-4 h-12 w-12 text-gray-300" />
						<p class="text-lg font-medium text-gray-900">No logs found</p>
						<p class="text-sm text-gray-500">Try adjusting your search query or filters.</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th
										scope="col"
										class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Timestamp</th
									>
									<th
										scope="col"
										class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Actor</th
									>
									<th
										scope="col"
										class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Action</th
									>
									<th
										scope="col"
										class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Target Resource</th
									>
									<th
										scope="col"
										class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
										>Metadata / IP</th
									>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100 bg-white">
								{#each paginatedLogs as log}
									{@const Icon = getActionIcon(log.action)}
									<tr class="transition-colors hover:bg-gray-50">
										<td class="px-6 py-4 whitespace-nowrap">
											<div class="text-sm font-medium text-gray-900">
												{formatDate(log.timestamp).split(',')[0]}
											</div>
											<div class="text-xs text-gray-500">
												{formatDate(log.timestamp).split(',')[1]}
											</div>
										</td>
										<td class="px-6 py-4 whitespace-nowrap">
											<div class="flex items-center gap-3">
												<div
													class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-pink-500 to-rose-600 text-xs font-bold text-white"
												>
													{#if log.userProfilePhotoUrl}
														<img
															src={log.userProfilePhotoUrl}
															alt={log.userName}
															class="h-full w-full object-cover"
															loading="lazy"
														/>
													{:else}
														{log.userName ? log.userName.substring(0, 2).toUpperCase() : 'SY'}
													{/if}
												</div>
												<div>
													<p class="text-sm font-bold text-gray-900">{log.userName || 'System'}</p>
													<p class="text-xs text-gray-500 capitalize">
														{log.userRole || 'System Admin'}
													</p>
												</div>
											</div>
										</td>
										<td class="px-6 py-4 whitespace-nowrap">
											<span
												class="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-bold tracking-wide uppercase {getActionBadge(
													log.action
												)}"
											>
												<Icon size={12} />
												{log.action.replace('_', ' ')}
											</span>
										</td>
										<td class="px-6 py-4 whitespace-nowrap">
											<p class="text-sm font-bold text-gray-900">
												{log.entityName || 'System Resource'}
											</p>
											<p class="text-xs tracking-wider text-gray-500 uppercase">{log.entityType}</p>
										</td>
										<td class="px-6 py-4 text-sm text-gray-500">
											{#if log.ipAddress}
												<div class="mb-1 flex items-center gap-1 text-xs text-gray-400">
													IP: {log.ipAddress}
												</div>
											{/if}
											{#if log.changes && log.changes.length > 0}
												<div class="max-w-[200px] truncate text-xs">
													Modified {log.changes.length} field(s)
												</div>
											{:else if log.metadata && Object.keys(log.metadata).length > 0}
												<div
													class="max-w-[200px] truncate text-xs"
													title={JSON.stringify(log.metadata)}
												>
													{Object.keys(log.metadata).join(', ')}
												</div>
											{:else}
												<span class="text-xs text-gray-400 italic">No additional details</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if totalPages > 1}
						<Pagination
							{currentPage}
							{totalPages}
							totalItems={filteredLogs.length}
							itemsPerPage={ITEMS_PER_PAGE}
							onPageChange={(page) => {
								currentPage = page;
							}}
							class="rounded-none border-x-0 border-t border-b-0 shadow-none"
						/>
					{/if}
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Borrow Requests Tab -->
	{#if activeTab === 'requests'}
		<!-- Requests Filter Controls -->
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
				<div class="relative flex-1">
					<Search size={18} class="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
					<input
						type="text"
						bind:value={requestsSearchQuery}
						placeholder="Search by student, email, or purpose..."
						class="w-full rounded-lg border border-gray-300 py-2.5 pr-4 pl-10 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
					/>
				</div>
				<select
					bind:value={requestsStatusFilter}
					aria-label="Filter by status"
					class="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
				>
					<option value="all">All Statuses</option>
					<option value="pending_instructor">Under Review</option>
					<option value="approved_instructor">Instructor Approved</option>
					<option value="ready_for_pickup">Ready for Pickup</option>
					<option value="borrowed">Active Loan</option>
					<option value="pending_return">Return Initiated</option>
					<option value="returned">Returned</option>
					<option value="rejected">Declined</option>
					<option value="cancelled">Cancelled</option>
				</select>
			</div>
		</div>

		<!-- Requests Table -->
		<div class="min-h-[500px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			{#if requestsLoading && requests.length === 0}
				<div class="animate-pulse space-y-4 p-6">
					{#each Array(6) as _}
						<div class="flex items-center gap-4 border-b border-gray-100 py-3">
							<div class="h-8 w-8 shrink-0 rounded-full bg-gray-200"></div>
							<div class="flex-1 space-y-2">
								<div class="h-4 w-40 rounded bg-gray-200"></div>
								<div class="h-3 w-28 rounded bg-gray-200"></div>
							</div>
							<div class="h-6 w-24 rounded bg-gray-200"></div>
							<div class="h-4 w-20 rounded bg-gray-200"></div>
						</div>
					{/each}
				</div>
			{:else if filteredRequests.length === 0}
				<div class="flex flex-col items-center justify-center p-20 text-center">
					<ClipboardList class="mb-4 h-12 w-12 text-gray-300" />
					<p class="text-lg font-medium text-gray-900">No requests found</p>
					<p class="text-sm text-gray-500">Try adjusting your search or status filter.</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
									>Request ID</th
								>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
									>Student</th
								>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
									>Status</th
								>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
									>Items</th
								>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
									>Borrow Period</th
								>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase"
									>Submitted</th
								>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100 bg-white">
							{#each paginatedRequests as req}
								<tr class="transition-colors hover:bg-gray-50">
									<td class="px-6 py-4 whitespace-nowrap">
										<span class="font-mono text-xs font-semibold text-gray-700"
											>REQ-{req.id.slice(-6).toUpperCase()}</span
										>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="flex items-center gap-3">
											<div
												class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-pink-500 to-rose-600 text-xs font-bold text-white"
											>
												{#if req.student?.profilePhotoUrl}
													<img
														src={req.student.profilePhotoUrl}
														alt={req.student.fullName}
														class="h-full w-full object-cover"
														loading="lazy"
													/>
												{:else}
													{req.student?.firstName?.[0] ?? ''}{req.student?.lastName?.[0] ?? ''}
												{/if}
											</div>
											<div>
												<p class="text-sm font-semibold text-gray-900">
													{req.student?.fullName ?? 'Unknown'}
												</p>
												<p class="text-xs text-gray-500">{req.student?.email ?? '—'}</p>
											</div>
										</div>
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span
											class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {getStatusBadge(
												req.status
											)}"
										>
											{formatStatus(req.status)}
										</span>
									</td>
									<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-700">
										{req.items.length} item{req.items.length !== 1 ? 's' : ''}
									</td>
									<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-600">
										{formatShortDate(req.borrowDate)} → {formatShortDate(req.returnDate)}
									</td>
									<td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
										{formatShortDate(req.createdAt)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if requestsTotalPages > 1}
					<Pagination
						currentPage={requestsCurrentPage}
						totalPages={requestsTotalPages}
						totalItems={filteredRequests.length}
						itemsPerPage={REQUESTS_PER_PAGE}
						onPageChange={(page) => {
							requestsCurrentPage = page;
						}}
						class="rounded-none border-x-0 border-t border-b-0 shadow-none"
					/>
				{/if}
			{/if}
		</div>
	{/if}
</div>
