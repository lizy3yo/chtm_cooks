<script lang="ts">
import { onMount } from 'svelte';
import { borrowRequestsAPI, type BorrowRequestRecord, type BorrowRequestRealtimeEvent } from '$lib/api/borrowRequests';
import { catalogAPI } from '$lib/api/catalog';
import { confirmStore } from '$lib/stores/confirm';
import { toastStore } from '$lib/stores/toast';
import Skeleton from '$lib/components/ui/Skeleton.svelte';
import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
import QRCode from 'qrcode';
import {
	ClipboardList, Clock, Activity, PackageOpen,
	CheckCircle2, X, Search, RotateCcw,
	Plus, ClipboardX, CalendarDays, FileText,
	UserCircle, Info, CornerDownLeft,
	Check, CircleX, PackageCheck, CircleAlert,
	FileCheck, CheckCheck, Truck, Home, QrCode
} from 'lucide-svelte';

type StudentTab = 'my-request' | 'instructor-approved' | 'active' | 'history';
type RequestViewMode = 'card' | 'list';

// Pagination constants
const PAGE_SIZE_CARD = 5;
const PAGE_SIZE_LIST = 10;

let activeTab = $state<StudentTab>('my-request');
let searchQuery = $state('');
let sortBy = $state('newest');
let requestViewMode = $state<RequestViewMode>('list');
let showDetailModal = $state(false);
let selectedRequest = $state<any>(null);
let qrDataUrl = $state<string | null>(null);
let showQrModal = $state(false);
let dateFilter = $state({ from: '', to: '' });
let requests = $state<any[]>([]);
let loading = $state(true);
let loadingReturn = $state<string | null>(null);
let loadingCancel = $state<string | null>(null);
let currentPage = $state(1);
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

const totalPages = $derived(
	Math.ceil(filteredRequests.length / (requestViewMode === 'card' ? PAGE_SIZE_CARD : PAGE_SIZE_LIST))
);

const paginatedRequests = $derived.by(() => {
	const pageSize = requestViewMode === 'card' ? PAGE_SIZE_CARD : PAGE_SIZE_LIST;
	const start = (currentPage - 1) * pageSize;
	const end = start + pageSize;
	return filteredRequests.slice(start, end);
});

// Reset to page 1 when filters or view mode changes
$effect(() => {
	activeTab;
	searchQuery;
	sortBy;
	dateFilter;
	requestViewMode;
	currentPage = 1;
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
qrDataUrl = null;
// Generate QR code containing the raw request ID for custodian scanning
QRCode.toDataURL(request.rawId, {
	width: 240,
	margin: 2,
	color: { dark: '#111827', light: '#ffffff' },
	errorCorrectionLevel: 'H'
}).then(url => { qrDataUrl = url; }).catch(() => {});
}

function closeDetailModal() {
showDetailModal = false;
selectedRequest = null;
qrDataUrl = null;
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

function exportToCSV() {
	const headers = ['Request ID', 'Status', 'Request Date', 'Borrow Date', 'Return Date', 'Purpose', 'Instructor', 'Items'];
	const rows = filteredRequests.map(req => [
		req.id,
		getStatusLabel(req.status),
		new Date(req.requestDate).toLocaleDateString('en-US'),
		new Date(req.borrowDate).toLocaleDateString('en-US'),
		new Date(req.returnDate).toLocaleDateString('en-US'),
		req.purpose,
		req.instructor,
		req.items.map((item: any) => item.name).join('; ')
	]);
	
	const csvContent = [
		headers.join(','),
		...rows.map(row => row.map(cell => `"${cell}"`).join(','))
	].join('\n');
	
	const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
	const link = document.createElement('a');
	const url = URL.createObjectURL(blob);
	link.setAttribute('href', url);
	link.setAttribute('download', `my-requests-${new Date().toISOString().split('T')[0]}.csv`);
	link.style.visibility = 'hidden';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}
 
const SelectedStatusIcon = $derived.by(() => selectedRequest ? getStatusIconComponent(selectedRequest.status) : Clock);
const QrStatusIcon = $derived.by(() => selectedRequest ? getStatusIconComponent(selectedRequest.status) : Clock);
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
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Total</p>
					<p class="mt-1 text-2xl font-semibold text-gray-900 sm:mt-2 sm:text-3xl">{stats.totalRequests}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 sm:h-12 sm:w-12">
					<ClipboardList size={18} class="text-blue-600 sm:hidden" />
					<ClipboardList size={24} class="hidden text-blue-600 sm:block" />
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Pending</p>
					<p class="mt-1 text-2xl font-semibold text-yellow-600 sm:mt-2 sm:text-3xl">{stats.pendingCount}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow-100 sm:h-12 sm:w-12">
					<Clock size={18} class="text-yellow-600 sm:hidden" />
					<Clock size={24} class="hidden text-yellow-600 sm:block" />
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Active</p>
					<p class="mt-1 text-2xl font-semibold text-green-600 sm:mt-2 sm:text-3xl">{stats.activeCount}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 sm:h-12 sm:w-12">
					<Activity size={18} class="text-green-600 sm:hidden" />
					<Activity size={24} class="hidden text-green-600 sm:block" />
				</div>
			</div>
		</div>

		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Pickup</p>
					<p class="mt-1 text-2xl font-semibold text-pink-600 sm:mt-2 sm:text-3xl">{stats.readyForPickup}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 sm:h-12 sm:w-12">
					<PackageOpen size={18} class="text-pink-600 sm:hidden" />
					<PackageOpen size={24} class="hidden text-pink-600 sm:block" />
				</div>
			</div>
		</div>
	</div>
	
	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex" aria-label="Request tabs">
			<button
				onclick={() => activeTab = 'my-request'}
				class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium sm:text-sm {activeTab === 'my-request' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Request
				<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'my-request' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
					{tabCounts['my-request']}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'instructor-approved'}
				class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium sm:text-sm {activeTab === 'instructor-approved' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Approval
				<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'instructor-approved' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
					{tabCounts['instructor-approved']}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'active'}
				class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium sm:text-sm {activeTab === 'active' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Active
				<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'active' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
					{tabCounts.active}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'history'}
				class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium sm:text-sm {activeTab === 'history' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				History
				<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'history' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
					{tabCounts.history}
				</span>
			</button>
		</nav>
	</div>
	
	<div class="rounded-lg bg-white shadow">
		<div class="p-6">
	<!-- Search and Filter Bar -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="relative flex-1">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<Search size={16} class="text-gray-400" />
			</div>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search by ID, item, or purpose…"
				class="block h-10 w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm placeholder-gray-400 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-100"
			/>
		</div>
		<div class="flex items-center gap-2 shrink-0">
			<select
				bind:value={sortBy}
				class="h-10 min-w-30 rounded-xl border border-gray-300 bg-white px-3 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-100"
			>
				<option value="newest">Newest</option>
				<option value="oldest">Oldest</option>
				<option value="return-date">Return Date</option>
			</select>
			<button
				onclick={() => { searchQuery = ''; dateFilter = { from: '', to: '' }; sortBy = 'newest'; activeTab = 'my-request'; }}
				class="h-10 rounded-xl px-2 text-sm font-semibold text-pink-600 transition-colors hover:bg-pink-50 hover:text-pink-700"
			>
				Clear
			</button>
		</div>
	</div>
	
	<!-- Requests List -->
	<div class="mt-6">
		<div class="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
			<div class="flex min-w-0 items-center gap-2">
				<span class="text-sm font-semibold text-gray-700">
					{filteredRequests.length} {filteredRequests.length === 1 ? 'request' : 'requests'} found
				</span>
				<span class="hidden rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-500 ring-1 ring-gray-200 sm:inline-flex">
					{requestViewMode === 'card' ? 'Card view' : 'Table view'}
				</span>
			</div>
			<div class="flex flex-wrap items-center justify-end gap-2">
				<div class="flex overflow-hidden rounded-lg border border-gray-300">
					<button
						onclick={() => (requestViewMode = 'card')}
						aria-label="Card view"
						class="flex h-10 w-10 items-center justify-center text-sm transition-colors {requestViewMode === 'card' ? 'bg-pink-100 text-pink-700' : 'bg-white text-gray-600 hover:bg-gray-50'}"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
						</svg>
					</button>
					<button
						onclick={() => (requestViewMode = 'list')}
						aria-label="Table view"
						class="flex h-10 w-10 items-center justify-center border-l border-gray-300 text-sm transition-colors {requestViewMode === 'list' ? 'bg-pink-100 text-pink-700' : 'bg-white text-gray-600 hover:bg-gray-50'}"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
						</svg>
					</button>
				</div>
				<button 
					onclick={exportToCSV}
					class="inline-flex h-10 items-center gap-1.5 rounded-xl bg-pink-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-pink-700 shrink-0 sm:gap-2 sm:px-4 sm:text-sm"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
					</svg>
					<span class="hidden sm:inline">Export</span>
				</button>
				<a href="/student/request" class="inline-flex h-10 items-center gap-1.5 rounded-xl bg-pink-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-pink-700 shrink-0 sm:px-4 sm:text-sm">
					<Plus size={13} />
					New
				</a>
			</div>
		</div>
		
		<!-- Loading skeletons only show on first load when no requests exist -->
		{#if loading && requests.length === 0}
			<div class="space-y-4">
			{#each Array(3) as _, i}
				<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 border-l-4 border-gray-200">
					<div class="p-4 space-y-3">
						<!-- Header: ID + status stacked, then date -->
						<div class="flex flex-col gap-1">
							<div class="flex items-center gap-2">
								<Skeleton class="h-4 w-28" />
								<Skeleton class="h-5 w-24 rounded-full" />
							</div>
							<Skeleton class="h-3 w-20" />
						</div>
						<!-- Equipment chips label + chips -->
						<div class="space-y-1.5">
							<Skeleton class="h-3 w-32" />
							<div class="flex flex-wrap gap-1.5">
								{#each Array(i === 0 ? 2 : i === 1 ? 1 : 3) as _}
									<Skeleton class="h-6 w-20 rounded-md" />
								{/each}
							</div>
						</div>
						<!-- Metadata: stacked on mobile -->
						<div class="flex flex-col gap-1.5">
							<Skeleton class="h-3 w-36" />
							<Skeleton class="h-3 w-full max-w-50" />
							<Skeleton class="h-3 w-28" />
						</div>
					</div>
					<!-- Footer: just action button on the right -->
					<div class="flex justify-end border-t border-gray-100 bg-gray-50/60 px-4 py-3">
						<Skeleton class="h-7 w-24 rounded-lg" />
					</div>
				</div>
			{/each}
			</div>
		{:else}
		{#if requestViewMode === 'card'}
		<div style="min-height: 600px;">
		{#if paginatedRequests.length > 0}
		<div class="space-y-4">
		{#each paginatedRequests as request}
			{@const StatusIcon = getStatusIconComponent(request.status)}
			<div class="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 transition-all hover:shadow-md border-l-4 {getStatusBorderColor(request.status)}">

				<!-- Card Body -->
				<div class="p-4 sm:p-5">

					<!-- Header: ID · Status · Date + QR Icon -->
					<div class="flex items-start justify-between gap-3 mb-3">
						<div class="flex flex-col gap-1 flex-1 min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-mono text-sm font-bold tracking-widest text-gray-900">{request.id}</span>
							<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold {getStatusColor(request.status)}">
								<StatusIcon size={11} />
								{getStatusLabel(request.status)}
							</span>
						</div>
						<time class="text-[11px] text-gray-400">
							{new Date(request.requestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
						</time>
						</div>
						{#if ['approved', 'ready', 'picked-up', 'pending-return'].includes(request.status)}
							<button
								onclick={() => {
									selectedRequest = request;
									qrDataUrl = null;
									QRCode.toDataURL(request.rawId, {
										width: 240,
										margin: 2,
										color: { dark: '#111827', light: '#ffffff' },
										errorCorrectionLevel: 'H'
									}).then(url => { qrDataUrl = url; }).catch(() => {});
									showQrModal = true;
								}}
								class="shrink-0 rounded-lg p-2 text-pink-500 transition-colors hover:bg-pink-50 hover:text-pink-600 active:bg-pink-100"
								title="View QR Code"
							>
								<QrCode size={20} strokeWidth={2} />
							</button>
						{/if}
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
					<div class="mt-3 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1.5">
						<div class="flex items-center gap-1.5 text-xs text-gray-500">
							<CalendarDays size={13} class="shrink-0 text-gray-400" />
							<span>
								{new Date(request.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
								–
								{new Date(request.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
							</span>
						</div>
						<div class="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
							<FileText size={13} class="shrink-0 text-gray-400" />
							<span class="truncate">{request.purpose}</span>
						</div>
						<div class="flex items-center gap-1.5 text-xs text-gray-500">
							<UserCircle size={13} class="shrink-0 text-gray-400" />
							<span class="truncate">{request.instructor}</span>
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
				<div class="flex flex-col gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">

					<!-- Status hint -->
					<div class="text-xs">
						{#if request.status === 'ready'}
							<span class="flex items-center gap-1.5 font-medium text-emerald-700">
								<Info size={13} />
								Proceed to the custodian desk to collect your items
							</span>
						{:else if request.status === 'pending-return'}
							<span class="flex items-center gap-1.5 font-medium text-orange-600">
								<Clock size={13} />
								Awaiting custodian confirmation
							</span>
						{:else}
							<span class="hidden sm:block text-gray-300">—</span>
						{/if}
					</div>

					<!-- Action buttons -->
					<div class="flex items-center gap-2 self-end sm:self-auto">
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
		</div>
		{:else}
			<div style="min-height: 600px; display: flex; align-items: center; justify-content: center;">
				<div class="text-center">
					<ClipboardX size={40} class="mx-auto text-pink-600" />
					<h3 class="mt-2 text-sm font-medium text-gray-900">No requests found</h3>
					<p class="mt-1 text-sm text-gray-500">Get started by creating a new request.</p>
					<div class="mt-4">
						<a href="/student/request" class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700">
							<Plus size={16} />
							New Request
						</a>
					</div>
				</div>
			</div>
		{/if}
		</div>
		{:else}
		<div style="min-height: 600px;">
		{#if paginatedRequests.length > 0}
			<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
				<div class="hidden border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid md:grid-cols-[1fr_1.5fr_1fr_auto] md:items-center md:gap-3">
					<span>Request</span>
					<span>Items & Purpose</span>
					<span>Status</span>
					<span class="text-right">Actions</span>
				</div>
				<div class="divide-y divide-gray-100">
					{#each paginatedRequests as request}
						{@const StatusIcon = getStatusIconComponent(request.status)}
						<div class="grid gap-3 p-4 md:grid-cols-[1fr_1.5fr_1fr_auto] md:items-center md:gap-3">
							<div class="min-w-0">
								<p class="font-mono text-xs font-bold tracking-wider text-gray-900">{request.id}</p>
								<p class="mt-1 text-xs text-gray-500">{new Date(request.requestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
								<p class="mt-1 text-xs text-gray-500 truncate">
									{new Date(request.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
									-
									{new Date(request.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
								</p>
							</div>

							<div class="min-w-0">
								<div class="flex flex-wrap gap-1.5 mb-2">
									{#each request.items.slice(0, 3) as item}
										{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
										<span class="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
											{#if pic}
												<img src={pic} alt={item.name} class="h-4 w-4 rounded object-cover shrink-0" />
											{:else}
												<span class="h-3.5 w-3.5 shrink-0 overflow-hidden rounded"><ItemImagePlaceholder size="xs" /></span>
											{/if}
											<span class="truncate max-w-25">{item.name}</span>
										</span>
									{/each}
									{#if request.items.length > 3}
										<span class="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">+{request.items.length - 3}</span>
									{/if}
								</div>
								<p class="truncate text-sm font-medium text-gray-900">{request.purpose}</p>
								<p class="mt-0.5 truncate text-xs text-gray-500">{request.instructor}</p>
							</div>

							<div class="min-w-0">
								<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold {getStatusColor(request.status)}">
									<StatusIcon size={11} />
									{getStatusLabel(request.status)}
								</span>
								{#if request.status === 'ready'}
									<p class="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-700">
										<Info size={12} />
										Ready for pickup
									</p>
								{:else if request.status === 'pending-return'}
									<p class="mt-1.5 flex items-center gap-1 text-xs font-medium text-orange-600">
										<Clock size={12} />
										Awaiting confirmation
									</p>
								{:else if request.status === 'rejected' && request.rejectionReason}
									<p class="mt-1.5 text-xs text-red-600 line-clamp-1" title={request.rejectionReason}>
										{request.rejectionReason}
									</p>
								{/if}
							</div>

							<div class="flex flex-wrap items-center gap-2 md:justify-end">
								{#if ['approved', 'ready', 'picked-up', 'pending-return'].includes(request.status)}
									<button
										onclick={() => {
											selectedRequest = request;
											qrDataUrl = null;
											QRCode.toDataURL(request.rawId, {
												width: 240,
												margin: 2,
												color: { dark: '#111827', light: '#ffffff' },
												errorCorrectionLevel: 'H'
											}).then(url => { qrDataUrl = url; }).catch(() => {});
											showQrModal = true;
										}}
										class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-pink-200 bg-white text-pink-600 shadow-sm transition-colors hover:bg-pink-50"
										title="View QR Code"
									>
										<QrCode size={15} strokeWidth={2} />
									</button>
								{/if}
								<button
									onclick={() => openDetailModal(request)}
									class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
								>
									Details
								</button>
								{#if request.status === 'pending'}
									<button
										onclick={() => requestCancelConfirmation(request)}
										disabled={loadingCancel === request.rawId}
										class="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
									>
										{loadingCancel === request.rawId ? 'Cancelling...' : 'Cancel'}
									</button>
								{/if}
								{#if request.status === 'picked-up'}
									<button
										onclick={() => requestReturnConfirmation(request)}
										disabled={loadingReturn === request.rawId}
										class="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
									>
										{loadingReturn === request.rawId ? 'Processing...' : 'Return'}
									</button>
								{/if}
								{#if request.status === 'rejected'}
									<button class="rounded-lg border border-pink-200 bg-white px-3 py-1.5 text-xs font-medium text-pink-700 shadow-sm hover:bg-pink-50 transition-colors">
										Appeal
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div style="min-height: 600px; display: flex; align-items: center; justify-content: center;">
				<div class="text-center">
					<ClipboardX size={40} class="mx-auto text-pink-600" />
					<h3 class="mt-2 text-sm font-medium text-gray-900">
						{#if activeTab === 'my-request'}
							No pending requests
						{:else if activeTab === 'instructor-approved'}
							No approved requests
						{:else if activeTab === 'active'}
							No active requests
						{:else}
							No request history
						{/if}
					</h3>
					<p class="mt-1 text-sm text-gray-500">
						{#if activeTab === 'my-request'}
							Your newly submitted requests will appear here while waiting for instructor review.
						{:else if activeTab === 'instructor-approved'}
							Instructor-approved and ready-for-pickup requests will appear here.
						{:else if activeTab === 'active'}
							Borrowed and return-initiated requests will appear here.
						{:else}
							Returned, cancelled, and rejected requests are archived here.
						{/if}
					</p>
					{#if activeTab === 'my-request'}
						<div class="mt-4">
							<a href="/student/request" class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700">
								<Plus size={16} />
								New Request
							</a>
						</div>
					{/if}
				</div>
			</div>
		{/if}
		</div>
		{/if}
		{/if}
		
		<!-- Pagination -->
		{#if filteredRequests.length > 0 && totalPages > 1}
			<div class="mt-4 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 sm:px-6">
				<div class="flex flex-1 justify-between sm:hidden">
					<button
						onclick={() => currentPage = Math.max(1, currentPage - 1)}
						disabled={currentPage === 1}
						class="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						Previous
					</button>
					<button
						onclick={() => currentPage = Math.min(totalPages, currentPage + 1)}
						disabled={currentPage === totalPages}
						class="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						Next
					</button>
				</div>
				<div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
					<div>
						<p class="text-sm text-gray-700">
							Showing
							<span class="font-medium">{(currentPage - 1) * (requestViewMode === 'card' ? PAGE_SIZE_CARD : PAGE_SIZE_LIST) + 1}</span>
							to
							<span class="font-medium">{Math.min(currentPage * (requestViewMode === 'card' ? PAGE_SIZE_CARD : PAGE_SIZE_LIST), filteredRequests.length)}</span>
							of
							<span class="font-medium">{filteredRequests.length}</span>
							results
						</p>
					</div>
					<div>
						<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
							<button
								onclick={() => currentPage = Math.max(1, currentPage - 1)}
								disabled={currentPage === 1}
								class="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<span class="sr-only">Previous</span>
								<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
									<path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
								</svg>
							</button>
							
							{#if totalPages <= 7}
								{#each Array(totalPages) as _, i}
									<button
										onclick={() => currentPage = i + 1}
										class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {currentPage === i + 1 ? 'z-10 bg-pink-600 text-white focus:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600' : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'}"
									>
										{i + 1}
									</button>
								{/each}
							{:else}
								<button
									onclick={() => currentPage = 1}
									class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {currentPage === 1 ? 'z-10 bg-pink-600 text-white focus:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600' : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'}"
								>
									1
								</button>
								
								{#if currentPage > 3}
									<span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">...</span>
								{/if}
								
								{#each Array(totalPages) as _, i}
									{@const page = i + 1}
									{#if page > 1 && page < totalPages && Math.abs(page - currentPage) <= 1}
										<button
											onclick={() => currentPage = page}
											class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {currentPage === page ? 'z-10 bg-pink-600 text-white focus:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600' : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'}"
										>
											{page}
										</button>
									{/if}
								{/each}
								
								{#if currentPage < totalPages - 2}
									<span class="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">...</span>
								{/if}
								
								<button
									onclick={() => currentPage = totalPages}
									class="relative inline-flex items-center px-4 py-2 text-sm font-semibold {currentPage === totalPages ? 'z-10 bg-pink-600 text-white focus:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600' : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'}"
								>
									{totalPages}
								</button>
							{/if}
							
							<button
								onclick={() => currentPage = Math.min(totalPages, currentPage + 1)}
								disabled={currentPage === totalPages}
								class="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<span class="sr-only">Next</span>
								<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
									<path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
								</svg>
							</button>
						</nav>
					</div>
				</div>
			</div>
		{/if}
	</div>
		</div>
	</div>
</div>

<!-- Detail Modal -->
{#if showDetailModal && selectedRequest}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
			onclick={closeDetailModal}
			role="button"
			tabindex="0"
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') closeDetailModal(); }}
			aria-label="Close details modal"
		></div>
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
									<SelectedStatusIcon size={12} strokeWidth={2.5} class="sm:hidden" />
									<SelectedStatusIcon size={14} strokeWidth={2.5} class="hidden sm:block" />
									<span class="text-[10px] sm:text-xs font-bold">{getStatusLabel(selectedRequest.status)}</span>
								</div>
							</div>
						</div>
						<div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
							{#if ['approved', 'ready', 'picked-up', 'pending-return'].includes(selectedRequest.status)}
								<button 
									onclick={() => showQrModal = true}
									class="rounded-xl p-2 sm:p-2.5 text-pink-600 transition-all hover:bg-pink-50 active:scale-95"
									title="View QR Code"
								>
									<QrCode size={18} strokeWidth={2} class="sm:hidden" />
									<QrCode size={22} strokeWidth={2} class="hidden sm:block" />
								</button>
							{/if}
							<button 
								onclick={closeDetailModal} 
								class="rounded-xl p-2 sm:p-2.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95"
							>
								<X size={18} class="sm:hidden" />
								<X size={22} class="hidden sm:block" />
							</button>
						</div>
					</div>
				</div>
				
				<!-- Content -->
				<div class="max-h-[70vh] overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
					<div class="space-y-6 sm:space-y-8">
						
						<!-- Approval Timeline -->
						<div>
									<div class="rounded-2xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-4 sm:p-5">
								<!-- Timeline Container -->
								<div class="relative">
									<!-- SVG Background for connector lines -->
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
													x1="{x1}%" 
													y1="{y}" 
													x2="{x2}%" 
													y2="{y}" 
													stroke="{isCurrentCompleted ? '#ec4899' : '#e5e7eb'}" 
													stroke-width="2" 
													stroke-linecap="round"
												/>
											{/if}
										{/each}
									</svg>
									
									<!-- Timeline steps -->
									<div class="relative flex items-start justify-between gap-1 sm:gap-2" style="z-index: 1;">
										{#each getApprovalTimeline(selectedRequest) as step, idx}
											{@const isCompleted = step.status === 'completed'}
											{@const isPending = step.status === 'pending'}
											{@const isCancelled = step.status === 'cancelled'}
											{@const isRejected = step.status === 'rejected'}
											
											<div class="flex flex-col items-center flex-1">
												<!-- Icon Circle -->
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
														{:else if step.step === 'Instructor Approved' || step.step === 'Instructor Review'}
															<CheckCheck size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
															<CheckCheck size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
														{:else if step.step === 'Custodian Approved' || step.step === 'Custodian Approval'}
															<PackageCheck size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
															<PackageCheck size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
														{:else if step.step === 'Awaiting Pickup' || step.step === 'Pickup Confirmed'}
															<Truck size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
															<Truck size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
														{:else if step.step === 'Awaiting Return' || step.step === 'Returned'}
															<Home size={18} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden" />
															<Home size={20} class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} hidden sm:block" />
														{:else if step.step === 'Request Cancelled'}
															<CircleX size={18} class="text-slate-400 sm:hidden" />
															<CircleX size={20} class="text-slate-400 hidden sm:block" />
														{:else if step.step === 'Request Rejected'}
															<CircleX size={18} class="text-red-600 sm:hidden" />
															<CircleX size={20} class="text-red-600 hidden sm:block" />
														{:else}
															<Clock size={18} class="text-gray-400 animate-pulse sm:hidden" />
															<Clock size={20} class="text-gray-400 animate-pulse hidden sm:block" />
														{/if}
													</div>
												</div>
												
												<!-- Step Label -->
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
								
								<!-- Status Legend -->
								<div class="mt-4 pt-3 border-t border-gray-200 flex flex-wrap gap-3 justify-center text-[10px] sm:text-xs">
									<div class="flex items-center gap-1.5">
										<div class="h-2 w-2 rounded-full bg-pink-600"></div>
										<span class="text-gray-600">Completed</span>
									</div>
									<div class="flex items-center gap-1.5">
										<div class="h-2 w-2 rounded-full bg-gray-300"></div>
										<span class="text-gray-600">Pending</span>
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
										<CalendarDays size={14} class="text-pink-500 sm:hidden" />
										<CalendarDays size={16} class="text-pink-500 hidden sm:block" />
										<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Borrow Period</p>
									</div>
									<p class="text-sm sm:text-base font-bold text-gray-900">
										{new Date(selectedRequest.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(selectedRequest.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
									</p>
								</div>
								<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
									<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
										<FileText size={14} class="text-pink-500 sm:hidden" />
										<FileText size={16} class="text-pink-500 hidden sm:block" />
										<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Purpose</p>
									</div>
									<p class="text-sm sm:text-base font-bold text-gray-900 line-clamp-2">{selectedRequest.purpose}</p>
								</div>
								<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
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
									{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
									<div class="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-pink-200 hover:shadow-md">
										{#if pic}
											<img src={pic} alt={item.name} class="h-12 w-12 rounded-lg object-cover shrink-0 ring-1 ring-gray-100" />
										{:else}
											<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-gray-100">
												<ItemImagePlaceholder size="sm" />
											</div>
										{/if}
										<span class="text-sm font-semibold text-gray-900 group-hover:text-pink-600 transition-colors">{item.name}</span>
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
				<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-3 sm:px-8 sm:py-5 safe-area-bottom">
					<div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3">
						{#if selectedRequest.status === 'pending'}
							<button
								onclick={() => requestCancelConfirmation(selectedRequest)}
								disabled={loadingCancel === selectedRequest.rawId}
								class="rounded-xl bg-linear-to-r from-red-600 to-red-700 px-5 py-2.5 sm:px-6 sm:py-3 text-sm font-bold text-white shadow-sm transition-all hover:from-red-700 hover:to-red-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
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
							<div class="rounded-xl border-2 border-blue-200 bg-linear-to-br from-blue-50 to-blue-100/50 px-4 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm font-medium text-blue-900">
								<div class="flex items-center gap-2">
									<Info size={14} class="shrink-0 sm:hidden" />
									<Info size={16} class="shrink-0 hidden sm:block" />
									<span>{getReadyPickupMessage()}</span>
								</div>
							</div>
						{/if}
						
						{#if selectedRequest.status === 'rejected'}
							<button class="rounded-xl bg-linear-to-r from-pink-600 to-pink-700 px-5 py-2.5 sm:px-6 sm:py-3 text-sm font-bold text-white shadow-sm transition-all hover:from-pink-700 hover:to-pink-800 active:scale-[0.98]">
								Appeal Request
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- QR Code Modal -->
{#if showQrModal && selectedRequest && qrDataUrl}
	<div class="fixed inset-0 z-50 overflow-y-auto">
			<div
				class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
				onclick={() => showQrModal = false}
				role="button"
				tabindex="0"
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') showQrModal = false; }}
				aria-label="Close QR modal"
			></div>
		<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
			<div class="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 animate-scaleIn overflow-hidden">
				
				<!-- Header -->
				<div class="relative border-b border-gray-100 bg-linear-to-br from-pink-50 via-white to-purple-50 px-5 py-5 sm:px-6 sm:py-6">
					<div>
						<div class="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 shadow-sm ring-1 ring-gray-100">
							<QrCode size={16} class="text-pink-600" strokeWidth={2.5} />
							<span class="text-sm font-semibold text-gray-700">QR Code</span>
						</div>
						<h3 class="mt-3 text-lg sm:text-xl font-bold text-gray-900">Scan to Process</h3>
						<p class="mt-1 text-xs sm:text-sm text-gray-600">Present this code to the custodian</p>
					</div>
				</div>
				
				<!-- Content -->
				<div class="px-5 py-6 sm:px-6 sm:py-8 max-h-[70vh] overflow-y-auto">
					<div class="flex flex-col items-center space-y-5 sm:space-y-6">
						<!-- QR Code with decorative frame -->
						<div class="relative">
							<!-- Decorative corners -->
							<div class="absolute -left-2 -top-2 h-5 w-5 sm:h-6 sm:w-6 border-l-3 border-t-3 border-pink-500 rounded-tl-lg"></div>
							<div class="absolute -right-2 -top-2 h-5 w-5 sm:h-6 sm:w-6 border-r-3 border-t-3 border-pink-500 rounded-tr-lg"></div>
							<div class="absolute -left-2 -bottom-2 h-5 w-5 sm:h-6 sm:w-6 border-l-3 border-b-3 border-pink-500 rounded-bl-lg"></div>
							<div class="absolute -right-2 -bottom-2 h-5 w-5 sm:h-6 sm:w-6 border-r-3 border-b-3 border-pink-500 rounded-br-lg"></div>
							
							<!-- QR Code -->
							<div class="rounded-2xl bg-white p-4 sm:p-6 shadow-lg ring-1 ring-gray-100">
								<img src={qrDataUrl} alt="Request QR Code" class="h-48 w-48 sm:h-56 sm:w-56" />
							</div>
						</div>
						
						<!-- Request ID Badge -->
						<div class="w-full rounded-xl bg-linear-to-br from-gray-50 to-gray-100/50 p-3 sm:p-4 text-center ring-1 ring-gray-200/50">
							<p class="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1 sm:mb-1.5">Request ID</p>
							<p class="font-mono text-xl sm:text-2xl font-bold tracking-wider text-gray-900">{selectedRequest.id}</p>
						</div>
						
						<!-- Status Badge -->
						<div class="inline-flex items-center gap-2 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 {getStatusColor(selectedRequest.status)} ring-1 ring-black/5">
							<QrStatusIcon size={14} class="sm:hidden" />
							<QrStatusIcon size={16} class="hidden sm:block" />
							<span class="text-xs sm:text-sm font-semibold">{getStatusLabel(selectedRequest.status)}</span>
						</div>
						
						<!-- Instructions Card -->
						<div class="w-full rounded-xl border border-blue-200 bg-linear-to-br from-blue-50 to-blue-100/30 p-3 sm:p-4">
							<div class="flex gap-2.5 sm:gap-3">
								<div class="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-blue-500">
									<Info size={14} class="text-white sm:hidden" />
									<Info size={16} class="text-white hidden sm:block" />
								</div>
								<div class="flex-1 min-w-0">
									<p class="text-xs sm:text-sm font-medium text-blue-900 leading-relaxed">
										{#if selectedRequest.status === 'approved'}
											Show this QR code to the custodian to mark your request ready for pickup.
										{:else if selectedRequest.status === 'ready'}
											Show this QR code to the custodian to confirm your pickup.
										{:else if selectedRequest.status === 'picked-up'}
											Show this QR code to the custodian when returning your items.
										{:else if selectedRequest.status === 'pending-return'}
											Show this QR code to the custodian to complete your return.
										{:else}
											Show this QR code to the custodian to process your request.
										{/if}
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
				
				<!-- Footer -->
				<div class="border-t border-gray-100 bg-linear-to-br from-gray-50 to-white px-5 py-4 sm:px-6 sm:py-5 safe-area-bottom">
					<button
						onclick={() => showQrModal = false}
						class="w-full rounded-xl bg-linear-to-r from-gray-900 to-gray-800 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-gray-800 hover:to-gray-700 active:scale-[0.98]"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}