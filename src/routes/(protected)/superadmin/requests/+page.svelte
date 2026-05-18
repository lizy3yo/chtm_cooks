<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { 
		Search, 
		Download, 
		Info, 
		Eye, 
		CheckCircle, 
		XCircle,
		X,
		Clock, 
		AlertTriangle, 
		Wifi, 
		WifiOff,
		MoreVertical,
		RefreshCw,
		Package,
		PackageOpen,
		ClipboardList,
		Calendar,
		CalendarDays,
		BookOpen,
		UserCircle,
		FileText,
		User,
		Bell
	} from 'lucide-svelte';
	import { 
		borrowRequestsAPI, 
		type BorrowRequestRecord, 
		type BorrowRequestRealtimeEvent 
	} from '$lib/api/borrowRequests';
	import { replacementObligationsAPI, type ReplacementObligation } from '$lib/api/replacementObligations';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import QRCode from 'qrcode';
	import RequestsSkeletonLoader from '$lib/components/ui/RequestsSkeletonLoader.svelte';

	let activeTab = $state<'all' | 'pending' | 'active' | 'overdue' | 'history' | 'obligations'>('all');
	let searchQuery = $state('');
	let selectedStatus = $state('all');
	let sseConnected = $state(false);

	let requests = $state<BorrowRequestRecord[]>([]);
	let pagination = $state({ page: 1, limit: 20, total: 0, totalPages: 1 });
	let loading = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout>;

	// ─── Replacement Obligations ──────────────────────────────────────────────
	let obligations = $state<ReplacementObligation[]>([]);
	let obligationsLoading = $state(false);

	async function loadObligations(forceRefresh = true) {
		obligationsLoading = true;
		try {
			const res = await replacementObligationsAPI.getObligations({ limit: 200 }, { forceRefresh });
			obligations = res.obligations;
		} catch {
			/* silent — non-critical */
		} finally {
			obligationsLoading = false;
		}
	}

	const pendingObligations = $derived(obligations.filter(o => o.status === 'pending'));
	const resolvedObligations = $derived(obligations.filter(o => o.status !== 'pending'));

	let stats = $state({
		totalRequests: 0,
		pending: 0,
		active: 0,
		overdue: 0,
		completed: 0
	});

	let showDetailModal = $state(false);
	let selectedRequest = $state<BorrowRequestRecord | null>(null);
	let qrDataUrl = $state<string | null>(null);

	let unsubscribeSSE: (() => void) | null = null;
	let openDropdown = $state<string | null>(null);
	let processingId = $state<string | null>(null);
	let _pollInterval: ReturnType<typeof setInterval> | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;

	function getListParams() {
		const statusesMap: Record<string, string[]> = {
			'all': [],
			'pending': ['pending_instructor'],
			'active': ['approved_instructor', 'ready_for_pickup', 'borrowed', 'pending_return', 'missing'],
			'overdue': ['borrowed'],
			'history': ['returned', 'resolved', 'cancelled', 'rejected']
		};
		let statuses = statusesMap[activeTab] || [];
		if (selectedStatus !== 'all') {
			statuses = [selectedStatus];
		}
		return {
			statuses: statuses.length > 0 ? statuses as any : undefined,
			search: searchQuery || undefined,
			page: pagination.page,
			limit: pagination.limit,
			sortBy: 'createdAt' as const
		};
	}

	function hydrateFromCache(): boolean {
		const cached = borrowRequestsAPI.peekCachedList(getListParams());
		if (!cached) return false;

		let list = cached.requests;
		if (activeTab === 'overdue') {
			const now = new Date();
			list = list.filter(r => r.status === 'borrowed' && new Date(r.returnDate) < now);
		}

		requests = list;
		pagination = {
			page: cached.page,
			limit: cached.limit,
			total: cached.total,
			totalPages: cached.pages
		};
		loading = false;
		return true;
	}

	function scheduleRefresh(forceRefresh = false): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			void loadRequests(false, forceRefresh);
			void loadStats(forceRefresh);
			void loadObligations(forceRefresh);
		}, 250);
	}

	onMount(() => {
		hydrateFromCache();
		void loadRequests(requests.length === 0, false);
		void loadStats(false);
		void loadObligations(false);
		
		unsubscribeSSE = borrowRequestsAPI.subscribeToChanges((event) => {
			sseConnected = true;
			scheduleRefresh(true);
			const msgs: Record<string, string> = {
				created: 'New borrow request submitted',
				approved: 'Request approved',
				rejected: 'Request declined',
				released: 'Equipment released',
				picked_up: 'Equipment picked up',
				return_initiated: 'Return initiated',
				returned: 'Equipment returned',
				missing: 'Items marked missing',
				cancelled: 'Request cancelled',
				reminder_sent: 'Overdue reminder sent'
			};
			if (msgs[event.action]) {
				toastStore.info(msgs[event.action], 'Request Update');
			}
			
			if (selectedRequest && event.requestId === selectedRequest.id) {
				const freshReq = requests.find(r => r.id === selectedRequest!.id);
				if (freshReq) selectedRequest = freshReq;
			}
		});

		setTimeout(() => {
			sseConnected = true;
		}, 1500);
		// --- 30-second polling fallback ---
		_pollInterval = setInterval(() => {
			void loadRequests(false, true);
			void loadStats(true);
			void loadObligations(true);
		}, 30_000);

		// --- Refresh on tab/window focus ---
		const onFocus = () => { void loadRequests(false, true); void loadStats(true); };
		const onVisible = () => { if (document.visibilityState === 'visible') { void loadRequests(false, true); void loadStats(true); } };
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			unsubscribeSSE?.();
			if (_pollInterval !== null) clearInterval(_pollInterval);
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	async function loadRequests(showLoader = true, forceRefresh = true) {
		if (showLoader && requests.length === 0) loading = true;
		try {
			const res = await borrowRequestsAPI.list(getListParams(), { forceRefresh });

			let list = res.requests;
			if (activeTab === 'overdue') {
				const now = new Date();
				list = list.filter(r => r.status === 'borrowed' && new Date(r.returnDate) < now);
			}

			requests = list;
			pagination = {
				page: res.page,
				limit: res.limit,
				total: res.total,
				totalPages: res.pages
			};
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to load requests');
		} finally {
			loading = false;
		}
	}

	async function loadStats(forceRefresh = true) {
		try {
			const res = await borrowRequestsAPI.list({ limit: 1000 }, { forceRefresh });
			const all = res.requests;
			const now = new Date();

			stats = {
				totalRequests: all.length,
				pending: all.filter(r => r.status === 'pending_instructor').length,
				active: all.filter(r => ['approved_instructor', 'ready_for_pickup', 'borrowed', 'pending_return', 'missing'].includes(r.status)).length,
				overdue: all.filter(r => r.status === 'borrowed' && new Date(r.returnDate) < now).length,
				completed: all.filter(r => ['returned', 'resolved'].includes(r.status)).length
			};
		} catch {
			/* silent */
		}
	}

	function onSearchInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			pagination.page = 1;
			loadRequests();
		}, 300);
	}

	function onFilterChange() {
		pagination.page = 1;
		loadRequests();
	}

	function handleTabChange(tab: typeof activeTab) {
		activeTab = tab;
		selectedStatus = 'all';
		pagination.page = 1;
		loadRequests();
	}

	function openDetail(request: BorrowRequestRecord) {
		selectedRequest = request;
		showDetailModal = true;
		qrDataUrl = null;
		QRCode.toDataURL(request.id, {
			width: 200,
			margin: 2,
			color: { dark: '#111827', light: '#ffffff' }
		}).then(url => { qrDataUrl = url; }).catch(() => {});
	}

	function getStatusBadgeColor(status: string): string {
		const colors: Record<string, string> = {
			pending_instructor: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
			approved_instructor: 'bg-blue-100 text-blue-800 border border-blue-200',
			ready_for_pickup: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
			borrowed: 'bg-purple-100 text-purple-800 border border-purple-200',
			pending_return: 'bg-orange-100 text-orange-800 border border-orange-200',
			missing: 'bg-rose-100 text-rose-800 border border-rose-200',
			returned: 'bg-teal-100 text-teal-800 border border-teal-200',
			resolved: 'bg-teal-100 text-teal-800 border border-teal-200',
			rejected: 'bg-red-100 text-red-800 border border-red-200',
			cancelled: 'bg-gray-100 text-gray-800 border border-gray-200'
		};
		return colors[status] || 'bg-gray-100 text-gray-800 border border-gray-200';
	}

	function getStatusLabel(status: string): string {
		const labels: Record<string, string> = {
			pending_instructor: 'Under Review',
			approved_instructor: 'Instructor Approved',
			ready_for_pickup: 'Ready for Pickup',
			borrowed: 'Active Loan',
			pending_return: 'Return Initiated',
			missing: 'Item Missing',
			returned: 'Returned',
			resolved: 'Resolved',
			rejected: 'Declined',
			cancelled: 'Cancelled'
		};
		return labels[status] || status;
	}

	function isOverdue(r: BorrowRequestRecord) {
		return r.status === 'borrowed' && new Date(r.returnDate) < new Date();
	}

	function formatDate(d: string | Date | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	async function handleAction(action: string, request: BorrowRequestRecord) {
		openDropdown = null;
		processingId = request.id;
		try {
			if (action === 'approve') {
				const confirmed = await confirmStore.confirm({
					title: 'Emergency Approve',
					message: 'Force approve this request? This skips normal instructor approval.',
					confirmText: 'Approve'
				});
				if (!confirmed) return;
				await borrowRequestsAPI.approve(request.id);
				toastStore.success('Request approved');
			} else if (action === 'reject') {
				const confirmed = await confirmStore.danger('Decline this request?', 'Decline Request', 'Decline');
				if (!confirmed) return;
				await borrowRequestsAPI.reject(request.id, 'Superadmin Override');
				toastStore.success('Request declined');
			} else if (action === 'cancel') {
				const confirmed = await confirmStore.danger('Cancel this request?', 'Cancel Request', 'Cancel');
				if (!confirmed) return;
				await borrowRequestsAPI.cancel(request.id);
				toastStore.success('Request cancelled');
			} else if (action === 'remind') {
				await borrowRequestsAPI.sendOverdueReminder(request.id);
				toastStore.success('Reminder sent to student');
			}
			await loadRequests(false);
			await loadStats();
		} catch (e: any) {
			toastStore.error(e.message || 'Action failed');
		} finally {
			processingId = null;
		}
	}

	function exportData() {
		const headers = ['Request ID', 'Student', 'Instructor', 'Status', 'Request Date', 'Borrow Date', 'Return Date', 'Purpose', 'Items'];
		const rows = requests.map(r => [
			r.id.slice(-6).toUpperCase(),
			r.student?.fullName || '—',
			r.instructor?.fullName || '—',
			getStatusLabel(r.status),
			formatDate(r.createdAt),
			formatDate(r.borrowDate),
			formatDate(r.returnDate),
			`"${r.purpose.replace(/"/g, '""')}"`,
			`"${r.items.map(i => `${i.quantity}x ${i.name}`).join('; ')}"`
		]);
		
		const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `request-export-${new Date().toISOString().split('T')[0]}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>Request Management | CHTM Cooks Superadmin</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Request Management</h1>
			<p class="mt-0.5 text-sm text-gray-500">System-wide oversight of all equipment borrow requests</p>
		</div>

	</div>

	{#if loading && requests.length === 0}
		<RequestsSkeletonLoader viewMode="list" />
	{:else}
		<!-- Stats -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
		<div class="rounded-lg bg-white p-3 shadow transition-shadow hover:shadow-md sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Total Requests</p>
					<p class="mt-1 text-2xl font-semibold text-gray-900 sm:mt-2 sm:text-3xl">{stats.totalRequests.toLocaleString()}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 sm:h-12 sm:w-12">
					<ClipboardList size={18} class="text-gray-500 sm:hidden" aria-hidden="true" />
					<ClipboardList size={24} class="hidden text-gray-500 sm:block" aria-hidden="true" />
				</div>
			</div>
		</div>
		<div class="rounded-lg bg-white p-3 shadow transition-shadow hover:shadow-md sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Pending</p>
					<p class="mt-1 text-2xl font-semibold text-yellow-600 sm:mt-2 sm:text-3xl">{stats.pending}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-100 sm:h-12 sm:w-12">
					<Clock size={18} class="text-yellow-600 sm:hidden" aria-hidden="true" />
					<Clock size={24} class="hidden text-yellow-600 sm:block" aria-hidden="true" />
				</div>
			</div>
		</div>
		<div class="rounded-lg bg-white p-3 shadow transition-shadow hover:shadow-md sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Active Loans</p>
					<p class="mt-1 text-2xl font-semibold text-purple-600 sm:mt-2 sm:text-3xl">{stats.active}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 sm:h-12 sm:w-12">
					<PackageOpen size={18} class="text-purple-600 sm:hidden" aria-hidden="true" />
					<PackageOpen size={24} class="hidden text-purple-600 sm:block" aria-hidden="true" />
				</div>
			</div>
		</div>
		<div class="rounded-lg bg-white p-3 shadow transition-shadow hover:shadow-md sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Overdue</p>
					<p class="mt-1 text-2xl font-semibold text-red-600 sm:mt-2 sm:text-3xl">{stats.overdue}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 sm:h-12 sm:w-12">
					<AlertTriangle size={18} class="text-red-600 sm:hidden" aria-hidden="true" />
					<AlertTriangle size={24} class="hidden text-red-600 sm:block" aria-hidden="true" />
				</div>
			</div>
		</div>
		<div class="col-span-2 rounded-lg bg-white p-3 shadow transition-shadow hover:shadow-md sm:col-span-1 sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Completed</p>
					<p class="mt-1 text-2xl font-semibold text-emerald-600 sm:mt-2 sm:text-3xl">{stats.completed.toLocaleString()}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 sm:h-12 sm:w-12">
					<CheckCircle size={18} class="text-emerald-600 sm:hidden" aria-hidden="true" />
					<CheckCircle size={24} class="hidden text-emerald-600 sm:block" aria-hidden="true" />
				</div>
			</div>
		</div>
	</div>

	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex" aria-label="Request tabs">
			{#each [
				{ id: 'all',         label: 'All Requests',  short: 'All' },
				{ id: 'pending',     label: 'Pending',       short: 'Pending' },
				{ id: 'active',      label: 'Active Loans',  short: 'Active' },
				{ id: 'overdue',     label: 'Overdue',       short: 'Overdue' },
				{ id: 'history',     label: 'History',       short: 'History' },
				{ id: 'obligations', label: `Obligations${pendingObligations.length > 0 ? ` (${pendingObligations.length})` : ''}`, short: `Oblig.${pendingObligations.length > 0 ? ` (${pendingObligations.length})` : ''}` }
			] as tab}
				<button
					onclick={() => handleTabChange(tab.id as any)}
					class="flex flex-1 items-center justify-center border-b-2 py-3 text-xs font-medium transition-colors sm:flex-none sm:px-3 sm:text-sm {activeTab === tab.id ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
					aria-current={activeTab === tab.id ? 'page' : undefined}
				>
					<span class="sm:hidden">{tab.short}</span>
					<span class="hidden sm:inline">{tab.label}</span>
				</button>
			{/each}
		</nav>
	</div>

	<!-- Filters — hidden on obligations tab -->
	{#if activeTab !== 'obligations'}
	<div class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
		<div class="relative flex-1">
			<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
			<input 
				type="text" 
				bind:value={searchQuery} 
				oninput={onSearchInput}
				placeholder="Search by ID, student, or items..." 
				class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" 
			/>
		</div>
		<select bind:value={selectedStatus} onchange={onFilterChange} class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20">
			<option value="all">All Statuses</option>
			<option value="pending_instructor">Pending</option>
			<option value="approved_instructor">Approved</option>
			<option value="ready_for_pickup">Ready for Pickup</option>
			<option value="borrowed">Borrowed</option>
			<option value="pending_return">Return Initiated</option>
			<option value="missing">Missing Items</option>
			<option value="returned">Returned</option>
			<option value="rejected">Rejected</option>
			<option value="cancelled">Cancelled</option>
		</select>
		<button onclick={exportData} class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50">
			<Download size={18} />
			Export
		</button>
	</div>

	<!-- Table -->
	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200">
				<thead class="bg-gray-50">
					<tr>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Request ID</th>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Student</th>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Dates</th>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Status</th>
						<th scope="col" class="relative px-6 py-3"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#if loading && requests.length === 0}
						<tr>
							<td colspan="5" class="px-6 py-8 text-center text-sm text-gray-500">
								<RefreshCw class="mx-auto h-6 w-6 animate-spin text-pink-500" />
								<p class="mt-2">Loading requests...</p>
							</td>
						</tr>
					{:else if requests.length === 0}
						<tr>
							<td colspan="5" class="px-6 py-8 text-center text-sm text-gray-500">
								<Package class="mx-auto mb-2 h-8 w-8 text-gray-400" />
								No requests found matching your criteria.
							</td>
						</tr>
					{:else}
						{#each requests as request}
							{@const overdue = isOverdue(request)}
							<tr class="transition-colors hover:bg-gray-50">
								<td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
									REQ-{request.id.slice(-6).toUpperCase()}
									{#if overdue}
										<span class="ml-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 border border-red-200">
											<AlertTriangle size={12} />
											Overdue
										</span>
									{/if}
								</td>
								<td class="whitespace-nowrap px-6 py-4">
									<div class="flex items-center gap-3">
										<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-pink-500 to-rose-600 text-xs font-bold text-white">
											{#if request.student?.profilePhotoUrl}
												<img src={request.student.profilePhotoUrl} alt="{request.student.fullName}" class="h-full w-full object-cover" />
											{:else}
												{request.student?.firstName?.[0] || ''}{request.student?.lastName?.[0] || ''}
											{/if}
										</div>
										<div class="text-sm">
											<p class="font-medium text-gray-900">{request.student?.fullName || 'Unknown'}</p>
											<p class="text-gray-500">{request.student?.email || ''}</p>
										</div>
									</div>
								</td>
								<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
									<div class="flex flex-col gap-1">
										<span class="inline-flex items-center gap-1.5"><Calendar size={14} />{formatDate(request.borrowDate)} to {formatDate(request.returnDate)}</span>
									</div>
								</td>
								<td class="whitespace-nowrap px-6 py-4">
									<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium {getStatusBadgeColor(request.status)}">
										{getStatusLabel(request.status)}
									</span>
								</td>
								<td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
									<div class="relative inline-block text-left">
										<div class="flex items-center gap-2">
											<button onclick={() => openDetail(request)} class="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition" aria-label="View Details">
												<Eye size={18} />
											</button>
											<button onclick={() => openDropdown = openDropdown === request.id ? null : request.id} class="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition" aria-label="Open Actions">
												<MoreVertical size={18} />
											</button>
										</div>
										{#if openDropdown === request.id}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<div class="fixed inset-0 z-10" onclick={() => openDropdown = null}></div>
											<div class="absolute right-0 z-20 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
												<div class="py-1" role="menu" aria-orientation="vertical">
													<button onclick={() => handleAction('approve', request)} class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100" role="menuitem">Emergency Approve</button>
													<button onclick={() => handleAction('reject', request)} class="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100" role="menuitem">Decline Request</button>
													{#if overdue}
														<button onclick={() => handleAction('remind', request)} class="block w-full px-4 py-2 text-left text-sm text-orange-600 hover:bg-gray-100" role="menuitem">Send Reminder</button>
													{/if}
													{#if request.status !== 'cancelled' && request.status !== 'returned'}
														<button onclick={() => handleAction('cancel', request)} class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100" role="menuitem">Cancel Request</button>
													{/if}
												</div>
											</div>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
		<!-- Pagination -->
		{#if pagination.totalPages > 1}
			<div class="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
				<div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
					<div>
						<p class="text-sm text-gray-700">
							Showing <span class="font-medium">{(pagination.page - 1) * pagination.limit + 1}</span> to <span class="font-medium">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> of <span class="font-medium">{pagination.total}</span> results
						</p>
					</div>
					<div>
						<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
							{#each Array(pagination.totalPages) as _, i}
								<button 
									onclick={() => { pagination.page = i + 1; loadRequests(); }}
									class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pagination.page === i + 1 ? 'z-10 bg-pink-600 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600' : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'} {i === 0 ? 'rounded-l-md' : ''} {i === pagination.totalPages - 1 ? 'rounded-r-md' : ''}"
								>
									{i + 1}
								</button>
							{/each}
						</nav>
					</div>
				</div>
			</div>
		{/if}
	</div>
	{/if}

	<!-- ─── Replacement Obligations Tab ──────────────────────────────────────── -->
	{#if activeTab === 'obligations'}
		<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			<!-- Summary pills -->
			<div class="flex items-center gap-3 border-b border-gray-200 bg-gray-50/60 px-6 py-3">
				<span class="inline-flex items-center gap-1.5 rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-800">
					<Clock size={12} /> {pendingObligations.length} Pending
				</span>
				<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
					<CheckCircle size={12} /> {resolvedObligations.length} Resolved
				</span>
			</div>

			{#if obligationsLoading && obligations.length === 0}
				<div class="flex items-center justify-center py-16">
					<RefreshCw class="h-6 w-6 animate-spin text-pink-500" />
					<p class="ml-3 text-sm text-gray-500">Loading obligations…</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
								<th scope="col" class="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Amount</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Incident Date</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
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
										<span class="inline-flex items-center gap-1.5 rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-800 capitalize">{ob.type}</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-center">
										<span class="font-bold text-gray-900">{ob.amount}</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{formatDate(ob.incidentDate)}</td>
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
									<td colspan="6" class="px-6 py-16 text-center">
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
	{/if}
</div>

<!-- Details Modal -->
{#if showDetailModal && selectedRequest}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<!-- Backdrop -->
		<button
			type="button"
			class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
			onclick={() => showDetailModal = false}
			aria-label="Close modal"
			tabindex="-1"
		></button>

		<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
			<div
				class="animate-scaleIn relative w-full max-w-2xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
				role="dialog"
				aria-modal="true"
				aria-labelledby="request-detail-title"
			>
				<!-- Header -->
				<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
					<div class="px-6 py-5">
						<div class="flex items-start gap-4">
							<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-pink-500 to-rose-600 shadow-lg shadow-pink-500/30">
								<Eye size={22} class="text-white" aria-hidden="true" />
							</div>
							<div class="min-w-0 flex-1">
								<h2 id="request-detail-title" class="text-lg font-bold text-gray-900">Request Details</h2>
								<div class="mt-0.5 flex items-center gap-2">
									<p class="text-sm text-gray-500">REQ-{selectedRequest.id.slice(-6).toUpperCase()}</p>
									{#if isOverdue(selectedRequest)}
										<span class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
											<AlertTriangle size={11} /> Overdue
										</span>
									{/if}
								</div>
							</div>
							<button
								type="button"
								onclick={() => showDetailModal = false}
								class="shrink-0 rounded-xl p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95"
								aria-label="Close request details"
							>
								<X size={20} />
							</button>
						</div>
					</div>
				</div>

				<!-- Body -->
				<div class="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-5">
					<!-- Status -->
					<div class="flex flex-wrap items-center gap-2">
						<span class="inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold {getStatusBadgeColor(selectedRequest.status)}">
							{getStatusLabel(selectedRequest.status)}
						</span>
						{#if isOverdue(selectedRequest)}
							<span class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
								<AlertTriangle size={11} /> Overdue
							</span>
						{/if}
					</div>

					<!-- Request Information -->
					<div>
						<h3 class="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-900">
							<div class="h-1.5 w-1.5 rounded-full bg-pink-500"></div>
							Request Information
						</h3>
						<div class="grid grid-cols-2 gap-3">
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
								<div class="mb-2 flex items-center gap-1.5">
									<CalendarDays size={14} class="text-pink-500" aria-hidden="true" />
									<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Request Date</p>
								</div>
								<p class="text-sm font-bold text-gray-900">
									{new Date(selectedRequest.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
								</p>
							</div>
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
								<div class="mb-2 flex items-center gap-1.5">
									<CalendarDays size={14} class="text-pink-500" aria-hidden="true" />
									<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Borrow Period</p>
								</div>
								<p class="text-sm font-bold text-gray-900">
									{new Date(selectedRequest.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(selectedRequest.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
								</p>
							</div>
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
								<div class="mb-2 flex items-center gap-1.5">
									<UserCircle size={14} class="text-pink-500" aria-hidden="true" />
									<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Student</p>
								</div>
								<div class="flex items-center gap-2">
									<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-1 ring-pink-200">
										{#if selectedRequest.student?.profilePhotoUrl}
											<img src={selectedRequest.student.profilePhotoUrl} alt={selectedRequest.student.fullName} class="h-full w-full object-cover" loading="lazy" />
										{:else}
											{selectedRequest.student?.firstName?.[0] || ''}{selectedRequest.student?.lastName?.[0] || ''}
										{/if}
									</div>
									<div class="min-w-0">
										<p class="truncate text-sm font-bold text-gray-900">{selectedRequest.student?.fullName || 'Unknown'}</p>
										<p class="truncate text-xs text-gray-500">{selectedRequest.student?.email || ''}</p>
									</div>
								</div>
							</div>
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
								<div class="mb-2 flex items-center gap-1.5">
									<UserCircle size={14} class="text-pink-500" aria-hidden="true" />
									<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Instructor</p>
								</div>
								<div class="flex items-center gap-2">
									<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-1 ring-pink-200">
										{#if selectedRequest.instructor?.profilePhotoUrl}
											<img src={selectedRequest.instructor.profilePhotoUrl} alt={selectedRequest.instructor.fullName} class="h-full w-full object-cover" loading="lazy" />
										{:else}
											{selectedRequest.instructor?.firstName?.[0] || ''}{selectedRequest.instructor?.lastName?.[0] || ''}
										{/if}
									</div>
									<p class="truncate text-sm font-bold text-gray-900">{selectedRequest.instructor?.fullName || 'Pending'}</p>
								</div>
							</div>
							{#if selectedRequest.custodian}
								<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
									<div class="mb-2 flex items-center gap-1.5">
										<UserCircle size={14} class="text-pink-500" aria-hidden="true" />
										<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Custodian</p>
									</div>
									<div class="flex items-center gap-2">
										<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-1 ring-pink-200">
											{#if selectedRequest.custodian.profilePhotoUrl}
												<img src={selectedRequest.custodian.profilePhotoUrl} alt={selectedRequest.custodian.fullName} class="h-full w-full object-cover" loading="lazy" />
											{:else}
												{selectedRequest.custodian.firstName?.[0] || ''}{selectedRequest.custodian.lastName?.[0] || ''}
											{/if}
										</div>
										<p class="truncate text-sm font-bold text-gray-900">{selectedRequest.custodian.fullName || '—'}</p>
									</div>
								</div>
							{/if}
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
								<div class="mb-2 flex items-center gap-1.5">
									<BookOpen size={14} class="text-pink-500" aria-hidden="true" />
									<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Class Code</p>
								</div>
								<p class="text-sm font-bold text-gray-900">{selectedRequest.classCodeId?.slice(-6).toUpperCase() || '—'}</p>
							</div>
							<div class="group col-span-2 rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4">
								<div class="mb-2 flex items-center gap-1.5">
									<FileText size={14} class="text-pink-500" aria-hidden="true" />
									<p class="text-[10px] font-bold uppercase tracking-wider text-gray-500 sm:text-xs">Purpose</p>
								</div>
								<p class="text-sm font-bold text-gray-900">{selectedRequest.purpose}</p>
							</div>
						</div>
					</div>

					<!-- Requested Items -->
					<div>
						<h3 class="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-900">
							<div class="h-1.5 w-1.5 rounded-full bg-pink-500"></div>
							Requested Items
						</h3>
						<div class="grid gap-3 sm:grid-cols-2">
							{#each selectedRequest.items as item}
								<div class="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-pink-200 hover:shadow-md">
									{#if item.picture}
										<img src={item.picture} alt={item.name} class="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-gray-100" loading="lazy" />
									{:else}
										<div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-100">
											<Package size={20} class="text-gray-400" aria-hidden="true" />
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-semibold text-gray-900 transition-colors group-hover:text-pink-600">{item.name}</p>
										{#if item.inspection?.status}
											<p class="text-xs capitalize text-gray-500">Condition: {item.inspection.status}</p>
										{/if}
									</div>
									<span class="shrink-0 rounded-full bg-pink-100 px-2.5 py-1 text-xs font-bold text-pink-700">×{item.quantity}</span>
								</div>
							{/each}
						</div>
					</div>


				</div>

				<!-- Footer -->
				<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-6 py-4">
					<div class="flex justify-end">
						<button
							type="button"
							onclick={() => showDetailModal = false}
							class="rounded-xl border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-95"
						>
							Close
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}


