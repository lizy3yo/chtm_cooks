<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import { borrowRequestsAPI, type BorrowRequestRecord } from '$lib/api/borrowRequests';
import { toastStore } from '$lib/stores/toast';
import { loadingStore } from '$lib/stores/loading';
import { Clock, Package, CheckCircle2, XCircle, CalendarDays, User, ShieldCheck, FileText, UserCircle, X, ClipboardList, FileCheck, CheckCheck, PackageCheck, Truck, Home, CircleAlert, Info, Filter, Search, RotateCcw } from 'lucide-svelte';

let history = $state<BorrowRequestRecord[]>([]);
let total = $state(0);
let page = $state(1);
let limit = $state(10);
let search = $state('');
let statusFilter = $state('');
let loading = $state(true);
let unsubscribeSSE: (() => void) | null = null;
let viewMode = $state<'by-request' | 'by-item'>('by-request');
let showDetailModal = $state(false);
let selectedRequest = $state<any>(null);

const statusOptions = [
	{ value: '', label: 'All Statuses' },
	{ value: 'returned', label: 'Returned' },
	{ value: 'cancelled', label: 'Cancelled' },
	{ value: 'rejected', label: 'Rejected' }
];

async function loadHistory() {
	try {
		loading = true;
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
		
		// Don't filter by uiStatus - just use the raw data
		history = response.requests;
		total = response.total;
		
		console.log('Loaded history:', history.length, 'requests');
	} catch (err: any) {
		console.error('Failed to load history:', err);
		toastStore.error(err.message || 'Failed to load history');
		history = [];
		total = 0;
	} finally {
		loading = false;
		loadingStore.stop();
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

function formatDateShort(date: string) {
	return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date));
}

function getStatusColor(status: string) {
	const map: Record<string, string> = {
		pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
		approved: 'bg-blue-100 text-blue-800 border-blue-200',
		ready: 'bg-emerald-100 text-emerald-800 border-emerald-200',
		'picked-up': 'bg-violet-100 text-violet-800 border-violet-200',
		'pending-return': 'bg-orange-100 text-orange-800 border-orange-200',
		missing: 'bg-rose-100 text-rose-800 border-rose-200',
		returned: 'bg-teal-100 text-teal-800 border-teal-200',
		cancelled: 'bg-slate-100 text-slate-800 border-slate-200',
		rejected: 'bg-red-100 text-red-800 border-red-200'
	};
	return map[status] || 'bg-gray-100 text-gray-800 border-gray-200';
}

function statusIcon(status: string) {
	const map: Record<string, any> = {
		returned: CheckCircle2,
		cancelled: XCircle,
		rejected: XCircle
	};
	return map[status] || Clock;
}

let StatusIcon = $derived.by(() => (selectedRequest ? statusIcon(selectedRequest.status) : Clock));

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

function formatRequestCode(id: string) {
	return `REQ-${id.slice(-6).toUpperCase()}`;
}

function openDetailModal(request: any) {
	selectedRequest = request;
	showDetailModal = true;
}

function closeDetailModal() {
	showDetailModal = false;
	selectedRequest = null;
}

function getApprovalTimeline(request: any) {
	const timeline = [
		{ step: 'Request Submitted', status: 'completed', date: request.createdAt, by: 'You' }
	];

	if (request.status === 'returned') {
		timeline.push({ step: 'Instructor Approved', status: 'completed', date: request.createdAt, by: request.instructor?.fullName || 'Primary Admin' });
		timeline.push({ step: 'Custodian Approved', status: 'completed', date: request.createdAt, by: 'Custodian' });
		timeline.push({ step: 'Pickup Confirmed', status: 'completed', date: request.createdAt, by: 'Custodian' });
		timeline.push({ step: 'Returned', status: 'completed', date: request.returnedAt || request.createdAt, by: 'Student' });
	} else if (request.status === 'cancelled') {
		timeline.push({ step: 'Request Cancelled', status: 'cancelled', date: request.createdAt, by: 'You' });
	} else if (request.status === 'rejected') {
		timeline.push({ step: 'Request Rejected', status: 'rejected', date: request.createdAt, by: request.instructor?.fullName || 'Instructor' });
	}

	return timeline;
}
</script>

<svelte:head>
  <title>History - Account - Student Portal</title>
</svelte:head>

<div class="space-y-4 sm:space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">History</h1>
		<p class="mt-1 text-sm text-gray-600">View your complete borrowing history</p>
	</div>

	<!-- Filters -->
	<div class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100 sm:p-5">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<!-- Left: Filters -->
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-1">
				<!-- Status Dropdown -->
				<div class="w-full sm:w-48">
					<label for="status-filter" class="mb-1.5 block text-xs font-semibold text-gray-700">Status</label>
					<div class="relative">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
							<Filter size={16} class="text-gray-400" />
						</div>
						<select
							id="status-filter"
							bind:value={statusFilter}
							onchange={() => { page = 1; loadHistory(); }}
							class="block w-full appearance-none rounded-lg border-gray-300 bg-white py-2 pl-10 pr-10 text-sm font-medium text-gray-900 shadow-sm transition-all focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
						>
							{#each statusOptions as opt}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
						<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
							<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</div>
					</div>
				</div>
				
				<!-- Search Input -->
				<div class="w-full sm:flex-1 sm:max-w-md">
					<label for="search" class="mb-1.5 block text-xs font-semibold text-gray-700">Search</label>
					<div class="relative">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
							<Search size={16} class="text-gray-400" />
						</div>
						<input
							type="text"
							id="search"
							placeholder="Search by purpose or item..."
							bind:value={search}
							onkeydown={(e) => e.key === 'Enter' && loadHistory()}
							class="block w-full rounded-lg border-gray-300 bg-white py-2 pl-10 pr-3 text-sm placeholder-gray-400 shadow-sm transition-all focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
						/>
					</div>
				</div>
			</div>
			
			<!-- Right: View Mode Toggle -->
			<div class="flex items-center justify-center sm:justify-end">
				<div class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 shadow-sm">
					<button
						onclick={() => viewMode = 'by-request'}
						class="rounded-md px-3 py-1.5 text-xs font-semibold transition-all {viewMode === 'by-request' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
					>
						By Request
					</button>
					<button
						onclick={() => viewMode = 'by-item'}
						class="rounded-md px-3 py-1.5 text-xs font-semibold transition-all {viewMode === 'by-item' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
					>
						By Item
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- Content -->
	{#if loading}
		<div class="flex items-center justify-center py-16">
			<div class="h-10 w-10 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600"></div>
		</div>
	{:else if !history || history.length === 0}
		<div class="rounded-xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-gray-100">
			<Clock size={48} class="mx-auto text-pink-600" />
			<h3 class="mt-4 text-base font-semibold text-gray-900">No history found</h3>
			<p class="mt-2 text-sm text-gray-500">You have no completed, cancelled, or rejected requests yet.</p>
			<p class="mt-1 text-xs text-gray-400">Debug: {history?.length ?? 'null'} items, loading: {loading}</p>
		</div>
	{:else}
		<div class="space-y-3">
			<p class="text-xs text-gray-500">Showing {history.length} requests</p>
			{#if viewMode === 'by-request'}
				{#each history as req}
					{@const uiStatus = toUiStatus(req.status, req.rejectReason)}
					{@const Icon = statusIcon(uiStatus)}
					<button
						onclick={() => openDetailModal({ ...req, rawId: req.id, id: formatRequestCode(req.id), items: req.items, status: uiStatus, requestDate: req.createdAt, purpose: req.purpose, instructor: req.instructor?.fullName || 'N/A', rejectionReason: req.rejectReason, returnedAt: req.returnedAt })}
						class="group w-full rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-gray-100 transition-all hover:shadow-md hover:ring-gray-200 sm:p-5"
					>
						<div class="flex items-start gap-4">
							<!-- Item Images -->
							<div class="hidden shrink-0 sm:flex sm:-space-x-3">
								{#each req.items.slice(0, 3) as item}
									{#if item.picture}
										<img src={item.picture} alt={item.name} class="h-14 w-14 rounded-xl object-cover ring-2 ring-white" />
									{:else}
										<div class="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 ring-2 ring-white">
											<Package size={20} class="text-gray-400" />
										</div>
									{/if}
								{/each}
								{#if req.items.length > 3}
									<div class="flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-pink-50 to-violet-50 ring-2 ring-white">
										<span class="text-sm font-semibold text-gray-700">+{req.items.length - 3}</span>
									</div>
								{/if}
							</div>

							<!-- Content -->
							<div class="min-w-0 flex-1">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<h3 class="text-base font-semibold text-gray-900 group-hover:text-pink-600 transition-colors sm:text-lg">{req.purpose}</h3>
										<p class="mt-0.5 font-mono text-xs text-gray-500">{formatRequestCode(req.id)}</p>
									</div>
									<span class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium {getStatusColor(uiStatus)}">
										<Icon size={12} />
										{toStatusLabel(uiStatus)}
									</span>
								</div>

								<!-- Items List -->
								<div class="mt-3 space-y-1.5">
									{#each req.items as item}
										<div class="flex items-center gap-2 text-sm">
											<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 sm:hidden">
												{#if item.picture}
													<img src={item.picture} alt={item.name} class="h-8 w-8 rounded-lg object-cover" />
												{:else}
													<Package size={14} class="text-gray-400" />
												{/if}
											</div>
											<span class="text-gray-900">{item.name}</span>
											<span class="text-gray-400">×</span>
											<span class="font-medium text-gray-700">{item.quantity}</span>
										</div>
									{/each}
								</div>

								<!-- Meta Info -->
								<div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
									<div class="flex items-center gap-1.5">
										<CalendarDays size={14} class="text-gray-400" />
										<span>{formatDateShort(req.createdAt)}</span>
									</div>
									{#if req.instructor?.fullName}
										<div class="flex items-center gap-1.5">
											<User size={14} class="text-gray-400" />
											<span>{req.instructor.fullName}</span>
										</div>
									{/if}
									{#if req.custodian?.fullName}
										<div class="flex items-center gap-1.5">
											<ShieldCheck size={14} class="text-gray-400" />
											<span>{req.custodian.fullName}</span>
										</div>
									{/if}
								</div>
							</div>
						</div>
					</button>
				{/each}
			{:else}
				{#each history as req}
					{@const uiStatus = toUiStatus(req.status, req.rejectReason)}
					{@const Icon = statusIcon(uiStatus)}
					{#each req.items as item}
						<button
							onclick={() => openDetailModal({ ...req, rawId: req.id, id: formatRequestCode(req.id), items: req.items, status: uiStatus, requestDate: req.createdAt, purpose: req.purpose, instructor: req.instructor?.fullName || 'N/A', rejectionReason: req.rejectReason, returnedAt: req.returnedAt })}
							class="group w-full rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-gray-100 transition-all hover:shadow-md hover:ring-gray-200 sm:p-5"
						>
							<div class="flex items-start gap-4">
								<!-- Item Image -->
								<div class="shrink-0">
									{#if item.picture}
										<img src={item.picture} alt={item.name} class="h-16 w-16 rounded-xl object-cover sm:h-20 sm:w-20" />
									{:else}
										<div class="flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100 sm:h-20 sm:w-20">
											<Package size={24} class="text-gray-400" />
										</div>
									{/if}
								</div>

								<!-- Content -->
								<div class="min-w-0 flex-1">
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0 flex-1">
											<h3 class="text-base font-semibold text-gray-900 group-hover:text-pink-600 transition-colors">{item.name}</h3>
											<p class="mt-0.5 text-sm text-gray-600">Quantity: {item.quantity}</p>
										</div>
										<span class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium {getStatusColor(uiStatus)}">
											<Icon size={12} />
											{toStatusLabel(uiStatus)}
										</span>
									</div>

									<div class="mt-2 text-sm text-gray-700">
										<span class="font-medium">Purpose:</span> {req.purpose}
									</div>

									<!-- Meta Info -->
									<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
										<div class="flex items-center gap-1.5">
											<CalendarDays size={14} class="text-gray-400" />
											<span>{formatDateShort(req.createdAt)}</span>
										</div>
										{#if req.instructor?.fullName}
											<div class="flex items-center gap-1.5">
												<User size={14} class="text-gray-400" />
												<span>{req.instructor.fullName}</span>
											</div>
										{/if}
										{#if req.custodian?.fullName}
											<div class="flex items-center gap-1.5">
												<ShieldCheck size={14} class="text-gray-400" />
												<span>{req.custodian.fullName}</span>
											</div>
										{/if}
									</div>
								</div>
							</div>
						</button>
					{/each}
				{/each}
			{/if}
		</div>

		<!-- Pagination -->
		{#if total > limit}
			<div class="flex flex-col items-center justify-between gap-3 rounded-xl bg-white px-4 py-4 shadow-sm ring-1 ring-gray-100 sm:flex-row sm:px-5">
				<div class="text-sm text-gray-600">
					Showing <span class="font-medium text-gray-900">{(page - 1) * limit + 1}</span> to <span class="font-medium text-gray-900">{Math.min(page * limit, total)}</span> of <span class="font-medium text-gray-900">{total}</span> results
				</div>
				<div class="flex gap-2">
					<button
						onclick={() => { if (page > 1) { page--; loadHistory(); } }}
						disabled={page === 1}
						class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Previous
					</button>
					<button
						onclick={() => { if (page * limit < total) { page++; loadHistory(); } }}
						disabled={page * limit >= total}
						class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Next
					</button>
				</div>
			</div>
		{/if}
	{/if}
</div>

<!-- Detail Modal -->
{#if showDetailModal && selectedRequest}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onclick={closeDetailModal} aria-label="Close modal" tabindex="-1"></button>
		<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
			<div class="relative w-full max-w-3xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl animate-scaleIn overflow-hidden">
				
				<!-- Header -->
				<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-4 sm:px-8 sm:py-6">
					<div class="flex items-start justify-between gap-3">
						<div class="flex items-start gap-3 min-w-0 flex-1">
							<div class="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30">
								<ClipboardList size={20} class="text-white sm:hidden" strokeWidth={2.5} />
								<ClipboardList size={24} class="text-white hidden sm:block" strokeWidth={2.5} />
							</div>
							<div class="min-w-0 flex-1">
								<h2 class="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Request Details</h2>
								<p class="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-pink-600">{selectedRequest.id}</p>
								<div class="mt-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5 {getStatusColor(selectedRequest.status)} shadow-sm ring-1 ring-black/5">
									<StatusIcon size={12} strokeWidth={2.5} class="sm:hidden" />
									<StatusIcon size={14} strokeWidth={2.5} class="hidden sm:block" />
									<span class="text-[10px] sm:text-xs font-bold">{toStatusLabel(selectedRequest.status)}</span>
								</div>
							</div>
						</div>
						<button 
							onclick={closeDetailModal} 
							aria-label="Close details modal"
							class="rounded-xl p-2 sm:p-2.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95"
						>
							<X size={18} class="sm:hidden" />
							<X size={22} class="hidden sm:block" />
						</button>
					</div>
				</div>
				
				<!-- Content -->
				<div class="max-h-[70vh] overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
					<div class="space-y-6 sm:space-y-8">
						
						<!-- Approval Timeline -->
						<div>
							<div class="rounded-2xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-4 sm:p-5">
								<div class="relative">
									<svg class="absolute inset-0 w-full h-16 pointer-events-none" style="z-index: 0;">
										{#each getApprovalTimeline(selectedRequest) as step, idx}
											{@const stepCount = getApprovalTimeline(selectedRequest).length}
											{@const isLastStep = idx === stepCount - 1}
											{@const stepWidth = 100 / stepCount}
											{@const x1 = (stepWidth * (idx + 0.5))}
											{@const x2 = (stepWidth * (idx + 1.5))}
											{@const y = 20}
											{@const currentStep = step}
											{@const isCurrentCompleted = currentStep.status === 'completed'}
											
											{#if !isLastStep}
												<line
													x1={x1 + '%'}
													y1={y}
													x2={x2 + '%'}
													y2={y}
													stroke={isCurrentCompleted ? '#ec4899' : '#e5e7eb'}
													stroke-width="2"
													stroke-linecap="round"
												/>
											{/if}
										{/each}
									</svg>
									
									<div class="relative flex items-start justify-between gap-1 sm:gap-2" style="z-index: 1;">
										{#each getApprovalTimeline(selectedRequest) as step}
											{@const isCompleted = step.status === 'completed'}
											{@const isCancelled = step.status === 'cancelled'}
											{@const isRejected = step.status === 'rejected'}
											
											<div class="flex flex-col items-center flex-1">
												<div class="relative mb-2 flex items-center justify-center">
													<div class="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 bg-white {
														isCompleted ? 'border-pink-600' :
														isCancelled ? 'border-slate-400' :
														isRejected ? 'border-red-600' :
														'border-gray-300'
													}">
														{#if step.step === 'Request Submitted'}
															<FileCheck size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
															<FileCheck size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
														{:else if step.step === 'Instructor Approved'}
															<CheckCheck size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
															<CheckCheck size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
														{:else if step.step === 'Custodian Approved'}
															<PackageCheck size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
															<PackageCheck size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
														{:else if step.step === 'Pickup Confirmed'}
															<Truck size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
															<Truck size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
														{:else if step.step === 'Returned'}
															<Home size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
															<Home size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
														{:else if step.step === 'Request Cancelled'}
															<XCircle size={18} class="text-slate-400 sm:hidden" />
															<XCircle size={20} class="text-slate-400 hidden sm:block" />
														{:else if step.step === 'Request Rejected'}
															<XCircle size={18} class="text-red-600 sm:hidden" />
															<XCircle size={20} class="text-red-600 hidden sm:block" />
														{/if}
													</div>
												</div>
												
												<div class="text-center min-w-0">
													<p class="text-[10px] sm:text-xs font-semibold text-gray-900 leading-tight line-clamp-2">{step.step}</p>
													<p class="text-[9px] sm:text-xs text-gray-500 mt-0.5 line-clamp-1">{step.by}</p>
													<p class="text-[9px] sm:text-xs font-medium {
														isCompleted ? 'text-pink-600' :
														isCancelled ? 'text-slate-500' :
														isRejected ? 'text-red-600' :
														'text-gray-400'
													} mt-0.5">
														{#if step.date}
															{new Date(step.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
														{:else}
															Pending
														{/if}
													</p>
												</div>
											</div>
										{/each}
									</div>
								</div>
								
								<div class="mt-4 pt-3 border-t border-gray-200 flex flex-wrap gap-3 justify-center text-[10px] sm:text-xs">
									<div class="flex items-center gap-1.5">
										<div class="h-2 w-2 rounded-full bg-pink-600"></div>
										<span class="text-gray-600">Completed</span>
									</div>
									<div class="flex items-center gap-1.5">
										<div class="h-2 w-2 rounded-full bg-red-600"></div>
										<span class="text-gray-600">Rejected</span>
									</div>
									<div class="flex items-center gap-1.5">
										<div class="h-2 w-2 rounded-full bg-slate-400"></div>
										<span class="text-gray-600">Cancelled</span>
									</div>
								</div>
							</div>
						</div>

						<!-- Request Information -->
						<div>
							<h3 class="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-900">
								<div class="h-1 w-1 rounded-full bg-pink-500"></div>
								Request Information
							</h3>
							<div class="grid grid-cols-2 gap-3 sm:gap-4">
								<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
									<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
										<CalendarDays size={14} class="text-pink-500 sm:hidden" />
										<CalendarDays size={16} class="text-pink-500 hidden sm:block" />
										<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Request Date</p>
									</div>
									<p class="text-sm sm:text-base font-bold text-gray-900">{new Date(selectedRequest.requestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
								</div>
								<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
									<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
										<FileText size={14} class="text-pink-500 sm:hidden" />
										<FileText size={16} class="text-pink-500 hidden sm:block" />
										<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Purpose</p>
									</div>
									<p class="text-sm sm:text-base font-bold text-gray-900 line-clamp-2">{selectedRequest.purpose}</p>
								</div>
								<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md col-span-2">
									<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
										<UserCircle size={14} class="text-pink-500 sm:hidden" />
										<UserCircle size={16} class="text-pink-500 hidden sm:block" />
										<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Instructor</p>
									</div>
									<p class="text-sm sm:text-base font-bold text-gray-900">{selectedRequest.instructor}</p>
								</div>
							</div>
						</div>

						<!-- Requested Items -->
						<div>
							<h3 class="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-900">
								<div class="h-1 w-1 rounded-full bg-pink-500"></div>
								Requested Items
							</h3>
							<div class="grid gap-3 sm:grid-cols-2">
								{#each selectedRequest.items as item}
									<div class="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-pink-200 hover:shadow-md">
										{#if item.picture}
											<img src={item.picture} alt={item.name} class="h-12 w-12 rounded-lg object-cover shrink-0 ring-1 ring-gray-100" />
										{:else}
											<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 ring-1 ring-gray-100">
												<Package size={20} class="text-gray-400" />
											</div>
										{/if}
										<div class="min-w-0 flex-1">
											<span class="block text-sm font-semibold text-gray-900 group-hover:text-pink-600 transition-colors">{item.name}</span>
											<span class="text-xs text-gray-500">Qty: {item.quantity}</span>
										</div>
									</div>
								{/each}
							</div>
						</div>
						
						<!-- Rejection Reason -->
						{#if selectedRequest.status === 'rejected' && selectedRequest.rejectionReason}
							<div class="rounded-2xl border-2 border-red-200 bg-linear-to-br from-red-50 to-red-100/50 p-5">
								<div class="flex gap-3">
									<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500">
										<CircleAlert size={20} class="text-white" />
									</div>
									<div class="flex-1 min-w-0">
										<p class="text-sm font-bold text-red-900">Rejection Reason</p>
										<p class="mt-1.5 text-sm text-red-800 leading-relaxed">{selectedRequest.rejectionReason}</p>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
				
				<!-- Footer -->
				<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-3 sm:px-8 sm:py-5">
					<button
						onclick={closeDetailModal}
						class="w-full rounded-xl bg-linear-to-r from-gray-900 to-gray-800 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-gray-800 hover:to-gray-700 active:scale-[0.98]"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}