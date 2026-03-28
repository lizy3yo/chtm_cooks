<script lang="ts">
import { onMount } from 'svelte';
import { borrowRequestsAPI, type BorrowRequestRecord, type BorrowRequestRealtimeEvent } from '$lib/api/borrowRequests';
import { catalogAPI } from '$lib/api/catalog';
import { confirmStore } from '$lib/stores/confirm';
import { toastStore } from '$lib/stores/toast';
import Skeleton from '$lib/components/ui/Skeleton.svelte';
import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
import {
	ClipboardList, Clock, Activity, PackageOpen,
	CheckCircle2, X, Search, RotateCcw,
	Plus, ClipboardX, CalendarDays, FileText,
	UserCircle, Info, CornerDownLeft,
	Check, CircleX, PackageCheck, CircleAlert
} from 'lucide-svelte';

type StudentTab = 'my-request' | 'instructor-approved' | 'active' | 'history';

let activeTab = $state<StudentTab>('my-request');
let searchQuery = $state('');
let sortBy = $state('newest');
let showDetailModal = $state(false);
let selectedRequest = $state<any>(null);
let dateFilter = $state({ from: '', to: '' });
let requests = $state<any[]>([]);
let loading = $state(true);
let loadingReturn = $state<string | null>(null);
let loadingCancel = $state<string | null>(null);
// itemId → picture URL, back-filled from catalog for legacy requests
let itemPictureCache = $state<Map<string, string>>(new Map());

// Live-sync state
let liveSyncActive = $state(false);
let refreshInFlight = $state(false);
let pendingRefresh = $state(false);
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function inferItemIcon(itemName: string): string {
const normalized = itemName.toLowerCase();
if (normalized.includes('knife')) return '🔪';
if (normalized.includes('bowl')) return '🥣';
if (normalized.includes('scale')) return '⚖️';
if (normalized.includes('mixer')) return '🎛️';
if (normalized.includes('processor')) return '🔧';
return '📦';
}

function isCancelledRequest(status: BorrowRequestRecord['status'], rejectionReason?: string): boolean {
	return status === 'cancelled' || (status === 'rejected' && rejectionReason === 'Request cancelled by student');
}

function toUiStatus(status: BorrowRequestRecord['status'], rejectionReason?: string): 'pending' | 'approved' | 'ready' | 'picked-up' | 'pending-return' | 'missing' | 'returned' | 'rejected' | 'cancelled' {
switch (status) {
case 'pending_instructor':
return 'pending';
case 'approved_instructor':
return 'approved';
case 'ready_for_pickup':
return 'ready';
case 'borrowed':
return 'picked-up';
case 'pending_return':
return 'pending-return';
case 'missing':
return 'missing';
case 'returned':
return 'returned';
case 'cancelled':
return 'cancelled';
case 'rejected':
return isCancelledRequest(status, rejectionReason) ? 'cancelled' : 'rejected';
default:
return 'approved';
}
}

function formatRequestCode(id: string): string {
return `REQ-${id.slice(-6).toUpperCase()}`;
}

function mapRequest(request: BorrowRequestRecord): any {
const uiStatus = toUiStatus(request.status, request.rejectReason);
return {
rawId: request.id,
id: formatRequestCode(request.id),
items: request.items.map((item) => ({
name: item.name,
itemId: item.itemId,
picture: item.picture || null
})),
status: uiStatus,
requestDate: request.createdAt,
borrowDate: request.borrowDate,
returnDate: request.returnDate,
purpose: request.purpose,
instructor: request.instructor?.fullName || 'Pending Assignment',
approvedDate: request.approvedAt,
releasedDate: request.releasedAt,
pickedUpDate: request.pickedUpAt,
returnedDate: request.returnedAt,
rejectionReason: request.rejectReason
};
}

async function loadRequests(forceRefresh = false): Promise<void> {
	try {
		const response = await borrowRequestsAPI.list({}, { forceRefresh });
		requests = response.requests.map(mapRequest);
	} catch (error) {
		console.error('Failed to load student requests', error);
		requests = [];
	} finally {
		loading = false;
	}
	
	// Backfill pictures in background after loading state is cleared (non-blocking)
	await backfillItemPictures();
}

function hydrateRequestsFromClientCache(): boolean {
	const cached = borrowRequestsAPI.peekCachedList({});
	if (!cached) return false;

	requests = cached.requests.map(mapRequest);
	loading = false;
	void backfillItemPictures();
	return true;
}

async function backfillItemPictures(): Promise<void> {
	// Collect itemIds that have no stored picture
	const missingIds = new Set<string>();
	for (const req of requests) {
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
		// Non-critical — fallback icon will be shown
	}
}

/**
 * Refresh the list, guarding against overlapping fetches.
 * If a fetch is already running, set a flag so we re-run once it finishes.
 */
async function refreshRequests(forceRefresh = false): Promise<void> {
	if (refreshInFlight) {
		pendingRefresh = true;
		return;
	}
	refreshInFlight = true;
	try {
		if (forceRefresh) {
			borrowRequestsAPI.invalidateCache();
		}
		await loadRequests(forceRefresh);
		// Sync the open detail modal if it is stale
		syncSelectedRequestWithLatestData();
	} finally {
		refreshInFlight = false;
		if (pendingRefresh) {
			pendingRefresh = false;
			await refreshRequests();
		}
	}
}

/** Keep the detail modal in sync after a background refresh. */
function syncSelectedRequestWithLatestData(): void {
	if (!selectedRequest) return;
	const fresh = requests.find((r) => r.rawId === selectedRequest.rawId);
	if (fresh) {
		selectedRequest = fresh;
	} else {
		// Request no longer in list (e.g. returned) — close the modal.
		closeDetailModal();
	}
}

/**
 * Coalesce rapid SSE events into a single refresh after a short debounce.
 * This prevents N simultaneous fetches when multiple mutations happen quickly.
 */
function scheduleRefresh(forceRefresh = false): void {
	if (refreshTimer !== null) clearTimeout(refreshTimer);
	refreshTimer = setTimeout(() => {
		refreshTimer = null;
		refreshRequests(forceRefresh);
	}, 250);
}

let _unsubscribeSSE: (() => void) | null = null;
let _pollInterval: ReturnType<typeof setInterval> | null = null;

onMount(() => {
	// If navigated here after a new submission, bypass all caches immediately.
	const isPostSubmit = new URLSearchParams(window.location.search).get('new') === '1';

	if (isPostSubmit) {
		borrowRequestsAPI.invalidateCache();
		// Clean the URL without triggering a navigation
		const cleanUrl = window.location.pathname;
		history.replaceState(null, '', cleanUrl);
	}

	// Instant paint from client memory cache (skipped on post-submit since cache was just cleared).
	hydrateRequestsFromClientCache();
	void loadRequests(isPostSubmit);

	// --- SSE real-time subscription ---
	_unsubscribeSSE = borrowRequestsAPI.subscribeToChanges((_event: BorrowRequestRealtimeEvent) => {
		scheduleRefresh(true);
	});
	liveSyncActive = true;

	// --- 30-second polling fallback (handles SSE gaps / reconnects) ---
	_pollInterval = setInterval(() => {
		void refreshRequests();
	}, 30_000);

	// --- Refresh on tab/window focus so stale data is never shown ---
	const onFocus = () => refreshRequests();
	const onVisible = () => { if (document.visibilityState === 'visible') refreshRequests(); };
	window.addEventListener('focus', onFocus);
	document.addEventListener('visibilitychange', onVisible);

	return () => {
		_unsubscribeSSE?.();
		if (_pollInterval !== null) clearInterval(_pollInterval);
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		window.removeEventListener('focus', onFocus);
		document.removeEventListener('visibilitychange', onVisible);
	};
});

function getStatusColor(status: string) {
switch (status) {
case 'pending': return 'bg-yellow-100 text-yellow-800';
case 'approved': return 'bg-blue-100 text-blue-800';
case 'ready': return 'bg-green-100 text-green-800';
case 'picked-up': return 'bg-purple-100 text-purple-800';
case 'pending-return': return 'bg-orange-100 text-orange-800';
case 'missing': return 'bg-rose-100 text-rose-800';
case 'returned': return 'bg-teal-100 text-teal-800';
case 'cancelled': return 'bg-slate-100 text-slate-800';
case 'rejected': return 'bg-red-100 text-red-800';
default: return 'bg-gray-100 text-gray-800';
}
}

function getStatusIconComponent(status: string) {
	switch (status) {
		case 'pending': return Clock;
		case 'approved': return CheckCircle2;
		case 'ready': return PackageCheck;
		case 'picked-up': return PackageCheck;
		case 'pending-return': return CornerDownLeft;
		case 'missing': return CircleAlert;
		case 'returned': return CheckCircle2;
		case 'cancelled': return CircleX;
		case 'rejected': return CircleX;
		default: return Clock;
	}
}

function getStatusBorderColor(status: string): string {
switch (status) {
case 'pending': return 'border-amber-400';
case 'approved': return 'border-blue-500';
case 'ready': return 'border-emerald-500';
case 'picked-up': return 'border-violet-500';
case 'pending-return': return 'border-orange-500';
case 'missing': return 'border-rose-600';
case 'returned': return 'border-teal-500';
case 'cancelled': return 'border-slate-400';
case 'rejected': return 'border-red-500';
default: return 'border-gray-200';
}
}

function getStatusLabel(status: string): string {
const labels: Record<string, string> = {
'pending': 'Pending Review',
'approved': 'Instructor Approved',
'ready': 'Ready for Pickup',
'picked-up': 'Active Loan',
'pending-return': 'Return Initiated',
'missing': 'Item Missing',
'returned': 'Returned',
'cancelled': 'Cancelled',
'rejected': 'Rejected'
};
return labels[status] ?? status;
}

const filteredRequests = $derived.by(() => {
	let result = requests.filter((req) => {
		const isMyRequest = req.status === 'pending';
		const isInstructorApproved = ['approved', 'ready'].includes(req.status);
		const isActive = ['picked-up', 'pending-return', 'missing'].includes(req.status);
		const isHistory = ['returned', 'rejected', 'cancelled'].includes(req.status);

		if (activeTab === 'my-request' && !isMyRequest) return false;
		if (activeTab === 'instructor-approved' && !isInstructorApproved) return false;
		if (activeTab === 'active' && !isActive) return false;
		if (activeTab === 'history' && !isHistory) return false;
		if (searchQuery && !`${req.id} ${req.purpose} ${req.items.map((item: any) => item.name).join(' ')}`.toLowerCase().includes(searchQuery.toLowerCase())) {
			return false;
		}
		if (dateFilter.from && new Date(req.requestDate) < new Date(dateFilter.from)) {
			return false;
		}
		if (dateFilter.to && new Date(req.requestDate) > new Date(dateFilter.to)) {
			return false;
		}
		return true;
	});

	result = result.sort((a, b) => {
		if (sortBy === 'oldest') {
			return new Date(a.requestDate).getTime() - new Date(b.requestDate).getTime();
		}
		if (sortBy === 'return-date') {
			return new Date(a.returnDate).getTime() - new Date(b.returnDate).getTime();
		}
		return new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime();
	});

	return result;
});

const tabCounts = $derived({
 'my-request': requests.filter((r) => r.status === 'pending').length,
 'instructor-approved': requests.filter((r) => ['approved', 'ready'].includes(r.status)).length,
active: requests.filter((r) => ['picked-up', 'pending-return', 'missing'].includes(r.status)).length,
history: requests.filter((r) => ['returned', 'rejected', 'cancelled'].includes(r.status)).length
});

const stats = $derived({
totalRequests: requests.length,
pendingCount: requests.filter(r => r.status === 'pending').length,
activeCount: requests.filter(r => ['picked-up', 'pending-return', 'missing'].includes(r.status)).length,
readyForPickup: requests.filter(r => r.status === 'ready').length
});

function openDetailModal(request: any) {
selectedRequest = request;
showDetailModal = true;
}

function closeDetailModal() {
showDetailModal = false;
selectedRequest = null;
}

function getReadyPickupMessage(): string {
return 'Please proceed to the custodian desk. Pickup will be confirmed by the custodian upon release of items.';
}

async function requestReturnConfirmation(request: any) {
	if (loadingReturn === request.rawId) return;

	const confirmed = await confirmStore.warning(
		'Are you ready to return these items? The custodian will inspect and confirm the return.',
		`Initiate Return for ${request.id}`,
		'Initiate Return',
		'Keep Active'
	);

	if (!confirmed) return;

	const requestId = request.rawId;
	loadingReturn = requestId;

	try {
		await borrowRequestsAPI.initiateReturn(requestId);
		borrowRequestsAPI.invalidateCache();
		requests = requests.map((req) =>
			req.rawId === requestId ? { ...req, status: 'pending-return' } : req
		);
		toastStore.success(`Return initiated for ${request.id}. The custodian will confirm the return.`);
	} catch (error: any) {
		console.error('Failed to initiate return', error);
		toastStore.error(`Failed to initiate return: ${error?.message || 'Please try again.'}`);
	} finally {
		loadingReturn = null;
	}
}

async function requestCancelConfirmation(request: any) {
	if (loadingCancel === request.rawId) return;

	const confirmed = await confirmStore.danger(
		'Are you sure you want to cancel this request? This action cannot be undone.',
		`Cancel ${request.id}`,
		'Cancel Request',
		'Keep Request'
	);

	if (!confirmed) return;

	const requestId = request.rawId;
	loadingCancel = requestId;

	try {
		await borrowRequestsAPI.cancel(requestId);
		borrowRequestsAPI.invalidateCache();
		requests = requests.filter((req) => req.rawId !== requestId);
		if (selectedRequest?.rawId === requestId) {
			closeDetailModal();
		}
		toastStore.success(`Request ${request.id} has been cancelled.`);
	} catch (error: any) {
		console.error('Failed to cancel request', error);
		toastStore.error(`Failed to cancel request: ${error?.message || 'Please try again.'}`);
	} finally {
		loadingCancel = null;
	}
}

function getApprovalTimeline(request: any) {
const timeline = [
{ step: 'Request Submitted', status: 'completed', date: request.requestDate, by: 'You' }
];

if (request.status === 'pending') {
timeline.push({ step: 'Instructor Review', status: 'pending', date: null, by: request.instructor });
timeline.push({ step: 'Custodian Approval', status: 'pending', date: null, by: 'Custodian' });
} else if (request.status === 'approved') {
timeline.push({ step: 'Instructor Approved', status: 'completed', date: request.approvedDate || request.requestDate, by: request.instructor || 'Primary Admin' });
timeline.push({ step: 'Custodian Approval', status: 'pending', date: null, by: 'Custodian' });
} else if (request.status === 'ready') {
timeline.push({ step: 'Instructor Approved', status: 'completed', date: request.approvedDate || request.requestDate, by: request.instructor || 'Primary Admin' });
timeline.push({ step: 'Custodian Approved', status: 'completed', date: request.releasedDate || request.requestDate, by: 'Custodian' });
timeline.push({ step: 'Awaiting Pickup', status: 'pending', date: null, by: 'Student' });
} else if (request.status === 'picked-up') {
timeline.push({ step: 'Instructor Approved', status: 'completed', date: request.approvedDate || request.requestDate, by: request.instructor || 'Primary Admin' });
timeline.push({ step: 'Custodian Approved', status: 'completed', date: request.releasedDate || request.requestDate, by: 'Custodian' });
timeline.push({ step: 'Pickup Confirmed', status: 'completed', date: request.pickedUpDate || request.requestDate, by: 'Custodian' });
timeline.push({ step: 'Awaiting Return', status: 'pending', date: null, by: 'Student' });
} else if (request.status === 'returned') {
timeline.push({ step: 'Instructor Approved', status: 'completed', date: request.approvedDate || request.requestDate, by: request.instructor || 'Primary Admin' });
timeline.push({ step: 'Custodian Approved', status: 'completed', date: request.releasedDate || request.requestDate, by: 'Custodian' });
timeline.push({ step: 'Pickup Confirmed', status: 'completed', date: request.pickedUpDate || request.requestDate, by: 'Custodian' });
timeline.push({ step: 'Returned', status: 'completed', date: request.returnedDate || request.requestDate, by: 'Student' });
} else if (request.status === 'cancelled') {
timeline.push({ step: 'Request Cancelled', status: 'cancelled', date: request.requestDate, by: 'You' });
} else if (request.status === 'rejected') {
timeline.push({ step: 'Request Rejected', status: 'rejected', date: request.requestDate, by: request.instructor });
}

return timeline;
}
</script>

<svelte:head>
	<title>My Requests - Student Portal</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page Header -->
	<div>
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">My Requests</h1>
		<p class="mt-1 text-sm text-gray-500">Track your equipment borrow requests</p>
	</div>
	
	<!-- Statistics Cards -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-lg bg-white p-5 shadow">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Requests</p>
					<p class="mt-2 text-3xl font-semibold text-gray-900">{stats.totalRequests}</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
					<ClipboardList size={24} class="text-blue-600" />
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-5 shadow">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Pending Approval</p>
					<p class="mt-2 text-3xl font-semibold text-yellow-600">{stats.pendingCount}</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
					<Clock size={24} class="text-yellow-600" />
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-5 shadow">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Active(s)</p>
					<p class="mt-2 text-3xl font-semibold text-green-600">{stats.activeCount}</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
					<Activity size={24} class="text-green-600" />
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-5 shadow">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Ready for Pickup</p>
					<p class="mt-2 text-3xl font-semibold text-pink-600">{stats.readyForPickup}</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100">
					<PackageOpen size={24} class="text-pink-600" />
				</div>
			</div>
		</div>
	</div>
	
	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6 overflow-x-auto">
			<button
				onclick={() => activeTab = 'my-request'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'my-request' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Request
				<span class="ml-2 rounded-full {activeTab === 'my-request' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs">
					{tabCounts['my-request']}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'instructor-approved'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'instructor-approved' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Approval
				<span class="ml-2 rounded-full {activeTab === 'instructor-approved' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs">
					{tabCounts['instructor-approved']}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'active'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'active' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Active
				<span class="ml-2 rounded-full {activeTab === 'active' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs">
					{tabCounts.active}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'history'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'history' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				History
				<span class="ml-2 rounded-full {activeTab === 'history' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs">
					{tabCounts.history}
				</span>
			</button>
		</nav>
	</div>
	
	<!-- Search and Filter Bar -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex-1 max-w-md">
			<div class="relative">
				<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<Search size={20} class="text-gray-400" />
				</div>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search by request ID, item, or purpose..."
					class="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
				/>
			</div>
		</div>
		
		<div class="flex items-center gap-3">
			<select
				bind:value={sortBy}
				class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
			>
				<option value="newest">Sort by Date (Newest)</option>
				<option value="oldest">Sort by Date (Oldest)</option>
				<option value="return-date">Sort by Return Date</option>
			</select>
			
			<button
				onclick={() => {
					searchQuery = '';
					dateFilter = { from: '', to: '' };
					sortBy = 'newest';
					activeTab = 'my-request';
				}}
				class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
			>
			<RotateCcw size={16} />
				Clear
			</button>
		</div>
	</div>
	
	<!-- Requests List -->
	<div class="space-y-4">
		<div class="flex items-center justify-between rounded-lg bg-gray-50 p-3">
			<span class="text-sm font-medium text-gray-700">
				{filteredRequests.length} {filteredRequests.length === 1 ? 'request' : 'requests'} found
			</span>
			<a href="/student/request" class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-3 py-2 text-xs font-medium text-white hover:bg-pink-700">
				<Plus size={16} />
				New Request
			</a>
		</div>
		
		<!-- Loading skeletons only show on first load when no requests exist -->
		{#if loading && requests.length === 0}
			{#each Array(3) as _, i}
				<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 border-l-4 border-gray-200">
					<div class="p-5 space-y-4">
						<!-- Header row -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<Skeleton class="h-4 w-24" />
								<Skeleton class="h-5 w-28 rounded-full" />
							</div>
							<Skeleton class="h-3.5 w-20" />
						</div>
						<!-- Equipment chips -->
						<div class="space-y-2">
							<Skeleton class="h-3 w-36" />
							<div class="flex gap-2">
								{#each Array(i === 0 ? 3 : i === 1 ? 2 : 4) as _}
									<Skeleton class="h-7 w-24 rounded-md" />
								{/each}
							</div>
						</div>
						<!-- Metadata row -->
						<div class="flex flex-wrap gap-x-5 gap-y-2">
							<Skeleton class="h-3.5 w-40" />
							<Skeleton class="h-3.5 w-52" />
							<Skeleton class="h-3.5 w-32" />
						</div>
					</div>
					<!-- Card footer skeleton -->
					<div class="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-5 py-3">
						<Skeleton class="h-3.5 w-48" />
						<div class="flex gap-2">
							<Skeleton class="h-7 w-24 rounded-lg" />
						</div>
					</div>
				</div>
			{/each}
		{:else}
		
		{#each filteredRequests as request}
			<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 transition-all hover:shadow-md border-l-4 {getStatusBorderColor(request.status)}">

				<!-- Card Body -->
				<div class="p-5">

					<!-- Header: ID · Status · Date -->
					<div class="flex items-start justify-between gap-3">
						<div class="flex flex-wrap items-center gap-2 min-w-0">
							<span class="font-mono text-sm font-bold tracking-widest text-gray-900">{request.id}</span>
							<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold {getStatusColor(request.status)}">
							<svelte:component this={getStatusIconComponent(request.status)} size={12} />
								{getStatusLabel(request.status)}
							</span>
						</div>
						<time class="shrink-0 whitespace-nowrap text-xs text-gray-400">
							{new Date(request.requestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
						</time>
					</div>

					<!-- Equipment Chips -->
					<div class="mt-4">
						<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Equipment Requested</p>
						<div class="flex flex-wrap gap-1.5">
							{#each request.items as item}
								{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
								<span class="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
									{#if pic}
										<img src={pic} alt={item.name} class="h-4 w-4 rounded object-cover shrink-0" />
									{:else}
										<span class="h-3.5 w-3.5 shrink-0 overflow-hidden rounded"><ItemImagePlaceholder size="xs" /></span>
									{/if}
									{item.name}
								</span>
							{/each}
						</div>
					</div>

					<!-- Metadata Row -->
					<div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
						<div class="flex items-center gap-1.5 text-xs text-gray-500">
						<CalendarDays size={14} class="shrink-0 text-gray-400" />
							<span>
								{new Date(request.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
								–
								{new Date(request.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
							</span>
						</div>
						<div class="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
						<FileText size={14} class="shrink-0 text-gray-400" />
							<span class="truncate max-w-[220px]">{request.purpose}</span>
						</div>
						<div class="flex items-center gap-1.5 text-xs text-gray-500">
						<UserCircle size={14} class="shrink-0 text-gray-400" />
							<span>{request.instructor}</span>
						</div>
					</div>

					<!-- Rejection Reason -->
					{#if request.status === 'rejected' && request.rejectionReason}
						<div class="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
							<svg class="h-4 w-4 shrink-0 mt-0.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
							</svg>
							<div class="min-w-0">
								<p class="text-xs font-semibold text-red-800">Rejection Reason</p>
								<p class="mt-0.5 text-xs text-red-700">{request.rejectionReason}</p>
							</div>
						</div>
					{/if}

				</div>

				<!-- Card Footer: contextual hint + actions -->
				<div class="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-5 py-3">

					<!-- Left: status hint -->
					<div class="text-xs">
						{#if request.status === 'ready'}
							<span class="flex items-center gap-1.5 font-medium text-emerald-700">
							<Info size={14} />
								Proceed to the custodian desk to collect your items
							</span>
						{:else if request.status === 'pending-return'}
							<span class="flex items-center gap-1.5 font-medium text-orange-600">
							<Clock size={14} />
								Awaiting custodian confirmation
							</span>
						{:else}
							<span class="text-gray-300">—</span>
						{/if}
					</div>

					<!-- Right: action buttons -->
					<div class="flex items-center gap-2">
						<button
							onclick={() => openDetailModal(request)}
							class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
						>
							View Details
						</button>
						{#if request.status === 'pending'}
							<button
								onclick={() => requestCancelConfirmation(request)}
								disabled={loadingCancel === request.rawId}
								class="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								{#if loadingCancel === request.rawId}
									<svg class="h-3.5 w-3.5 inline-block animate-spin mr-1" fill="none" viewBox="0 0 24 24">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
									Cancelling…
								{:else}
									Cancel
								{/if}
							</button>
						{/if}
						{#if request.status === 'picked-up'}
							<button
								onclick={() => requestReturnConfirmation(request)}
								disabled={loadingReturn === request.rawId}
								class="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								{#if loadingReturn === request.rawId}
									<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
									Processing…
								{:else}
									<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 17l-4 4m0 0l-4-4m4 4V3"/>
									</svg>
									Return Items
								{/if}
							</button>
						{/if}
						{#if request.status === 'rejected'}
							<button class="rounded-lg border border-pink-200 bg-white px-3 py-1.5 text-xs font-medium text-pink-700 shadow-sm hover:bg-pink-50 transition-colors">
								Appeal
							</button>
						{/if}
					</div>

				</div>
			</div>
		{/each}
		{/if}
		
		{#if filteredRequests.length === 0}
			<div class="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
			<ClipboardX size={48} class="mx-auto text-gray-400" />
				<h3 class="mt-2 text-sm font-medium text-gray-900">No requests found</h3>
				<p class="mt-1 text-sm text-gray-500">Get started by creating a new request.</p>
				<div class="mt-6">
				<a href="/student/request" class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700">
					<Plus size={16} />
						New Request
					</a>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Detail Modal -->
{#if showDetailModal && selectedRequest}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="fixed inset-0 bg-black/40 backdrop-blur-sm" onclick={closeDetailModal}></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative w-full max-w-3xl rounded-lg bg-white/95 shadow-xl ring-1 ring-black/5 backdrop-blur-sm">
				<!-- Header -->
				<div class="border-b border-gray-200 bg-gray-50 px-6 py-4">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="text-lg font-semibold text-gray-900">Request Details</h3>
							<p class="mt-1 text-sm text-gray-500">{selectedRequest.id}</p>
						</div>
						<button onclick={closeDetailModal} class="text-gray-400 hover:text-gray-500">
						<X size={24} />
						</button>
					</div>
				</div>
				
				<!-- Content -->
				<div class="max-h-[70vh] overflow-y-auto px-6 py-6">
					<div class="space-y-6">
						<!-- Status Badge -->
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-3">Current Status</h4>
						<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold {getStatusColor(selectedRequest.status)}">
							<svelte:component this={getStatusIconComponent(selectedRequest.status)} size={16} />
							{getStatusLabel(selectedRequest.status)}
							</span>
						</div>
						
						<!-- Requested Items -->
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-3">Requested Items</h4>
							<div class="space-y-2">
								{#each selectedRequest.items as item}
								{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
								<div class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
									{#if pic}
										<img src={pic} alt={item.name} class="h-10 w-10 rounded-md object-cover shrink-0" />
										{:else}
											<div class="h-10 w-10 shrink-0 overflow-hidden rounded-md">
												<ItemImagePlaceholder size="sm" />
											</div>
										{/if}
										<span class="text-sm font-medium text-gray-900">{item.name}</span>
									</div>
								{/each}
							</div>
						</div>

						<!-- Request Information -->
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-3">Request Information</h4>
							<div class="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
								<div>
									<p class="text-xs font-medium text-gray-500">Request Date</p>
									<p class="mt-2 text-sm font-medium text-gray-900">{new Date(selectedRequest.requestDate).toLocaleDateString()}</p>
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500">Borrow Period</p>
									<p class="mt-2 text-sm font-medium text-gray-900">
										{new Date(selectedRequest.borrowDate).toLocaleDateString()} - {new Date(selectedRequest.returnDate).toLocaleDateString()}
									</p>
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500">Purpose</p>
									<p class="mt-2 text-sm font-medium text-gray-900">{selectedRequest.purpose}</p>
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500">Instructor</p>
									<p class="mt-2 text-sm font-medium text-gray-900">{selectedRequest.instructor}</p>
								</div>
							</div>
						</div>
						
						<!-- Approval Timeline -->
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-3">Approval Timeline</h4>
							<div class="flow-root">
								<ul class="-mb-8">
									{#each getApprovalTimeline(selectedRequest) as step, idx}
										<li>
											<div class="relative pb-8">
												{#if idx !== getApprovalTimeline(selectedRequest).length - 1}
													<span class="absolute left-4 top-4 -ml-px h-full w-0.5 {step.status === 'completed' ? 'bg-pink-600' : 'bg-gray-300'}" aria-hidden="true"></span>
												{/if}
												<div class="relative flex space-x-3">
													<div>
														<span class="flex h-8 w-8 items-center justify-center rounded-full {
															step.status === 'completed' ? 'bg-pink-600' :
															step.status === 'cancelled' ? 'bg-slate-500' :
															step.status === 'rejected' ? 'bg-red-600' :
															'bg-gray-300'
														}">
															{#if step.status === 'completed'}
																<svg class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
																</svg>
															{:else if step.status === 'cancelled'}
																<svg class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
																</svg>
															{:else if step.status === 'rejected'}
																<svg class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
																</svg>
															{:else}
																<svg class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
																</svg>
															{/if}
														</span>
													</div>
													<div class="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
														<div>
															<p class="text-sm font-medium text-gray-900">{step.step}</p>
															<p class="text-xs text-gray-500">{step.by}</p>
														</div>
														<div class="whitespace-nowrap text-right text-xs text-gray-500">
															{#if step.date}
																{new Date(step.date).toLocaleDateString()}
															{:else}
																Pending
															{/if}
														</div>
													</div>
												</div>
											</div>
										</li>
									{/each}
								</ul>
							</div>
						</div>
						
						<!-- Rejection Reason -->
						{#if selectedRequest.status === 'rejected' && selectedRequest.rejectionReason}
							<div>
								<h4 class="text-sm font-medium text-gray-700 mb-3">Rejection Reason</h4>
								<div class="rounded-lg bg-red-50 border border-red-200 p-4">
									<div class="flex gap-3">
										<svg class="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
										</svg>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium text-red-800">Reason</p>
											<p class="mt-0.5 text-sm text-red-700">{selectedRequest.rejectionReason}</p>
										</div>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
				
				<!-- Footer -->
				<div class="border-t border-gray-200 bg-gray-50 px-6 py-4">
					<div class="flex justify-end gap-3">
						<button
							onclick={closeDetailModal}
							class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>
							Close
						</button>
						{#if selectedRequest.status === 'pending'}
							<button
								onclick={() => requestCancelConfirmation(selectedRequest)}
								disabled={loadingCancel === selectedRequest.rawId}
								class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								{#if loadingCancel === selectedRequest.rawId}
									<svg class="h-4 w-4 inline-block animate-spin mr-2" fill="none" viewBox="0 0 24 24">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
									Cancelling…
								{:else}
									Cancel Request
								{/if}
							</button>
						{/if}
						{#if selectedRequest.status === 'ready'}
							<div class="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
								{getReadyPickupMessage()}
							</div>
						{/if}
						{#if selectedRequest.status === 'rejected'}
							<button class="rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700">
								Appeal Request
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}


