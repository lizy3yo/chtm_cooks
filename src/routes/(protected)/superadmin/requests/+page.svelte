<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { 
		Search, 
		Download, 
		Info, 
		Eye, 
		CheckCircle, 
		XCircle, 
		Clock, 
		AlertTriangle, 
		Wifi, 
		WifiOff,
		MoreVertical,
		RefreshCw,
		Package,
		Calendar,
		User,
		Bell
	} from 'lucide-svelte';
	import { 
		borrowRequestsAPI, 
		type BorrowRequestRecord, 
		type BorrowRequestRealtimeEvent 
	} from '$lib/api/borrowRequests';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import QRCode from 'qrcode';
	import RequestsSkeletonLoader from '$lib/components/ui/RequestsSkeletonLoader.svelte';

	let activeTab = $state<'all' | 'pending' | 'active' | 'overdue' | 'history'>('all');
	let searchQuery = $state('');
	let selectedStatus = $state('all');
	let sseConnected = $state(false);

	let requests = $state<BorrowRequestRecord[]>([]);
	let pagination = $state({ page: 1, limit: 20, total: 0, totalPages: 1 });
	let loading = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout>;

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

	onMount(async () => {
		await Promise.all([loadRequests(), loadStats()]);
		
		unsubscribeSSE = borrowRequestsAPI.subscribeToChanges(async (event) => {
			sseConnected = true;
			await loadRequests(false);
			await loadStats();
			const msgs: Record<string, string> = {
				created: 'New borrow request submitted',
				approved: 'Request approved',
				rejected: 'Request rejected',
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
	});

	onDestroy(() => {
		unsubscribeSSE?.();
	});

	async function loadRequests(showLoader = true) {
		if (showLoader) loading = true;
		try {
			const statusesMap: Record<string, string[]> = {
				'all': [],
				'pending': ['pending_instructor'],
				'active': ['approved_instructor', 'ready_for_pickup', 'borrowed', 'pending_return', 'missing'],
				'overdue': ['borrowed'], // In real app, overdue is filtered by date
				'history': ['returned', 'resolved', 'cancelled', 'rejected']
			};
			
			let statuses = statusesMap[activeTab] || [];
			if (selectedStatus !== 'all') {
				statuses = [selectedStatus];
			}

			const res = await borrowRequestsAPI.list({
				statuses: statuses.length > 0 ? statuses as any : undefined,
				search: searchQuery || undefined,
				page: pagination.page,
				limit: pagination.limit,
				sortBy: 'createdAt'
			}, { forceRefresh: true });

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

	async function loadStats() {
		try {
			const res = await borrowRequestsAPI.list({ limit: 1000 }, { forceRefresh: true });
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
			pending_instructor: 'Pending Review',
			approved_instructor: 'Instructor Approved',
			ready_for_pickup: 'Ready for Pickup',
			borrowed: 'Active Loan',
			pending_return: 'Return Initiated',
			missing: 'Item Missing',
			returned: 'Returned',
			resolved: 'Resolved',
			rejected: 'Rejected',
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
				const confirmed = await confirmStore.danger('Reject this request?', 'Reject Request', 'Reject');
				if (!confirmed) return;
				await borrowRequestsAPI.reject(request.id, 'Superadmin Override');
				toastStore.success('Request rejected');
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
	<div>
		<div class="flex items-start justify-between gap-4">
			<div class="flex-1">
				<h1 class="text-2xl font-bold text-gray-900">Request Management</h1>
				<p class="mt-1 text-sm text-gray-500">System-wide oversight of all equipment borrow requests</p>
			</div>
			<div class="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium {sseConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-500'}">
				{#if sseConnected}<Wifi size={13} class="text-emerald-500" />Live{:else}<WifiOff size={13} />Connecting...{/if}
			</div>
		</div>
	</div>

	{#if loading && requests.length === 0}
		<RequestsSkeletonLoader viewMode="list" />
	{:else}
		<!-- Stats -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
			<p class="text-sm font-medium text-gray-500">Total Requests</p>
			<p class="mt-2 text-3xl font-bold text-gray-900">{stats.totalRequests.toLocaleString()}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
			<p class="text-sm font-medium text-gray-500">Pending</p>
			<p class="mt-2 text-3xl font-bold text-yellow-600">{stats.pending}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
			<p class="text-sm font-medium text-gray-500">Active Loans</p>
			<p class="mt-2 text-3xl font-bold text-purple-600">{stats.active}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
			<p class="text-sm font-medium text-gray-500">Overdue</p>
			<p class="mt-2 text-3xl font-bold text-red-600">{stats.overdue}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
			<p class="text-sm font-medium text-gray-500">Completed</p>
			<p class="mt-2 text-3xl font-bold text-emerald-600">{stats.completed.toLocaleString()}</p>
		</div>
	</div>

	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6 overflow-x-auto">
			{#each [
				{ id: 'all', label: 'All Requests' },
				{ id: 'pending', label: 'Pending' },
				{ id: 'active', label: 'Active Loans' },
				{ id: 'overdue', label: 'Overdue' },
				{ id: 'history', label: 'History' }
			] as tab}
				<button 
					onclick={() => handleTabChange(tab.id as any)} 
					class="whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === tab.id ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
				>
					{tab.label}
				</button>
			{/each}
		</nav>
	</div>

	<!-- Filters -->
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
										<div class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
											{request.student?.firstName?.[0] || ''}{request.student?.lastName?.[0] || ''}
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
													<button onclick={() => handleAction('reject', request)} class="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100" role="menuitem">Reject Request</button>
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
									class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {pagination.page === i + 1 ? 'z-10 bg-pink-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600' : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'} {i === 0 ? 'rounded-l-md' : ''} {i === pagination.totalPages - 1 ? 'rounded-r-md' : ''}"
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
</div>

<!-- Details Modal -->
{#if showDetailModal && selectedRequest}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onclick={() => showDetailModal = false}></div>
	<div class="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col sm:rounded-l-2xl">
		<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-gray-50">
			<div>
				<h2 class="text-lg font-bold text-gray-900">Request Details</h2>
				<p class="text-sm text-gray-500">REQ-{selectedRequest.id.slice(-6).toUpperCase()}</p>
			</div>
			<button onclick={() => showDetailModal = false} class="rounded-full p-2 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition">
				<XCircle size={24} />
			</button>
		</div>
		<div class="flex-1 overflow-y-auto p-6 space-y-6">
			<!-- Status Banner -->
			<div class="flex items-center justify-between rounded-xl p-4 border {getStatusBadgeColor(selectedRequest.status).replace('bg-', 'bg-opacity-50 bg-').replace('text-', 'text-')}">
				<div>
					<p class="text-xs font-medium uppercase tracking-wider opacity-80">Current Status</p>
					<p class="text-lg font-bold">{getStatusLabel(selectedRequest.status)}</p>
				</div>
				{#if isOverdue(selectedRequest)}
					<div class="flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-sm font-semibold text-red-800">
						<AlertTriangle size={16} /> Overdue
					</div>
				{/if}
			</div>

			<!-- People -->
			<div class="grid grid-cols-2 gap-4">
				<div class="rounded-xl border border-gray-200 p-4 shadow-sm">
					<p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Student</p>
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold">
							{selectedRequest.student?.firstName?.[0] || ''}{selectedRequest.student?.lastName?.[0] || ''}
						</div>
						<div>
							<p class="font-medium text-gray-900">{selectedRequest.student?.fullName || 'Unknown'}</p>
							<p class="text-xs text-gray-500">{selectedRequest.student?.email || 'No email'}</p>
						</div>
					</div>
				</div>
				<div class="rounded-xl border border-gray-200 p-4 shadow-sm">
					<p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Instructor</p>
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-700 font-bold">
							{selectedRequest.instructor?.firstName?.[0] || ''}{selectedRequest.instructor?.lastName?.[0] || ''}
						</div>
						<div>
							<p class="font-medium text-gray-900">{selectedRequest.instructor?.fullName || 'Pending'}</p>
							<p class="text-xs text-gray-500">{selectedRequest.instructor?.email || '—'}</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Request Info -->
			<div class="rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
				<h3 class="font-semibold text-gray-900 border-b border-gray-100 pb-2">Information</h3>
				<div class="grid grid-cols-2 gap-y-4">
					<div>
						<p class="text-xs font-medium text-gray-500">Borrow Date</p>
						<p class="font-medium text-gray-900">{formatDate(selectedRequest.borrowDate)}</p>
					</div>
					<div>
						<p class="text-xs font-medium text-gray-500">Return Date</p>
						<p class="font-medium text-gray-900">{formatDate(selectedRequest.returnDate)}</p>
					</div>
					<div class="col-span-2">
						<p class="text-xs font-medium text-gray-500">Purpose</p>
						<p class="text-sm text-gray-900 mt-1">{selectedRequest.purpose}</p>
					</div>
					{#if selectedRequest.usageLocation}
						<div class="col-span-2">
							<p class="text-xs font-medium text-gray-500">Location</p>
							<p class="text-sm text-gray-900 mt-1 capitalize">{selectedRequest.usageLocation}</p>
						</div>
					{/if}
				</div>
			</div>

			<!-- Items -->
			<div class="rounded-xl border border-gray-200 p-5 shadow-sm">
				<h3 class="font-semibold text-gray-900 border-b border-gray-100 pb-2 mb-3">Requested Items ({selectedRequest.items.length})</h3>
				<ul class="space-y-3">
					{#each selectedRequest.items as item}
						<li class="flex items-center justify-between rounded-lg bg-gray-50 p-3 border border-gray-100">
							<div class="flex items-center gap-3">
								<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm">
									<Package size={18} class="text-gray-400" />
								</div>
								<div>
									<p class="font-medium text-gray-900 text-sm">{item.name}</p>
									{#if item.inspection?.status}
										<p class="text-xs text-gray-500 capitalize">Condition: {item.inspection.status}</p>
									{/if}
								</div>
							</div>
							<span class="rounded-full bg-pink-100 px-2.5 py-1 text-xs font-bold text-pink-700">
								Qty: {item.quantity}
							</span>
						</li>
					{/each}
				</ul>
			</div>

			{#if qrDataUrl}
				<div class="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-6 shadow-sm">
					<p class="mb-3 text-sm font-medium text-gray-600">Request QR Code</p>
					<img src={qrDataUrl} alt="QR Code" class="h-40 w-40 rounded-xl bg-white p-2 shadow-sm" />
				</div>
			{/if}
		</div>
		<div class="border-t border-gray-200 p-4 bg-gray-50 flex justify-end">
			<button onclick={() => showDetailModal = false} class="rounded-lg bg-white border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50">
				Close
			</button>
		</div>
	</div>
{/if}

