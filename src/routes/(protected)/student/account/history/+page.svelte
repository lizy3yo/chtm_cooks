<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import { borrowRequestsAPI, type BorrowRequestRecord } from '$lib/api/borrowRequests';
import { toastStore } from '$lib/stores/toast';
import { loadingStore } from '$lib/stores/loading';

let history: BorrowRequestRecord[] = [];
let total = 0;
let page = 1;
let limit = 10;
let search = '';
let statusFilter = '';
let loading = false;
let unsubscribeSSE: (() => void) | null = null;
let viewMode: 'by-request' | 'by-item' = 'by-request';

const statusOptions = [
	{ value: '', label: 'All Statuses' },
	{ value: 'returned', label: 'Returned' },
	{ value: 'cancelled', label: 'Cancelled' },
	{ value: 'rejected', label: 'Rejected' }
];

async function loadHistory() {
	try {
		loading = true;
		loadingStore.start();
		// Map the selected status (UI-level) to the raw statuses the API expects.
		// - When filtering for `cancelled`, include raw `cancelled` and raw `rejected` (some cancellations are stored as `rejected` with a cancel reason).
		// - When filtering for `rejected`, request only raw `rejected` and later exclude cancelled-by-student results client-side.
		let apiStatuses: string[];
		if (!statusFilter) {
			apiStatuses = ['returned', 'cancelled', 'rejected'];
		} else if (statusFilter === 'cancelled') {
			apiStatuses = ['cancelled', 'rejected'];
		} else {
			apiStatuses = [statusFilter];
		}
		const response = await borrowRequestsAPI.list({
			statuses: apiStatuses as any,
			search: search || undefined,
			page,
			limit,
			sortBy: 'createdAt'
		});
		// Convert to UI statuses and, if the user selected a specific status, filter client-side
		// so items that map to a different UI status (e.g. raw `rejected` that is actually a cancellation)
		// are not shown under the wrong filter tab.
		const mapped = response.requests.map((r) => ({ ...r, uiStatus: toUiStatus(r.status, r.rejectReason) }));
		if (statusFilter) {
			history = mapped.filter((r) => r.uiStatus === statusFilter).map(({ uiStatus, ...rest }) => rest as BorrowRequestRecord);
		} else {
			history = mapped.map(({ uiStatus, ...rest }) => rest as BorrowRequestRecord);
		}
		total = history.length === 0 ? response.total : history.length;
	} catch (err: any) {
		toastStore.error(err.message || 'Failed to load history');
	} finally {
		loading = false;
	}
}

onMount(() => {
	loadHistory();
	unsubscribeSSE = borrowRequestsAPI.subscribeToChanges(() => {
		loadHistory();
	});
});

onDestroy(() => {
	if (unsubscribeSSE) unsubscribeSSE();
});

function formatDate(date: string) {
	return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
}

function getStatusColor(status: string) {
	// Match the application's established status color scheme used elsewhere (student requests)
	const map: Record<string, string> = {
		pending: 'bg-yellow-100 text-yellow-800',
		approved: 'bg-blue-100 text-blue-800',
		ready: 'bg-green-100 text-green-800',
		'picked-up': 'bg-purple-100 text-purple-800',
		'pending-return': 'bg-orange-100 text-orange-800',
		missing: 'bg-rose-100 text-rose-800',
		returned: 'bg-teal-100 text-teal-800',
		cancelled: 'bg-slate-100 text-slate-800',
		rejected: 'bg-red-100 text-red-800'
	};
	return map[status] || 'bg-gray-100 text-gray-800';
}

function isCancelledRequest(status: BorrowRequestRecord['status'], rejectionReason?: string): boolean {
	if (status === 'cancelled') return true;
	if (!rejectionReason) return false;
	return rejectionReason.toLowerCase().includes('cancel');
}

function toUiStatus(status: BorrowRequestRecord['status'], rejectionReason?: string): string {
	if (isCancelledRequest(status, rejectionReason)) return 'cancelled';
	const map: Record<string, string> = {
		pending_instructor: 'pending',
		approved_instructor: 'approved',
		ready_for_pickup: 'ready',
		borrowed: 'picked-up',
		pending_return: 'pending-return',
		missing: 'missing',
		returned: 'returned',
		cancelled: 'cancelled',
		rejected: 'rejected'
	};
	return map[status] ?? status;
}

function toStatusLabel(s: string): string {
	const labels: Record<string, string> = {
		'pending': 'Pending Review',
		'approved': 'Approved',
		'ready': 'Ready for Pickup',
		'picked-up': 'Active Loan',
		'pending-return': 'Return Initiated',
		'missing': 'Item Missing',
		'returned': 'Returned',
		'cancelled': 'Cancelled',
		'rejected': 'Rejected'
	};
	return labels[s] ?? s;
}
</script>

<svelte:head>
  <title>History - Account - Student Portal</title>
</svelte:head>

<div class="space-y-6">
	<div class="border-b border-gray-200 pb-5">
		<h1 class="text-3xl font-bold text-gray-900">History</h1>
		<p class="mt-2 text-sm text-gray-600">View your complete borrowing history from your account section</p>
	</div>

	<div class="rounded-lg bg-white shadow p-6">
		<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
			<div>
				<label for="status-filter" class="block text-sm font-medium text-gray-700">Status</label>
				<select
					id="status-filter"
					bind:value={statusFilter}
					onchange={() => { page = 1; loadHistory(); }}
					class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
				>
					{#each statusOptions as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>
			<div class="sm:col-span-2">
				<label for="search" class="block text-sm font-medium text-gray-700">Search</label>
				<input
					type="text"
					id="search"
					placeholder="Search by purpose or item..."
					bind:value={search}
					onkeydown={(e) => e.key === 'Enter' && loadHistory()}
					class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-pink-500 focus:ring-pink-500"
				/>
			</div>
		</div>

		<div class="mb-4">
			<div class="inline-flex w-fit rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs font-medium">
				<button
					class="rounded-md px-3 py-1.5 {viewMode === 'by-request' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}"
					onclick={() => viewMode = 'by-request'}
				>
					By Request
				</button>
				<button
					class="rounded-md px-3 py-1.5 {viewMode === 'by-item' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}"
					onclick={() => viewMode = 'by-item'}
				>
					By Item
				</button>
			</div>
		</div>

		{#if loading}
			<div class="flex items-center justify-center py-8">
				<div class="h-12 w-12 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600"></div>
			</div>
		{:else if history.length === 0}
			<div class="py-12 text-center">
				<svg class="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
				</svg>
				<h3 class="mt-4 text-lg font-medium text-gray-900">No history found</h3>
				<p class="mt-2 text-sm text-gray-500">You have no completed, cancelled, or rejected requests yet.</p>
			</div>
		{:else}
			{#if viewMode === 'by-request'}
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b border-gray-200 bg-gray-50">
								<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Requested At</th>
								<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
								<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Purpose</th>
								<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Items</th>
								<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Instructor</th>
								<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Custodian</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200">
							{#each history as req}
								{@const uiStatus = toUiStatus(req.status, req.rejectReason)}
								<tr class="hover:bg-gray-50 transition-colors">
									<td class="px-6 py-4 text-sm text-gray-600">{formatDate(req.createdAt)}</td>
									<td class="px-6 py-4">
										<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(uiStatus)}">
											{toStatusLabel(uiStatus)}
										</span>
									</td>
									<td class="px-6 py-4 text-sm text-gray-600">{req.purpose}</td>
									<td class="px-6 py-4 text-sm">
										<ul class="list-disc pl-4">
											{#each req.items as item}
												<li>{item.name} <span class="text-xs text-gray-500">x{item.quantity}</span></li>
											{/each}
										</ul>
									</td>
									<td class="px-6 py-4 text-sm text-gray-600">{req.instructor?.fullName || '-'}</td>
									<td class="px-6 py-4 text-sm text-gray-600">{req.custodian?.fullName || '-'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b border-gray-200 bg-gray-50">
								<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Request</th>
								<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Item</th>
								<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Qty</th>
								<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
								<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Instructor</th>
								<th class="px-6 py-3 text-left text-sm font-semibold text-gray-900">Custodian</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200">
							{#each history as req}
								{@const uiStatus = toUiStatus(req.status, req.rejectReason)}
								{#each req.items as item}
									<tr class="hover:bg-gray-50 transition-colors">
										<td class="px-6 py-4 text-sm text-gray-600">{formatDate(req.createdAt)}</td>
										<td class="px-6 py-4 text-sm text-gray-900">{item.name}</td>
										<td class="px-6 py-4 text-sm text-gray-700">{item.quantity}</td>
										<td class="px-6 py-4">
											<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(uiStatus)}">
												{toStatusLabel(uiStatus)}
											</span>
										</td>
										<td class="px-6 py-4 text-sm text-gray-600">{req.instructor?.fullName || '-'}</td>
										<td class="px-6 py-4 text-sm text-gray-600">{req.custodian?.fullName || '-'}</td>
									</tr>
								{/each}
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if total > limit}
				<div class="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
					<div class="text-sm text-gray-700">
						Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} entries
					</div>
					<div class="flex gap-2">
						<button
							onclick={() => { if (page > 1) { page--; loadHistory(); } }}
							disabled={page === 1}
							class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Previous
						</button>
						<button
							onclick={() => { if (page * limit < total) { page++; loadHistory(); } }}
							disabled={page * limit >= total}
							class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Next
						</button>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>