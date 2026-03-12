<script lang="ts">
import { onMount } from 'svelte';
import {
borrowRequestsAPI,
type BorrowRequestItem,
type BorrowRequestRealtimeEvent,
type BorrowRequestRecord,
type BorrowRequestStatus
} from '$lib/api/borrowRequests';
import { catalogAPI } from '$lib/api/catalog';
import { confirmStore } from '$lib/stores/confirm';
import { toastStore } from '$lib/stores/toast';
import ItemInspectionModal from '$lib/components/custodian/ItemInspectionModal.svelte';

type Tab = 'pending' | 'ready' | 'active' | 'unresolved' | 'history';

let activeTab = $state<Tab>('pending');
let showDetailModal = $state(false);
let showInspectionModal = $state(false);
let selectedRequest = $state<any>(null);
let requests = $state<any[]>([]);
let searchQuery = $state('');
let sortBy = $state<'date' | 'student' | 'status'>('date');
let openActionMenuFor = $state<string | null>(null);
let itemPictureCache = $state<Map<string, string>>(new Map());
let liveSyncActive = $state(false);
let inspectionItems = $state<BorrowRequestItem[]>([]);

let refreshInFlight = false;
let pendingRefresh = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function isCancelledRequest(status: BorrowRequestStatus, rejectionReason?: string): boolean {
return status === 'cancelled' || (status === 'rejected' && rejectionReason === 'Request cancelled by student');
}

function toUiStatus(status: BorrowRequestStatus, rejectionReason?: string): 'pending' | 'ready' | 'active' | 'missing' | 'history' {
switch (status) {
case 'approved_instructor': return 'pending';
case 'ready_for_pickup': return 'ready';
case 'borrowed': return 'active';
case 'pending_return': return 'active';
case 'missing': return 'unresolved';
case 'cancelled': return 'history';
case 'returned': return 'history';
case 'rejected': return 'history';
default: return 'history';
}
}

function getDisplayId(id: string): string {
return `REQ-${id.slice(-6).toUpperCase()}`;
}

function initials(name: string): string {
return name
.split(' ')
.filter(Boolean)
.slice(0, 2)
.map((part) => part[0]?.toUpperCase() || '')
.join('');
}

function inferItemImage(name: string): string {
const normalized = name.toLowerCase();
if (normalized.includes('knife')) return 'Knife';
if (normalized.includes('bowl')) return 'Bowl';
if (normalized.includes('scale')) return 'Scale';
if (normalized.includes('mixer')) return 'Mixer';
if (normalized.includes('processor')) return 'Processor';
return 'Item';
}

function formatDate(value: string): string {
const date = new Date(value);
if (Number.isNaN(date.getTime())) return value;
return date.toLocaleDateString();
}

function formatDateTime(value?: string): string | undefined {
if (!value) return undefined;
const date = new Date(value);
if (Number.isNaN(date.getTime())) return undefined;
return date.toLocaleString();
}

function mapRequest(record: BorrowRequestRecord): any {
const status = toUiStatus(record.status, record.rejectReason);
const studentName = record.student?.fullName || `Student ${record.studentId.slice(-6).toUpperCase()}`;
const now = new Date();
const isOverdue = ['borrowed', 'pending_return'].includes(record.status) && new Date(record.returnDate) < now;
const daysOverdue = isOverdue ? Math.max(1, Math.ceil((now.getTime() - new Date(record.returnDate).getTime()) / (1000 * 60 * 60 * 24))) : 0;
const damagedItemCount = record.items.filter((item) => item.inspection?.status === 'damaged').length;
const missingItemCount = record.items.filter((item) => item.inspection?.status === 'missing').length;

return {
rawId: record.id,
rawStatus: record.status,
rawItems: record.items,
id: getDisplayId(record.id),
student: {
name: studentName,
avatar: initials(studentName),
yearLevel: record.student?.yearLevel || 'N/A',
block: record.student?.block || 'N/A',
studentId: record.studentId.slice(-8).toUpperCase(),
email: record.student?.email || 'N/A'
},
items: record.items.map((item) => ({
name: item.name,
image: inferItemImage(item.name),
itemId: item.itemId,
picture: item.picture || null,
code: item.itemId.slice(-6).toUpperCase(),
quantity: item.quantity
})),
status,
requestDate: record.createdAt,
borrowDate: record.borrowDate,
returnDate: record.returnDate,
purpose: record.purpose,
daysOverdue: isOverdue ? daysOverdue : 0,
isOverdue,
releasedDate: formatDateTime(record.releasedAt),
pickedUpDate: formatDateTime(record.pickedUpAt),
returnedDate: formatDateTime(record.returnedAt),
missingDate: formatDateTime(record.missingAt),
lastReminderAt: formatDateTime(record.lastReminderAt),
reminderCount: record.reminderCount || 0,
approvedBy: record.instructor?.fullName || 'Instructor',
rejectionReason: record.rejectReason,
approvedDate: formatDateTime(record.approvedAt),
damagedItemCount,
missingItemCount
};
}

function getErrorMessage(error: unknown, fallback: string): string {
if (error instanceof Error && error.message) {
return error.message;
}
return fallback;
}

async function markReady(rawId: string): Promise<void> {
closeActionMenu();

const confirmed = await confirmStore.confirm({
title: 'Release for Pickup',
message: 'Mark this request as ready for student pickup?',
type: 'info',
confirmText: 'Mark Ready',
cancelText: 'Cancel'
});

if (!confirmed) return;

try {
await borrowRequestsAPI.release(rawId);
await loadRequests(true);
toastStore.success('Request marked ready for student pickup.');
} catch (error) {
console.error('Failed to mark request as ready for pickup', error);
toastStore.error(getErrorMessage(error, 'Failed to mark request as ready for pickup.'));
}
}

async function confirmPickup(rawId: string): Promise<void> {
closeActionMenu();

const confirmed = await confirmStore.confirm({
title: 'Confirm Pickup',
message: 'Confirm that the student has successfully picked up all released items?',
type: 'warning',
confirmText: 'Confirm Pickup',
cancelText: 'Cancel'
});

if (!confirmed) return;

try {
await borrowRequestsAPI.pickup(rawId);
await loadRequests(true);
toastStore.success('Pickup confirmed successfully.');
} catch (error) {
console.error('Failed to confirm item pickup', error);
toastStore.error(getErrorMessage(error, 'Failed to confirm item pickup.'));
}
}

async function confirmReturn(rawId: string): Promise<void> {
closeActionMenu();
	
	// Open inspection modal instead of directly confirming
	const request = requests.find(r => r.rawId === rawId);
	if (request) {
		selectedRequest = request;
		inspectionItems = buildInspectionItems(request);
		showInspectionModal = true;
	}
}

async function handleInspectionSubmit(
	inspections: Array<{
		itemId: string;
		status: 'good' | 'damaged' | 'missing';
		notes: string;
		unitPrice: number;
	}>
): Promise<void> {
	if (!selectedRequest) return;
	
	try {
		const result = await borrowRequestsAPI.inspectItems(selectedRequest.rawId, inspections);
		await loadRequests(true);
		showInspectionModal = false;
		selectedRequest = null;
		
		if (result.obligationsCreated > 0) {
			toastStore.success(
				`Inspection complete. ${result.obligationsCreated} financial obligation(s) created for damaged/missing items.`
			);
		} else {
			toastStore.success('All items returned intact. Inventory updated successfully.');
		}
	} catch (error) {
		console.error('Failed to submit inspection', error);
		toastStore.error(getErrorMessage(error, 'Failed to submit inspection.'));
		throw error;
	}
}

async function markMissing(rawId: string): Promise<void> {
	closeActionMenu();

	const confirmed = await confirmStore.danger(
		'Mark this request as missing? This should only be used when an item cannot be accounted for after verification.',
		'Mark Request as Missing',
		'Mark Missing',
		'Cancel'
	);

	if (!confirmed) return;
try {
	await borrowRequestsAPI.markMissing(rawId);
	await loadRequests(true);
	toastStore.warning('Request marked as missing for escalation and follow-up.');
} catch (error) {
	console.error('Failed to mark item as missing', error);
	toastStore.error(getErrorMessage(error, 'Failed to mark item as missing.'));
}
}

async function sendReminder(rawId: string): Promise<void> {
closeActionMenu();

const confirmed = await confirmStore.confirm({
title: 'Send Overdue Reminder',
message: 'Send an overdue reminder for this request now?',
type: 'default',
confirmText: 'Send Reminder',
cancelText: 'Cancel'
});

if (!confirmed) return;

try {
	const result = await borrowRequestsAPI.sendOverdueReminder(rawId);
	await loadRequests(true);
	toastStore.info(`${result.message} (total reminders: ${result.reminderCount})`);
} catch (error) {
	console.error('Failed to send overdue reminder', error);
	toastStore.error(getErrorMessage(error, 'Failed to send overdue reminder.'));
}
}

async function loadRequests(forceRefresh = false): Promise<void> {
try {
const response = await borrowRequestsAPI.list({}, { forceRefresh });
requests = response.requests
.filter((record) => record.status !== 'pending_instructor')
.map(mapRequest);
await backfillItemPictures();
	syncSelectedRequestWithLatestData();
} catch (error) {
console.error('Failed to load custodian requests', error);
requests = [];
}
}

function buildInspectionItems(request: any): BorrowRequestItem[] {
	const requestItemById = new Map<string, any>();
	for (const item of request.items ?? []) {
		requestItemById.set(item.itemId, item);
	}

	return (request.rawItems ?? []).map((item: BorrowRequestItem) => {
		const fallbackPicture =
			requestItemById.get(item.itemId)?.picture ??
			itemPictureCache.get(item.itemId) ??
			null;

		return {
			...item,
			picture: item.picture ?? fallbackPicture
		};
	});
}

function syncSelectedRequestWithLatestData(): void {
	if (!selectedRequest) return;
	const fresh = requests.find((request) => request.rawId === selectedRequest.rawId);
	if (fresh) {
		selectedRequest = fresh;
		if (showInspectionModal) {
			inspectionItems = buildInspectionItems(fresh);
		}
	} else {
		showDetailModal = false;
		showInspectionModal = false;
		selectedRequest = null;
		inspectionItems = [];
	}
}

async function refreshRequests(): Promise<void> {
	if (refreshInFlight) {
		pendingRefresh = true;
		return;
	}

	refreshInFlight = true;
	try {
		borrowRequestsAPI.invalidateCache();
		await loadRequests(true);
	} finally {
		refreshInFlight = false;
		if (pendingRefresh) {
			pendingRefresh = false;
			await refreshRequests();
		}
	}
}

function scheduleRefresh(): void {
	if (refreshTimer !== null) clearTimeout(refreshTimer);
	refreshTimer = setTimeout(() => {
		refreshTimer = null;
		refreshRequests();
	}, 250);
}

async function backfillItemPictures(): Promise<void> {
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
		if (selectedRequest && showInspectionModal) {
			inspectionItems = buildInspectionItems(selectedRequest);
		}
	} catch {
		// Keep graceful fallback when catalog pictures are unavailable.
	}
}

onMount(() => {
	void loadRequests();

	const unsubscribeSSE = borrowRequestsAPI.subscribeToChanges((_event: BorrowRequestRealtimeEvent) => {
		scheduleRefresh();
	});
	liveSyncActive = true;

	const pollInterval = setInterval(() => {
		void refreshRequests();
	}, 30_000);

	const onFocus = () => {
		void refreshRequests();
	};
	const onVisible = () => {
		if (document.visibilityState === 'visible') {
			void refreshRequests();
		}
	};

	window.addEventListener('focus', onFocus);
	document.addEventListener('visibilitychange', onVisible);

	return () => {
		unsubscribeSSE();
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		clearInterval(pollInterval);
		window.removeEventListener('focus', onFocus);
		document.removeEventListener('visibilitychange', onVisible);
	};
});

const filteredRequests = $derived(
requests
.filter(req => (activeTab === 'history' ? req.status === 'history' : req.status === activeTab))
.filter(req => {
if (!searchQuery) return true;
const query = searchQuery.toLowerCase();
return (
req.student.name.toLowerCase().includes(query) ||
req.id.toLowerCase().includes(query) ||
req.items.some((item: any) => item.name.toLowerCase().includes(query))
);
})
.sort((a, b) => {
if (sortBy === 'date') {
return new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime();
} else if (sortBy === 'student') {
return a.student.name.localeCompare(b.student.name);
}
return a.status.localeCompare(b.status);
})
);

const stats = $derived({
totalRequests: requests.length,
pendingCount: requests.filter(r => r.status === 'pending').length,
readyCount: requests.filter(r => r.status === 'ready').length,
activeCount: requests.filter(r => r.status === 'active').length,
overdueCount: requests.filter(r => r.isOverdue).length
});

const tabCounts = $derived({
pending: requests.filter(r => r.status === 'pending').length,
ready: requests.filter(r => r.status === 'ready').length,
active: requests.filter(r => r.status === 'active').length,
unresolved: requests.filter(r => r.status === 'unresolved').length,
history: requests.filter(r => r.status === 'history').length
});

function openDetailModal(request: any) {
closeActionMenu();
selectedRequest = request;
showDetailModal = true;
}

function closeDetailModal() {
showDetailModal = false;
selectedRequest = null;
}

function toggleActionMenu(rawId: string): void {
openActionMenuFor = openActionMenuFor === rawId ? null : rawId;
}

function closeActionMenu(): void {
openActionMenuFor = null;
}

function getStatusBadge(status: Tab, rawStatus?: BorrowRequestStatus, rejectionReason?: string) {
switch (status) {
case 'pending':
return { text: 'Pending Preparation', color: 'bg-blue-100 text-blue-800' };
case 'ready':
return { text: 'Ready for Pickup', color: 'bg-green-100 text-green-800' };
case 'active':
return rawStatus === 'pending_return'
? { text: 'Return Requested', color: 'bg-orange-100 text-orange-800' }
: { text: 'On Loan', color: 'bg-purple-100 text-purple-800' };
case 'unresolved':
return { text: 'Unresolved', color: 'bg-amber-100 text-amber-800' };
case 'history':
return isCancelledRequest(rawStatus ?? 'returned', rejectionReason)
? { text: 'Cancelled', color: 'bg-slate-100 text-slate-800' }
: rawStatus === 'rejected'
? { text: 'Rejected', color: 'bg-red-100 text-red-800' }
: { text: 'Completed', color: 'bg-gray-100 text-gray-800' };
default:
return { text: status, color: 'bg-gray-100 text-gray-800' };
}
}

function getCardBorderColor(status: Tab, rawStatus?: BorrowRequestStatus, rejectionReason?: string): string {
switch (status) {
case 'pending':
return 'border-blue-500';
case 'ready':
return 'border-green-500';
case 'active':
return rawStatus === 'pending_return' ? 'border-orange-500' : 'border-purple-500';
case 'unresolved':
return 'border-rose-500';
case 'history':
return isCancelledRequest(rawStatus ?? 'returned', rejectionReason) ? 'border-slate-400' : rawStatus === 'rejected' ? 'border-red-500' : 'border-gray-300';
default:
return 'border-gray-300';
}
}

function getRequestHint(status: Tab, rawStatus?: BorrowRequestStatus, rejectionReason?: string): { text: string; color: string } {
switch (status) {
case 'pending':
return {
text: 'Prepare the requested equipment and release it when the request is ready for pickup.',
color: 'text-blue-700'
};
case 'ready':
return {
text: 'Items are staged for handoff and waiting for student pickup confirmation.',
color: 'text-green-700'
};
case 'active':
if (rawStatus === 'pending_return') {
return {
text: 'The student has initiated the return. Inspect the items before completing check-in.',
color: 'text-orange-700'
};
}

return {
text: 'This equipment is currently on loan and should be monitored until return.',
color: 'text-purple-700'
};
case 'unresolved':
return {
text: 'This request has open incident cases. Coordinate with the student to resolve outstanding damage or missing items.',
color: 'text-rose-700'
};
case 'history':
return isCancelledRequest(rawStatus ?? 'returned', rejectionReason)
? {
text: 'This request was cancelled by the student before fulfillment and archived in history.',
color: 'text-slate-700'
}
: rawStatus === 'rejected'
? {
text: 'This request was closed without fulfillment and has been archived.',
color: 'text-red-700'
}
: {
text: 'This request has been completed and archived in the request history.',
color: 'text-gray-600'
};
default:
return { text: '', color: 'text-gray-500' };
}
}
</script>

<svelte:head>
	<title>Equipment Management - Custodian Portal</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Equipment Management</h1>
		<p class="mt-1 text-sm text-gray-500">Prepare, distribute, and receive borrowed equipment</p>
	</div>
	
	<!-- Statistics Cards -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
		<div class="rounded-lg bg-white p-5 shadow">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Requests</p>
					<p class="mt-2 text-3xl font-semibold text-gray-900">{stats.totalRequests}</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
					<svg class="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
					</svg>
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-5 shadow">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Pending Preparation</p>
					<p class="mt-2 text-3xl font-semibold text-blue-600">{stats.pendingCount}</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
					<svg class="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
					</svg>
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-5 shadow">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Ready for Pickup</p>
					<p class="mt-2 text-3xl font-semibold text-green-600">{stats.readyCount}</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
					<svg class="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-5 shadow">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Active</p>
					<p class="mt-2 text-3xl font-semibold text-purple-600">{stats.activeCount}</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
					<svg class="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
					</svg>
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-5 shadow">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Items Overdue</p>
					<p class="mt-2 text-3xl font-semibold text-red-600">{stats.overdueCount}</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
					<svg class="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
				</div>
			</div>
		</div>
	</div>
	
	<!-- Tabs Navigation -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6 overflow-x-auto">
			<button
				onclick={() => activeTab = 'pending'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'pending' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Pending Preparation
				<span class="ml-2 rounded-full {activeTab === 'pending' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs">
					{tabCounts.pending}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'ready'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'ready' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Ready for Pickup
				<span class="ml-2 rounded-full {activeTab === 'ready' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs">
					{tabCounts.ready}
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
				onclick={() => activeTab = 'unresolved'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'unresolved' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Unresolved
				{#if tabCounts.unresolved > 0}
					<span class="ml-2 rounded-full {activeTab === 'unresolved' ? 'bg-rose-100 text-rose-700' : 'bg-rose-50 text-rose-600'} px-2 py-0.5 text-xs font-semibold">
						{tabCounts.unresolved}
					</span>
				{:else}
					<span class="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">0</span>
				{/if}
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
					<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
					</svg>
				</div>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search by student, request ID, or item..."
					class="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
				/>
			</div>
		</div>
		
		<div class="flex items-center gap-3">
			<select
				bind:value={sortBy}
				class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
			>
				<option value="date">Sort by Date</option>
				<option value="student">Sort by Student</option>
				<option value="status">Sort by Status</option>
			</select>
			
			<button class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700">
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
				</svg>
				Export
			</button>
		</div>
	</div>
	
	<!-- Request Cards -->
	<div class="space-y-4">
		<div class="flex items-center justify-between rounded-lg bg-gray-50 p-3">
			<span class="text-sm font-medium text-gray-700">
				{filteredRequests.length} {filteredRequests.length === 1 ? 'request' : 'requests'} found
			</span>
		</div>
		
		{#each filteredRequests as request}
			<div class="overflow-hidden rounded-xl border-l-4 bg-white shadow-sm ring-1 ring-gray-200 transition-all hover:shadow-md {getCardBorderColor(request.status, request.rawStatus, request.rejectionReason)}">
				<div class="p-5">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex min-w-0 flex-wrap items-center gap-2">
								<span class="font-mono text-sm font-bold tracking-widest text-gray-900">{request.id}</span>
								<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold {getStatusBadge(request.status, request.rawStatus, request.rejectionReason).color}">
									<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
									{getStatusBadge(request.status, request.rawStatus, request.rejectionReason).text}
								</span>
								{#if request.status === 'unresolved'}
									{#if request.missingItemCount > 0}
										<span class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-200">
											<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
											{request.missingItemCount} Missing
										</span>
									{/if}
									{#if request.damagedItemCount > 0}
										<span class="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 ring-1 ring-rose-200">
											<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
											{request.damagedItemCount} Damaged
										</span>
									{/if}
									{#if request.missingItemCount === 0 && request.damagedItemCount === 0}
										<span class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-200">
											<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
											Missing
										</span>
									{/if}
								{/if}
							</div>

							<div class="mt-4 flex items-start gap-3">
								<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pink-100 font-semibold text-pink-700">
									{request.student.avatar}
								</div>
								<div class="min-w-0">
									<h3 class="text-lg font-semibold text-gray-900">{request.student.name}</h3>
									<p class="text-sm text-gray-500">{request.student.yearLevel} &bull; Block {request.student.block}</p>
									<p class="mt-1 text-xs text-gray-400">Student ID {request.student.studentId}</p>
								</div>
							</div>
						</div>

						<time class="shrink-0 whitespace-nowrap text-xs text-gray-400">
							{new Date(request.requestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
						</time>
					</div>

					<div class="mt-4">
						<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Equipment Requested</p>
						<div class="flex flex-wrap gap-1.5">
							{#each request.items as item}
								{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
								<span class="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
									{#if pic}
										<img src={pic} alt={item.name} class="h-4 w-4 rounded object-cover shrink-0" loading="lazy" />
									{:else}
										<svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7"/>
										</svg>
									{/if}
									<span class="truncate">{item.name}</span>
									<span class="text-gray-400">x{item.quantity}</span>
								</span>
							{/each}
						</div>
					</div>

					<div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
						<div class="flex items-center gap-1.5 text-xs text-gray-500">
							<svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2z"/>
							</svg>
							<span>
								{new Date(request.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
								-
								{new Date(request.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
							</span>
						</div>
						<div class="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
							<svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
							</svg>
							<span class="truncate max-w-[260px]">{request.purpose}</span>
						</div>
						<div class="flex items-center gap-1.5 text-xs text-gray-500">
							<svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							<span>{request.approvedBy}</span>
						</div>
					</div>

					{#if request.isOverdue}
						<div class="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
							<svg class="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							<div>
								<p class="text-sm font-medium text-red-800">
									{request.daysOverdue} {request.daysOverdue === 1 ? 'day' : 'days'} overdue
								</p>
								<p class="mt-0.5 text-xs text-red-700">
									Due {new Date(request.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
								</p>
							</div>
						</div>
					{/if}

					{#if request.status !== 'pending'}
						<div class="mt-4 rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3">
							<p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Workflow</p>
							<div class="mt-2 flex flex-wrap gap-2">
								{#if request.approvedDate}
									<span class="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs text-gray-600 ring-1 ring-gray-200">
										Approved: {request.approvedDate}
									</span>
								{/if}
								{#if request.releasedDate}
									<span class="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs text-gray-600 ring-1 ring-gray-200">
										Released: {request.releasedDate}
									</span>
								{/if}
								{#if request.pickedUpDate}
									<span class="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs text-gray-600 ring-1 ring-gray-200">
										Picked up: {request.pickedUpDate}
									</span>
								{/if}
								{#if request.returnedDate}
									<span class="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs text-gray-600 ring-1 ring-gray-200">
										Returned: {request.returnedDate}
									</span>
								{/if}
								{#if request.missingDate}
									<span class="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs text-rose-700 ring-1 ring-rose-200">
										Unresolved: {request.missingDate}
									</span>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<div class="border-t border-gray-100 bg-gray-50/60 px-5 py-3">
					<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div class="min-w-0">
							<p class="text-xs font-medium {getRequestHint(request.status, request.rawStatus, request.rejectionReason).color}">{getRequestHint(request.status, request.rawStatus, request.rejectionReason).text}</p>
							{#if request.lastReminderAt}
								<p class="mt-1 text-xs text-gray-500">
									Last reminder sent on {request.lastReminderAt}.
								</p>
							{:else if request.reminderCount > 0}
								<p class="mt-1 text-xs text-gray-500">
									{request.reminderCount} reminder{request.reminderCount === 1 ? '' : 's'} sent.
								</p>
							{/if}
						</div>

						<div class="relative flex flex-wrap items-center gap-2 lg:justify-end">
							<button
								onclick={() => openDetailModal(request)}
								class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
							>
								View Details
							</button>
							{#if request.status === 'pending'}
								<button
									onclick={() => markReady(request.rawId)}
									class="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
								>
									Mark Ready
								</button>
							{/if}
							{#if request.status === 'ready'}
								<button
									onclick={() => confirmPickup(request.rawId)}
									class="rounded-lg bg-pink-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-pink-700"
								>
									Confirm Pickup
								</button>
							{/if}
							{#if request.status === 'active' && request.rawStatus === 'pending_return'}
								<button
									onclick={() => {
										closeActionMenu();
										confirmReturn(request.rawId);
									}}
									class="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-orange-700"
								>
									Confirm Return
								</button>
							{/if}
							{#if request.status === 'active'}
								<button
									onclick={() => toggleActionMenu(request.rawId)}
									class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
									aria-label="More actions"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5h.01M12 12h.01M12 19h.01"/>
									</svg>
								</button>
							{/if}

							{#if request.status === 'active' && openActionMenuFor === request.rawId}
								<div class="absolute right-0 top-full z-10 mt-2 w-48 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
									<button
										onclick={() => {
											closeActionMenu();
											markMissing(request.rawId);
										}}
										class="flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"
									>
										Mark Missing
									</button>
									{#if request.isOverdue}
										<button
											onclick={() => {
												closeActionMenu();
												sendReminder(request.rawId);
											}}
											class="flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"
										>
											Send Reminder
										</button>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/each}
		
		{#if filteredRequests.length === 0}
			<div class="py-12 text-center">
				<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
				</svg>
				<h3 class="mt-4 text-lg font-medium text-gray-900">
					{#if activeTab === 'pending'}
						No pending requests
					{:else if activeTab === 'ready'}
						No items ready for pickup
					{:else if activeTab === 'active'}
						No active loans
					{:else if activeTab === 'missing'}
						No missing items
					{:else}
						No request history
					{/if}
				</h3>
				<p class="mt-2 text-sm text-gray-500">
					{#if activeTab === 'pending'}
						Requests approved by instructors will appear here for your action.
					{:else if activeTab === 'ready'}
						Items that have been released and are ready for student pickup will appear here.
					{:else if activeTab === 'active'}
						Currently borrowed items will be listed here when students pick them up.
					{:else if activeTab === 'missing'}
						Items reported as missing will be tracked here.
					{:else}
						Completed, cancelled, returned, and rejected requests will be archived here.
					{/if}
				</p>
			</div>
		{/if}
	</div>
</div>

<!-- Detail Modal -->
{#if showDetailModal && selectedRequest}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px]" onclick={closeDetailModal}></div>
		<div class="flex min-h-full items-center justify-center p-4 md:p-6">
			<div class="relative w-full max-w-6xl overflow-hidden rounded-2xl border border-white/50 bg-white/85 shadow-2xl backdrop-blur-md">
				<div class="border-b border-gray-200/80 bg-white/55 px-6 py-4 backdrop-blur-sm">
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">Request Details - {selectedRequest.id}</h3>
						<button onclick={closeDetailModal} class="text-gray-400 hover:text-gray-500">
							<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					</div>
				</div>

				<div class="grid max-h-[70vh] grid-cols-1 overflow-y-auto lg:grid-cols-2">
					<div class="space-y-6 border-gray-200/70 p-6 lg:border-r">
						<div>
							<h4 class="mb-3 text-sm font-medium text-gray-700">Student Information</h4>
							<div class="rounded-xl border border-white/70 bg-white/55 p-4 backdrop-blur-sm">
								<div class="mb-4 flex items-center gap-3">
									<div class="flex h-16 w-16 items-center justify-center rounded-full bg-pink-100 text-xl font-semibold text-pink-700">
										{selectedRequest.student.avatar}
									</div>
									<div>
										<p class="font-semibold">{selectedRequest.student.name}</p>
										<p class="text-sm text-gray-600">{selectedRequest.student.studentId}</p>
										<p class="text-xs text-gray-500">{selectedRequest.student.email}</p>
									</div>
								</div>
							</div>
						</div>

						<div>
							<h4 class="mb-3 text-sm font-medium text-gray-700">Requested Items</h4>
							<div class="space-y-2">
								{#each selectedRequest.items as item}
									{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
									<div class="flex items-center gap-3 rounded-xl border border-white/70 bg-white/55 p-3 backdrop-blur-sm">
										{#if pic}
											<img src={pic} alt={item.name} class="h-10 w-10 rounded object-cover" loading="lazy" />
										{:else}
											<div class="flex h-10 w-10 items-center justify-center rounded bg-gray-100">
												<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7"/>
												</svg>
											</div>
										{/if}
										<div>
											<p class="text-sm font-medium">{item.name}</p>
											<p class="text-xs text-gray-500">{item.code} • Qty: {item.quantity}</p>
										</div>
									</div>
								{/each}
							</div>
						</div>

						<div>
							<h4 class="mb-3 text-sm font-medium text-gray-700">Request Details</h4>
							<div class="space-y-3 rounded-xl border border-white/70 bg-white/55 p-4 backdrop-blur-sm">
								<div>
									<p class="text-xs font-medium text-gray-500">Borrow Period</p>
									<p class="mt-1 text-sm">{new Date(selectedRequest.borrowDate).toLocaleDateString()} - {new Date(selectedRequest.returnDate).toLocaleDateString()}</p>
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500">Purpose</p>
									<p class="mt-1 text-sm">{selectedRequest.purpose}</p>
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500">Approved By</p>
									<p class="mt-1 text-sm">{selectedRequest.approvedBy}</p>
								</div>
							</div>
						</div>
					</div>

					<div class="space-y-6 bg-white/35 p-6">
						<div>
							<h4 class="mb-3 text-sm font-medium text-gray-700">Workflow Timeline</h4>
							<div class="space-y-3 rounded-xl border border-white/70 bg-white/65 p-4 backdrop-blur-sm">
								{#if selectedRequest.approvedDate}
									<div class="flex items-center gap-2 text-sm">
										<span class="text-green-600">✓</span>
										<span class="text-gray-600">Approved by {selectedRequest.approvedBy}</span>
										<span class="ml-auto text-xs text-gray-500">{selectedRequest.approvedDate}</span>
									</div>
								{/if}
								{#if selectedRequest.releasedDate}
									<div class="flex items-center gap-2 text-sm">
										<span class="text-green-600">✓</span>
										<span class="text-gray-600">Released for pickup</span>
										<span class="ml-auto text-xs text-gray-500">{selectedRequest.releasedDate}</span>
									</div>
								{/if}
								{#if selectedRequest.pickedUpDate}
									<div class="flex items-center gap-2 text-sm">
										<span class="text-green-600">✓</span>
										<span class="text-gray-600">Picked up by student</span>
										<span class="ml-auto text-xs text-gray-500">{selectedRequest.pickedUpDate}</span>
									</div>
								{/if}
								{#if selectedRequest.returnedDate}
									<div class="flex items-center gap-2 text-sm">
										<span class="text-green-600">✓</span>
										<span class="text-gray-600">Returned by student</span>
										<span class="ml-auto text-xs text-gray-500">{selectedRequest.returnedDate}</span>
									</div>
								{/if}
								{#if selectedRequest.missingDate}
									<div class="flex items-center gap-2 text-sm">
										<span class="text-rose-600">⚠</span>
										<span class="text-gray-600">Flagged as unresolved</span>
										<span class="ml-auto text-xs text-gray-500">{selectedRequest.missingDate}</span>
									</div>
								{/if}
							</div>
						</div>

						<div>
							<h4 class="mb-3 text-sm font-medium text-gray-700">Status Notes</h4>
							<div class="rounded-xl border border-white/70 bg-white/65 p-4 text-sm text-gray-600 backdrop-blur-sm">
								{#if selectedRequest.rejectionReason}
									<p>{selectedRequest.rejectionReason}</p>
								{:else if selectedRequest.status === 'pending'}
									<p>Request is awaiting custodian preparation for release.</p>
								{:else if selectedRequest.status === 'ready'}
									<p>Items are ready and waiting for student pickup confirmation.</p>
								{:else if selectedRequest.status === 'active'}
									<p>Request is currently active. Continue monitoring until return is completed.</p>
								{:else}
									<p>This request is archived in history with no pending custodian action.</p>
								{/if}
							</div>
						</div>
					</div>
				</div>

				<div class="border-t border-gray-200/80 bg-white/55 px-6 py-4 backdrop-blur-sm">
					<div class="flex justify-end">
						<button onclick={closeDetailModal} class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
							Close
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Item Inspection Modal -->
{#if showInspectionModal && selectedRequest}
	<ItemInspectionModal
		items={inspectionItems}
		requestId={selectedRequest.rawId}
		onSubmit={handleInspectionSubmit}
		onCancel={() => {
			showInspectionModal = false;
			selectedRequest = null;
			inspectionItems = [];
		}}
	/>
{/if}

