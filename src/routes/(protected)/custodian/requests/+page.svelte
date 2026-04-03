<script lang="ts">
import { onMount } from 'svelte';
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { borrowRequestsAPI,
type BorrowRequestItem,
type BorrowRequestRealtimeEvent,
type BorrowRequestRecord,
type BorrowRequestStatus
} from '$lib/api/borrowRequests';
import { catalogAPI } from '$lib/api/catalog';
import { confirmStore } from '$lib/stores/confirm';
import { toastStore } from '$lib/stores/toast';
import ItemInspectionModal from '$lib/components/custodian/ItemInspectionModal.svelte';
import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
import { replacementObligationsAPI } from '$lib/api/replacementObligations';

type Tab = 'pending' | 'ready' | 'active' | 'unresolved' | 'history';
type HistorySubTab = 'all' | 'completed' | 'resolved' | 'cancelled';

let activeTab = $state<Tab>('pending');
let historySubTab = $state<HistorySubTab>('all');
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
let handledScanToken = $state('');

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
case 'resolved': return 'history';
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

function formatDateTimeShort(value: string): string {
const date = new Date(value);
if (Number.isNaN(date.getTime())) return value;
return date.toLocaleString('en-US', { 
	month: 'short', 
	day: 'numeric', 
	year: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
	hour12: true
});
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
	avatarUrl: record.student?.profilePhotoUrl || null,
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
resolvedDate: formatDateTime(record.resolvedAt),
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
		replacementQuantity: number;
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
				`Inspection complete. ${result.obligationsCreated} replacement obligation(s) created for damaged or missing items.`
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
	await maybeOpenScannedRequestFromUrl();
	syncSelectedRequestWithLatestData();
} catch (error) {
console.error('Failed to load custodian requests', error);
requests = [];
}
}

async function maybeOpenScannedRequestFromUrl(): Promise<void> {
	const scanId =
		$page.url.searchParams.get('requestId')?.trim() ??
		$page.url.searchParams.get('scan')?.trim() ??
		'';

	if (!scanId) {
		handledScanToken = '';
		return;
	}

	if (handledScanToken === scanId) return;

	try {
		let target = requests.find((request) => request.rawId === scanId) ?? null;

		if (!target) {
			const record = await borrowRequestsAPI.getById(scanId);
			target = mapRequest(record);
		}

		if (!target) {
			toastStore.error('Scanned request could not be found.', 'QR Scan');
			return;
		}

		activeTab = target.status;
		openDetailModal(target);
	} catch {
		toastStore.error('Scanned request could not be found.', 'QR Scan');
	} finally {
		handledScanToken = scanId;
		clearScanQueryFromUrl();
	}
}

function clearScanQueryFromUrl(): void {
	const url = new URL($page.url.href);
	if (!url.searchParams.has('requestId') && !url.searchParams.has('scan')) return;

	url.searchParams.delete('requestId');
	url.searchParams.delete('scan');
	const search = url.searchParams.toString();
	const next = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
	void goto(next, {
		replaceState: true,
		noScroll: true,
		keepFocus: true
	});
}

$effect(() => {
	const scanId =
		$page.url.searchParams.get('requestId')?.trim() ??
		$page.url.searchParams.get('scan')?.trim() ??
		'';

	if (!scanId) {
		handledScanToken = '';
		return;
	}

	if (handledScanToken === scanId) return;

	void maybeOpenScannedRequestFromUrl();
});

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
	void replacementObligationsAPI.reconcile().then(({ reconciled }) => {
		if (reconciled > 0) loadRequests(true);
	});
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
.filter(req => {
	if (activeTab !== 'history') return req.status === activeTab;
	if (req.status !== 'history') return false;
	if (historySubTab === 'all') return true;
	if (historySubTab === 'resolved') return req.rawStatus === 'resolved';
	if (historySubTab === 'completed') return req.rawStatus === 'returned';
	if (historySubTab === 'cancelled') return req.rawStatus === 'cancelled' || req.rawStatus === 'rejected';
	return true;
})
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
history: requests.filter(r => r.status === 'history').length,
historyResolved: requests.filter(r => r.rawStatus === 'resolved').length,
historyCompleted: requests.filter(r => r.rawStatus === 'returned').length,
historyCancelled: requests.filter(r => r.rawStatus === 'cancelled' || r.rawStatus === 'rejected').length
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
if (rawStatus === 'resolved') return { text: 'Resolved', color: 'bg-emerald-100 text-emerald-800' };
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
return isCancelledRequest(rawStatus ?? 'returned', rejectionReason) ? 'border-slate-400' : rawStatus === 'rejected' ? 'border-red-500' : rawStatus === 'resolved' ? 'border-emerald-400' : 'border-gray-300';
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
: rawStatus === 'resolved'
? {
		text: 'All replacement obligations from this incident have been settled. The request is fully resolved.',
color: 'text-emerald-700'
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
	<title>Requests & Loans - Custodian Portal</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Requests & Loans</h1>
		<p class="mt-1 text-sm text-gray-500">Prepare, distribute, and receive borrowed equipment</p>
	</div>
	
	<!-- Statistics Cards -->
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Total</p>
					<p class="mt-1 text-xl font-semibold text-gray-900 sm:mt-2 sm:text-3xl">{stats.totalRequests}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 sm:h-12 sm:w-12">
					<svg class="h-5 w-5 text-blue-600 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
					</svg>
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Pending</p>
					<p class="mt-1 text-xl font-semibold text-blue-600 sm:mt-2 sm:text-3xl">{stats.pendingCount}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 sm:h-12 sm:w-12">
					<svg class="h-5 w-5 text-blue-600 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
					</svg>
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Ready</p>
					<p class="mt-1 text-xl font-semibold text-green-600 sm:mt-2 sm:text-3xl">{stats.readyCount}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 sm:h-12 sm:w-12">
					<svg class="h-5 w-5 text-green-600 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Active</p>
					<p class="mt-1 text-xl font-semibold text-purple-600 sm:mt-2 sm:text-3xl">{stats.activeCount}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 sm:h-12 sm:w-12">
					<svg class="h-5 w-5 text-purple-600 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
					</svg>
				</div>
			</div>
		</div>
		
		<div class="col-span-2 rounded-lg bg-white p-3 shadow sm:p-5 lg:col-span-1">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Overdue</p>
					<p class="mt-1 text-xl font-semibold text-red-600 sm:mt-2 sm:text-3xl">{stats.overdueCount}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 sm:h-12 sm:w-12">
					<svg class="h-5 w-5 text-red-600 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
				</div>
			</div>
		</div>
	</div>
	
	<!-- Tabs Navigation -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex" aria-label="Tabs">
			<button
				onclick={() => activeTab = 'pending'}
				class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium transition-colors sm:text-sm {activeTab === 'pending' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
			>
				<span class="hidden sm:inline">Pending</span>
				<span class="sm:hidden">Prep</span>
				<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'pending' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
					{tabCounts.pending}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'ready'}
				class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium transition-colors sm:text-sm {activeTab === 'ready' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
			>
				Ready
				<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'ready' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
					{tabCounts.ready}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'active'}
				class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium transition-colors sm:text-sm {activeTab === 'active' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
			>
				Active
				<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'active' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
					{tabCounts.active}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'unresolved'}
				class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium transition-colors sm:text-sm {activeTab === 'unresolved' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
			>
				<span class="hidden sm:inline">Unresolved</span>
				<span class="sm:hidden">Issues</span>
				{#if tabCounts.unresolved > 0}
					<span class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold {activeTab === 'unresolved' ? 'bg-rose-100 text-rose-700' : 'bg-rose-50 text-rose-600'}">
						{tabCounts.unresolved}
					</span>
				{:else}
					<span class="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">0</span>
				{/if}
			</button>
			<button
				onclick={() => activeTab = 'history'}
				class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium transition-colors sm:text-sm {activeTab === 'history' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
			>
				History
				<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'history' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
					{tabCounts.history}
				</span>
			</button>
		</nav>
	</div>

	<!-- History Sub-tabs -->
	{#if activeTab === 'history'}
		<div class="border-b border-gray-200 bg-white">
			<nav class="-mb-px flex overflow-x-auto" aria-label="History filter" style="scrollbar-width: none; -ms-overflow-style: none;">
				{#each [
					{ key: 'all', label: 'All', count: tabCounts.history },
					{ key: 'resolved', label: 'Resolved', count: tabCounts.historyResolved },
					{ key: 'completed', label: 'Completed', count: tabCounts.historyCompleted },
					{ key: 'cancelled', label: 'Cancelled', count: tabCounts.historyCancelled }
				] as sub}
					<button
						onclick={() => (historySubTab = sub.key as HistorySubTab)}
						class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-2 py-3 text-[11px] font-medium transition-colors sm:flex-none sm:px-4 sm:text-sm {historySubTab === sub.key ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
					>
						<span class="truncate">{sub.label}</span>
						<span class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] {historySubTab === sub.key ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
							{sub.count}
						</span>
					</button>
				{/each}
			</nav>
		</div>
	{/if}

	<!-- Search and Filter Bar -->
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex-1 max-w-md">
			<div class="relative">
				<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
					<svg class="h-4 w-4 text-gray-400 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
					</svg>
				</div>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search by student, request ID, or item..."
					class="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 sm:pl-10"
				/>
			</div>
		</div>
		
		<div class="flex shrink-0 items-center gap-2">
			<select
				bind:value={sortBy}
				class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
			>
				<option value="date">Date</option>
				<option value="student">Student</option>
				<option value="status">Status</option>
			</select>
			
			<button class="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-700 sm:gap-2 sm:px-4">
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
				</svg>
				<span class="hidden sm:inline">Export</span>
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
				<div class="p-4 sm:p-5">
					<!-- Header: ID, Status, Student Info -->
					<div class="flex items-start justify-between gap-3 mb-3">
						<div class="flex flex-col gap-1 flex-1 min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-mono text-sm font-bold tracking-widest text-gray-900">{request.id}</span>
								<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold {getStatusBadge(request.status, request.rawStatus, request.rejectionReason).color}">
									<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
									{getStatusBadge(request.status, request.rawStatus, request.rejectionReason).text}
								</span>
								{#if request.status === 'unresolved'}
									{#if request.missingItemCount > 0}
										<span class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-200">
											<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
											{request.missingItemCount} Missing
										</span>
									{/if}
									{#if request.damagedItemCount > 0}
										<span class="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 ring-1 ring-rose-200">
											<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
											{request.damagedItemCount} Damaged
										</span>
									{/if}
								{/if}
							</div>
							<div class="flex items-center gap-2 mt-1">
								<div class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
									{#if request.student.avatarUrl}
										<img src={request.student.avatarUrl} alt={request.student.name} class="h-full w-full object-cover" loading="lazy" />
									{:else}
										{request.student.avatar}
									{/if}
								</div>
								<span class="text-sm font-medium text-gray-900">{request.student.name}</span>
								<span class="text-xs text-gray-400">{request.student.yearLevel} • Block {request.student.block}</span>
							</div>
						</div>
						<time class="shrink-0 whitespace-nowrap text-[11px] text-gray-400">
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
										<img src={pic} alt={item.name} class="h-4 w-4 rounded object-cover shrink-0" loading="lazy" />
									{:else}
										<span class="h-3.5 w-3.5 shrink-0 overflow-hidden rounded"><ItemImagePlaceholder size="xs" /></span>
									{/if}
									<span class="truncate">{item.name}</span>
									<span class="text-gray-400">x{item.quantity}</span>
								</span>
							{/each}
						</div>
					</div>

					<!-- Metadata Row -->
					<div class="mt-3 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1.5">
						<div class="flex items-center gap-1.5 text-xs text-gray-500">
							<svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
							</svg>
							<span>
								{new Date(request.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
								–
								{new Date(request.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
							</span>
						</div>
						<div class="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
							<svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
							</svg>
							<span class="truncate">{request.purpose}</span>
						</div>
						<div class="flex items-center gap-1.5 text-xs text-gray-500">
							<svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
							</svg>
							<span class="truncate">{request.approvedBy}</span>
						</div>
					</div>

					<!-- Overdue Warning -->
					{#if request.isOverdue}
						<div class="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
							<svg class="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							<div class="min-w-0">
								<p class="text-xs font-semibold text-red-800">
									{request.daysOverdue} {request.daysOverdue === 1 ? 'day' : 'days'} overdue
								</p>
								<p class="mt-0.5 text-xs text-red-700">
									Due {formatDateTimeShort(request.returnDate)}
								</p>
							</div>
						</div>
					{/if}
				</div>

				<!-- Card Footer -->
				<div class="flex flex-col gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
					<!-- Status hint -->
					<div class="text-xs min-w-0">
						<p class="font-medium {getRequestHint(request.status, request.rawStatus, request.rejectionReason).color}">
							{getRequestHint(request.status, request.rawStatus, request.rejectionReason).text}
						</p>
					</div>

					<!-- Action buttons -->
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
		<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onclick={closeDetailModal} aria-label="Close modal" tabindex="-1"></button>
		<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
			<div class="relative w-full max-w-4xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl animate-scaleIn overflow-hidden">
				
				<!-- Header -->
				<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-4 sm:px-8 sm:py-6">
					<div class="flex items-start justify-between gap-3">
						<div class="flex items-start gap-3 min-w-0 flex-1">
							<div class="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30">
								<svg class="h-5 w-5 text-white sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
								</svg>
							</div>
							<div class="min-w-0 flex-1">
								<h2 class="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Request Details</h2>
								<p class="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-pink-600">{selectedRequest.id}</p>
								<div class="mt-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5 {getStatusBadge(selectedRequest.status, selectedRequest.rawStatus, selectedRequest.rejectionReason).color} shadow-sm ring-1 ring-black/5">
									<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
									<span class="text-[10px] sm:text-xs font-bold">{getStatusBadge(selectedRequest.status, selectedRequest.rawStatus, selectedRequest.rejectionReason).text}</span>
								</div>
							</div>
						</div>
						<button 
							onclick={closeDetailModal}
							aria-label="Close modal"
							class="rounded-xl p-2 sm:p-2.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95"
						>
							<svg class="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					</div>
				</div>
				
				<!-- Content -->
				<div class="max-h-[70vh] overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
					<div class="space-y-6 sm:space-y-8">
						
						<!-- Workflow Timeline -->
						<div>
							<div class="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 sm:p-5">
								<!-- Timeline Container -->
								<div class="relative">
									<!-- SVG Background for connector lines -->
									<svg class="absolute inset-0 w-full h-16 pointer-events-none" style="z-index: 0;">
										{#each [
											{ label: 'Request Submitted', by: 'Student', date: selectedRequest.requestDate, completed: true },
											{ label: 'Instructor Approved', by: selectedRequest.approvedBy, date: selectedRequest.approvedDate, completed: !!selectedRequest.approvedDate },
											{ label: 'Custodian Approved', by: 'Custodian', date: selectedRequest.releasedDate, completed: !!selectedRequest.releasedDate },
											{ label: 'Awaiting Pickup', by: 'Student', date: selectedRequest.pickedUpDate, completed: !!selectedRequest.pickedUpDate && selectedRequest.status !== 'ready' }
										] as step, idx}
											{@const stepCount = 4}
											{@const isLastStep = idx === stepCount - 1}
											{@const stepWidth = 100 / stepCount}
											{@const x1 = (stepWidth * (idx + 0.5))}
											{@const x2 = (stepWidth * (idx + 1.5))}
											{@const y = 20}
											{@const isCurrentCompleted = step.completed}
											
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
										{#each [
											{ label: 'Request Submitted', by: 'Student', date: selectedRequest.requestDate, completed: true },
											{ label: 'Instructor Approved', by: selectedRequest.approvedBy, date: selectedRequest.approvedDate, completed: !!selectedRequest.approvedDate },
											{ label: 'Custodian Approved', by: 'Custodian', date: selectedRequest.releasedDate, completed: !!selectedRequest.releasedDate },
											{ label: 'Awaiting Pickup', by: 'Student', date: selectedRequest.pickedUpDate, completed: !!selectedRequest.pickedUpDate && selectedRequest.status !== 'ready' }
										] as step, idx}
											<div class="flex flex-col items-center flex-1">
												<!-- Icon Circle -->
												<div class="relative mb-2 flex items-center justify-center">
													<div class="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 bg-white {step.completed ? 'border-pink-600' : 'border-gray-300'}">
														{#if idx === 0}
															<svg class="h-4 w-4 sm:h-5 sm:w-5 {step.completed ? 'text-pink-600' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
															</svg>
														{:else if idx === 1}
															<svg class="h-4 w-4 sm:h-5 sm:w-5 {step.completed ? 'text-pink-600' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
															</svg>
														{:else if idx === 2}
															<svg class="h-4 w-4 sm:h-5 sm:w-5 {step.completed ? 'text-pink-600' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
															</svg>
														{:else}
															<svg class="h-4 w-4 sm:h-5 sm:w-5 {step.completed ? 'text-pink-600' : 'text-gray-400 animate-pulse'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
															</svg>
														{/if}
													</div>
												</div>
												
												<!-- Step Label -->
												<div class="text-center min-w-0">
													<p class="text-[10px] sm:text-xs font-semibold text-gray-900 leading-tight line-clamp-2">{step.label}</p>
													<p class="text-[9px] sm:text-xs text-gray-500 mt-0.5 line-clamp-1">{step.by}</p>
													<p class="text-[9px] sm:text-xs font-medium {step.completed ? 'text-pink-600' : 'text-gray-400'} mt-0.5">
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
								</div>
							</div>
						</div>

						<!-- Student Information -->
						<div>
							<h3 class="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-900">
								<div class="h-1 w-1 rounded-full bg-pink-500"></div>
								Student Information
							</h3>
							<div class="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 sm:p-5">
								<div class="flex items-center gap-4">
									<div class="flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-lg sm:text-xl font-semibold text-pink-700 ring-2 ring-pink-200">
										{#if selectedRequest.student.avatarUrl}
											<img
												src={selectedRequest.student.avatarUrl}
												alt={selectedRequest.student.name}
												class="h-full w-full object-cover"
												loading="lazy"
											/>
										{:else}
											{selectedRequest.student.avatar}
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<p class="text-base sm:text-lg font-bold text-gray-900">{selectedRequest.student.name}</p>
										<p class="text-xs sm:text-sm text-gray-600 mt-0.5">{selectedRequest.student.yearLevel} • Block {selectedRequest.student.block}</p>
										<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
											<span class="font-mono">ID: {selectedRequest.student.studentId}</span>
											<span>•</span>
											<span class="truncate">{selectedRequest.student.email}</span>
										</div>
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
								<div class="group rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
									<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
										<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
										</svg>
										<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Request Date</p>
									</div>
									<p class="text-sm sm:text-base font-bold text-gray-900">{new Date(selectedRequest.requestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
								</div>
								<div class="group rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
									<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
										<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
										</svg>
										<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Borrow Period</p>
									</div>
									<p class="text-sm sm:text-base font-bold text-gray-900">
										{new Date(selectedRequest.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(selectedRequest.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
									</p>
								</div>
								<div class="group rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md col-span-2">
									<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
										<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
										</svg>
										<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Purpose</p>
									</div>
									<p class="text-sm sm:text-base font-bold text-gray-900">{selectedRequest.purpose}</p>
								</div>
								<div class="group rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md col-span-2">
									<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
										<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
										</svg>
										<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Approved By</p>
									</div>
									<p class="text-sm sm:text-base font-bold text-gray-900">{selectedRequest.approvedBy}</p>
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
											<img src={pic} alt={item.name} class="h-12 w-12 rounded-lg object-cover shrink-0 ring-1 ring-gray-100" loading="lazy" />
										{:else}
											<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-gray-100">
												<ItemImagePlaceholder size="sm" />
											</div>
										{/if}
										<div class="min-w-0 flex-1">
											<p class="text-sm font-semibold text-gray-900 group-hover:text-pink-600 transition-colors truncate">{item.name}</p>
											<p class="text-xs text-gray-500 mt-0.5">Code: {item.code} • Qty: {item.quantity}</p>
										</div>
									</div>
								{/each}
							</div>
						</div>

						<!-- Overdue Warning -->
						{#if selectedRequest.isOverdue}
							<div class="rounded-2xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-red-100/50 p-5">
								<div class="flex gap-3">
									<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500">
										<svg class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
										</svg>
									</div>
									<div class="flex-1 min-w-0">
										<p class="text-sm font-bold text-red-900">Overdue Return</p>
										<p class="mt-1.5 text-sm text-red-800 leading-relaxed">
											This request is {selectedRequest.daysOverdue} {selectedRequest.daysOverdue === 1 ? 'day' : 'days'} overdue. Expected return: {formatDateTimeShort(selectedRequest.returnDate)}
										</p>
										{#if selectedRequest.lastReminderAt}
											<p class="mt-2 text-xs text-red-700">Last reminder sent: {selectedRequest.lastReminderAt}</p>
										{/if}
									</div>
								</div>
							</div>
						{/if}

						<!-- Status Information -->
						<div class="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/30 p-4 sm:p-5">
							<div class="flex gap-3">
								<div class="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500">
									<svg class="h-4 w-4 sm:h-5 sm:w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
									</svg>
								</div>
								<div class="flex-1 min-w-0">
									<p class="text-xs sm:text-sm font-medium text-blue-900 leading-relaxed">
										{getRequestHint(selectedRequest.status, selectedRequest.rawStatus, selectedRequest.rejectionReason).text}
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
				
				<!-- Footer -->
				<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-3 sm:px-8 sm:py-5">
					<div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3">
						<button
							onclick={closeDetailModal}
							class="rounded-xl border border-gray-300 bg-white px-5 py-2.5 sm:px-6 sm:py-3 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98]"
						>
							Close
						</button>
						{#if selectedRequest.status === 'pending'}
							<button
								onclick={() => {
									closeDetailModal();
									markReady(selectedRequest.rawId);
								}}
								class="rounded-xl bg-gradient-to-r from-green-600 to-green-700 px-5 py-2.5 sm:px-6 sm:py-3 text-sm font-bold text-white shadow-sm transition-all hover:from-green-700 hover:to-green-800 active:scale-[0.98]"
							>
								Mark Ready for Pickup
							</button>
						{/if}
						{#if selectedRequest.status === 'ready'}
							<button
								onclick={() => {
									closeDetailModal();
									confirmPickup(selectedRequest.rawId);
								}}
								class="rounded-xl bg-gradient-to-r from-pink-600 to-pink-700 px-5 py-2.5 sm:px-6 sm:py-3 text-sm font-bold text-white shadow-sm transition-all hover:from-pink-700 hover:to-pink-800 active:scale-[0.98]"
							>
								Confirm Pickup
							</button>
						{/if}
						{#if selectedRequest.status === 'active' && selectedRequest.rawStatus === 'pending_return'}
							<button
								onclick={() => {
									closeDetailModal();
									confirmReturn(selectedRequest.rawId);
								}}
								class="rounded-xl bg-gradient-to-r from-orange-600 to-orange-700 px-5 py-2.5 sm:px-6 sm:py-3 text-sm font-bold text-white shadow-sm transition-all hover:from-orange-700 hover:to-orange-800 active:scale-[0.98]"
							>
								Inspect & Confirm Return
							</button>
						{/if}
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

