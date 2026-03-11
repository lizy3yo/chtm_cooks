<script lang="ts">
import { onMount } from 'svelte';
import { authStore } from '$lib/stores/auth';
import { toastStore } from '$lib/stores/toast';
import { borrowRequestsAPI, type BorrowRequestRecord, type BorrowRequestStatus } from '$lib/api/borrowRequests';
import { catalogAPI } from '$lib/api/catalog';
import {
	Archive,
	CalendarDays,
	CheckCircle2,
	CircleAlert,
	CircleX,
	ClipboardList,
	Clock3,
	FileText,
	PackageCheck,
	SearchX,
	UserCircle
} from 'lucide-svelte';

let activeTab = $state<'pending' | 'fulfillment' | 'borrowed' | 'history'>('pending');
let showDetailModal = $state(false);
let selectedRequest = $state<any>(null);
let selectedRequests = $state<string[]>([]);
let showBulkRejectModal = $state(false);
let rejectReason = $state('');
let rejectDetails = $state('');
let searchQuery = $state('');
let sortBy = $state<'date' | 'student' | 'status'>('date');
let requests = $state<any[]>([]);
let itemPictureCache = $state<Map<string, string>>(new Map());
let actionInFlightById = $state<Record<string, boolean>>({});
let bulkActionInFlight = $state(false);

const rejectReasons = [
'Item not suitable for purpose',
'Student inexperienced with equipment',
'Duration too long',
'Item reserved for lab session',
'Better alternative available',
'Other (specify)'
];

function isCancelledRequest(status: BorrowRequestStatus, rejectionReason?: string): boolean {
	return status === 'cancelled' || (status === 'rejected' && rejectionReason === 'Request cancelled by student');
}

function toUiStatus(status: BorrowRequestStatus, rejectionReason?: string): 'pending' | 'fulfillment' | 'borrowed' | 'history' {
switch (status) {
case 'pending_instructor':
return 'pending';
case 'approved_instructor':
case 'ready_for_pickup':
return 'fulfillment';
case 'borrowed':
case 'pending_return':
case 'missing':
return 'borrowed';
case 'cancelled':
case 'returned':
case 'rejected':
return 'history';
default:
return 'history';
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

function formatDateTime(value?: string): string | undefined {
if (!value) return undefined;
const date = new Date(value);
if (Number.isNaN(date.getTime())) return undefined;
return date.toLocaleString();
}

function mapRequest(record: BorrowRequestRecord): any {
const status = toUiStatus(record.status, record.rejectReason);
const studentName = record.student?.fullName || `Student ${record.studentId.slice(-6).toUpperCase()}`;
const user = $authStore.user;
return {
rawId: record.id,
rawStatus: record.status,
id: getDisplayId(record.id),
student: {
name: studentName,
yearLevel: record.student?.yearLevel || 'N/A',
block: record.student?.block || 'N/A',
avatar: initials(studentName),
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
urgent: false,
daysUntil: 0,
approvedBy: record.instructor?.fullName || user?.firstName || 'Instructor',
approvedDate: formatDateTime(record.approvedAt),
custodianStatus:
record.status === 'approved_instructor'
? 'Preparing'
: record.status === 'ready_for_pickup'
? 'Ready for Pickup'
: isCancelledRequest(record.status, record.rejectReason)
? 'Cancelled by Student'
: record.status === 'borrowed'
? 'Picked Up'
: record.status === 'pending_return'
? 'Return Requested'
: record.status === 'missing'
? 'Missing - Investigation'
: record.status === 'returned'
? 'Returned'
: undefined,
releasedDate: formatDateTime(record.releasedAt),
pickedUpDate: formatDateTime(record.pickedUpAt),
actualReturnDate: formatDateTime(record.returnedAt),
returnCondition: record.status === 'returned' ? 'Good' : undefined,
returnNotes: record.rejectionNotes,
rejectionReason: record.rejectReason,
borrowingRecord: {
totalBorrowed: 0,
returnRate: 100,
overdue: 0,
trustScore: 'Good'
}
};
}

async function loadRequests(forceRefresh = false): Promise<void> {
try {
const response = await borrowRequestsAPI.list({}, { forceRefresh });
requests = response.requests.map(mapRequest);
await backfillItemPictures();
} catch (error) {
console.error('Failed to load instructor requests', error);
requests = [];
}
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
	} catch {
		// Non-critical, fallback icon remains visible when pictures are unavailable.
	}
}

onMount(async () => {
await loadRequests(true);

const refresh = () => {
void loadRequests(true);
};

const intervalId = window.setInterval(refresh, 15000);
window.addEventListener('focus', refresh);

const onVisibilityChange = () => {
if (!document.hidden) {
refresh();
}
};

document.addEventListener('visibilitychange', onVisibilityChange);

return () => {
window.clearInterval(intervalId);
window.removeEventListener('focus', refresh);
document.removeEventListener('visibilitychange', onVisibilityChange);
};
});

const filteredRequests = $derived(
requests
.filter(req => req.status === activeTab)
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
fulfillmentCount: requests.filter(r => r.status === 'fulfillment').length,
borrowedCount: requests.filter(r => r.status === 'borrowed').length,
completedCount: requests.filter(r => r.status === 'history').length
});

const tabCounts = $derived({
pending: requests.filter(r => r.status === 'pending').length,
fulfillment: requests.filter(r => r.status === 'fulfillment').length,
borrowed: requests.filter(r => r.status === 'borrowed').length,
history: requests.filter(r => r.status === 'history').length
});

function openDetailModal(request: any) {
selectedRequest = request;
showDetailModal = true;
}

function closeDetailModal() {
showDetailModal = false;
selectedRequest = null;
}

function toggleSelectRequest(requestId: string) {
if (selectedRequests.includes(requestId)) {
selectedRequests = selectedRequests.filter(id => id !== requestId);
} else {
selectedRequests = [...selectedRequests, requestId];
}
}

function toggleSelectAllVisiblePendingRequests(): void {
	const visiblePendingIds = filteredRequests.map((request) => request.rawId);
	const allSelected = visiblePendingIds.length > 0 && visiblePendingIds.every((id) => selectedRequests.includes(id));

	if (allSelected) {
		selectedRequests = selectedRequests.filter((id) => !visiblePendingIds.includes(id));
		return;
	}

	selectedRequests = Array.from(new Set([...selectedRequests, ...visiblePendingIds]));
}

function isActionInFlight(rawId?: string): boolean {
	if (!rawId) return false;
	return Boolean(actionInFlightById[rawId]);
}

function setActionInFlight(rawId: string, inFlight: boolean): void {
	if (inFlight) {
		actionInFlightById = { ...actionInFlightById, [rawId]: true };
		return;
	}

	const next = { ...actionInFlightById };
	delete next[rawId];
	actionInFlightById = next;
}

function syncRequestFromServer(updatedRecord: BorrowRequestRecord): void {
	const mapped = mapRequest(updatedRecord);
	let found = false;
	requests = requests.map((request) => {
		if (request.rawId === mapped.rawId) {
			found = true;
			return mapped;
		}
		return request;
	});

	if (!found) {
		requests = [mapped, ...requests];
	}
}

function clearSelectionForRequest(rawId: string): void {
	selectedRequests = selectedRequests.filter((id) => id !== rawId);
}

function closeDetailModalIfMatches(rawId: string): void {
	if (selectedRequest?.rawId === rawId) {
		closeDetailModal();
	}
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return fallback;
}

async function approveRequest(rawId: string): Promise<void> {
	if (bulkActionInFlight || isActionInFlight(rawId)) return;

	setActionInFlight(rawId, true);
	try {
		const updated = await borrowRequestsAPI.approve(rawId);
		syncRequestFromServer(updated);
		clearSelectionForRequest(rawId);
		closeDetailModalIfMatches(rawId);
		toastStore.success('Request approved successfully.');
		void loadRequests(true);
	} catch (error) {
		console.error('Failed to approve request', error);
		toastStore.error(getErrorMessage(error, 'Failed to approve request.'));
	} finally {
		setActionInFlight(rawId, false);
	}
}

async function rejectRequest(rawId: string, reason: string, notes?: string): Promise<void> {
	if (bulkActionInFlight || isActionInFlight(rawId)) return;

	setActionInFlight(rawId, true);
	try {
		const updated = await borrowRequestsAPI.reject(rawId, reason, notes);
		syncRequestFromServer(updated);
		clearSelectionForRequest(rawId);
		closeDetailModalIfMatches(rawId);
		toastStore.success('Request rejected successfully.');
		void loadRequests(true);
	} catch (error) {
		console.error('Failed to reject request', error);
		toastStore.error(getErrorMessage(error, 'Failed to reject request.'));
	} finally {
		setActionInFlight(rawId, false);
	}
}

async function bulkApprove(): Promise<void> {
	const requestIds = Array.from(new Set(selectedRequests));
	if (requestIds.length === 0 || bulkActionInFlight) return;

	bulkActionInFlight = true;
	try {
		const results = await Promise.allSettled(requestIds.map((rawId) => borrowRequestsAPI.approve(rawId)));
		let successCount = 0;
		let failureCount = 0;

		results.forEach((result, index) => {
			const rawId = requestIds[index];
			if (result.status === 'fulfilled') {
				syncRequestFromServer(result.value);
				clearSelectionForRequest(rawId);
				closeDetailModalIfMatches(rawId);
				successCount += 1;
				return;
			}

			failureCount += 1;
			console.error(`Failed to approve request ${rawId}`, result.reason);
		});

		if (successCount > 0) {
			toastStore.success(`${successCount} request${successCount === 1 ? '' : 's'} approved.`);
		}

		if (failureCount > 0) {
			toastStore.error(`${failureCount} request${failureCount === 1 ? '' : 's'} failed to approve.`);
		}

		void loadRequests(true);
	} finally {
		bulkActionInFlight = false;
	}
}

async function bulkReject(): Promise<void> {
	const requestIds = Array.from(new Set(selectedRequests));
	if (!rejectReason || requestIds.length === 0 || bulkActionInFlight) return;

	bulkActionInFlight = true;
	try {
		const results = await Promise.allSettled(
			requestIds.map((rawId) => borrowRequestsAPI.reject(rawId, rejectReason, rejectDetails || undefined))
		);
		let successCount = 0;
		let failureCount = 0;

		results.forEach((result, index) => {
			const rawId = requestIds[index];
			if (result.status === 'fulfilled') {
				syncRequestFromServer(result.value);
				clearSelectionForRequest(rawId);
				closeDetailModalIfMatches(rawId);
				successCount += 1;
				return;
			}

			failureCount += 1;
			console.error(`Failed to reject request ${rawId}`, result.reason);
		});

		if (successCount > 0) {
			toastStore.success(`${successCount} request${successCount === 1 ? '' : 's'} rejected.`);
		}

		if (failureCount > 0) {
			toastStore.error(`${failureCount} request${failureCount === 1 ? '' : 's'} failed to reject.`);
		}

		showBulkRejectModal = false;
		rejectReason = '';
		rejectDetails = '';
		void loadRequests(true);
	} finally {
		bulkActionInFlight = false;
	}
}

function getTrustScoreColor(score: string) {
switch (score) {
case 'Excellent': return 'bg-green-100 text-green-800';
case 'Good': return 'bg-blue-100 text-blue-800';
case 'Fair': return 'bg-yellow-100 text-yellow-800';
default: return 'bg-gray-100 text-gray-800';
}
}

function getCardBorderColor(status: string, rawStatus?: BorrowRequestStatus, rejectionReason?: string): string {
	switch (status) {
		case 'pending':
			return 'border-amber-400';
		case 'fulfillment':
			return rawStatus === 'ready_for_pickup' ? 'border-emerald-500' : 'border-blue-500';
		case 'borrowed':
			if (rawStatus === 'pending_return') return 'border-orange-500';
			if (rawStatus === 'missing') return 'border-rose-600';
			return 'border-violet-500';
		case 'history':
			if (isCancelledRequest(rawStatus ?? 'returned', rejectionReason)) return 'border-slate-400';
			return rawStatus === 'rejected' ? 'border-red-500' : 'border-teal-500';
		default:
			return 'border-gray-200';
	}
}

function getStatusIconComponent(status: string, rawStatus?: BorrowRequestStatus, rejectionReason?: string) {
	if (status === 'pending') return Clock3;
	if (status === 'fulfillment') return rawStatus === 'ready_for_pickup' ? CheckCircle2 : PackageCheck;
	if (status === 'borrowed') {
		if (rawStatus === 'pending_return') return Clock3;
		if (rawStatus === 'missing') return CircleAlert;
		return PackageCheck;
	}
	if (status === 'history') return rawStatus === 'rejected' || isCancelledRequest(rawStatus ?? 'returned', rejectionReason) ? CircleX : CheckCircle2;
	return Clock3;
}

function getStatusLabel(status: string, rawStatus?: BorrowRequestStatus, rejectionReason?: string): string {
	if (status === 'pending') return 'Pending Review';
	if (status === 'fulfillment') return rawStatus === 'ready_for_pickup' ? 'Ready for Pickup' : 'In Preparation';
	if (status === 'borrowed') {
		if (rawStatus === 'pending_return') return 'Return Requested';
		if (rawStatus === 'missing') return 'Missing Item';
		return 'Active Loan';
	}
	if (status === 'history') {
		if (isCancelledRequest(rawStatus ?? 'returned', rejectionReason)) return 'Cancelled';
		return rawStatus === 'rejected' ? 'Rejected' : 'Returned';
	}
	return status;
}

function getStatusColor(status: string, rawStatus?: BorrowRequestStatus, rejectionReason?: string): string {
	if (status === 'pending') return 'bg-amber-100 text-amber-800';
	if (status === 'fulfillment') return rawStatus === 'ready_for_pickup' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800';
	if (status === 'borrowed') {
		if (rawStatus === 'pending_return') return 'bg-orange-100 text-orange-800';
		if (rawStatus === 'missing') return 'bg-rose-100 text-rose-800';
		return 'bg-violet-100 text-violet-800';
	}
	if (status === 'history') {
		if (isCancelledRequest(rawStatus ?? 'returned', rejectionReason)) return 'bg-slate-100 text-slate-800';
		return rawStatus === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-teal-100 text-teal-800';
	}
	return 'bg-gray-100 text-gray-800';
}

function getStatusHint(status: string, rawStatus?: BorrowRequestStatus, rejectionReason?: string): { text: string; color: string } {
	if (status === 'pending') {
		return {
			text: 'Review the request and decide whether to approve or reject it.',
			color: 'text-amber-700'
		};
	}

	if (status === 'fulfillment') {
		return {
			text: rawStatus === 'ready_for_pickup'
				? 'The request is approved and ready for the student to collect from the custodian.'
				: 'The custodian is preparing the approved equipment for release.',
			color: rawStatus === 'ready_for_pickup' ? 'text-emerald-700' : 'text-blue-700'
		};
	}

	if (status === 'borrowed') {
		if (rawStatus === 'pending_return') {
			return {
				text: 'The student has initiated the return process and is awaiting custodian confirmation.',
				color: 'text-orange-700'
			};
		}

		if (rawStatus === 'missing') {
			return {
				text: 'A missing-item investigation is currently in progress for this request.',
				color: 'text-rose-700'
			};
		}

		return {
			text: 'The equipment is currently checked out to the student.',
			color: 'text-violet-700'
		};
	}

	if (status === 'history') {
		return {
			text: isCancelledRequest(rawStatus ?? 'returned', rejectionReason)
				? 'This request was cancelled by the student before approval and moved to history.'
				: rawStatus === 'rejected'
				? 'This request was rejected and moved to the history list.'
				: 'This request has been completed and closed.',
			color: isCancelledRequest(rawStatus ?? 'returned', rejectionReason)
				? 'text-slate-700'
				: rawStatus === 'rejected' ? 'text-red-700' : 'text-teal-700'
		};
	}

	return { text: '', color: 'text-gray-400' };
}

function getStatusBadge(status: string, rawStatus?: BorrowRequestStatus, custodianStatus?: string, rejectionReason?: string) {
switch (status) {
case 'pending':
return { text: 'Pending Approval', color: 'bg-yellow-100 text-yellow-800', icon: 'Pending' };
case 'fulfillment':
return {
text: custodianStatus || 'With Custodian',
color: rawStatus === 'ready_for_pickup' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800',
icon: rawStatus === 'ready_for_pickup' ? 'Ready' : 'Prep'
};
case 'borrowed':
return {
text: rawStatus === 'pending_return' ? 'Return Requested' : rawStatus === 'missing' ? 'Missing' : 'Picked Up',
color: rawStatus === 'pending_return' ? 'bg-orange-100 text-orange-800' : rawStatus === 'missing' ? 'bg-rose-100 text-rose-800' : 'bg-purple-100 text-purple-800',
icon: rawStatus === 'pending_return' ? 'Return' : rawStatus === 'missing' ? 'Alert' : 'Borrowed'
};
case 'history':
return {
text: isCancelledRequest(rawStatus ?? 'returned', rejectionReason) ? 'Cancelled' : rawStatus === 'rejected' ? 'Rejected' : 'Returned',
color: isCancelledRequest(rawStatus ?? 'returned', rejectionReason) ? 'bg-slate-100 text-slate-800' : rawStatus === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-teal-100 text-teal-800',
icon: isCancelledRequest(rawStatus ?? 'returned', rejectionReason) ? 'Cancelled' : rawStatus === 'rejected' ? 'Rejected' : 'Returned'
};
default:
return { text: status, color: 'bg-gray-100 text-gray-800', icon: 'Status' };
}
}

function getEmptyState(tab: 'pending' | 'fulfillment' | 'borrowed' | 'history', hasSearch: boolean) {
	if (hasSearch) {
		return {
			icon: SearchX,
			title: 'No matching requests',
			description: 'No student requests match your current search. Try a different name, request ID, or item keyword.'
		};
	}

	if (tab === 'pending') {
		return {
			icon: ClipboardList,
			title: 'No pending requests',
			description: 'New student requests that need instructor review will appear here.'
		};
	}

	if (tab === 'fulfillment') {
		return {
			icon: Archive,
			title: 'No requests in preparation',
			description: 'Approved requests being coordinated with the custodian will appear here.'
		};
	}

	if (tab === 'borrowed') {
		return {
			icon: Archive,
			title: 'No active borrowed items',
			description: 'Requests that have been picked up, are pending return, or are under review for missing items will appear here.'
		};
	}

	return {
		icon: Archive,
		title: 'No request history yet',
		description: 'Returned, cancelled, and rejected requests will appear here once the workflow is completed.'
	};
}
</script>

<svelte:head>
	<title>Student Requests - Instructor Portal</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Student Requests</h1>
		<p class="mt-1 text-sm text-gray-500">Review and approve equipment borrow requests</p>
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
					<ClipboardList class="h-6 w-6 text-blue-600" />
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
					<Clock3 class="h-6 w-6 text-yellow-600" />
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-5 shadow">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">With Custodian</p>
					<p class="mt-2 text-3xl font-semibold text-blue-600">{stats.fulfillmentCount}</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
					<PackageCheck class="h-6 w-6 text-blue-600" />
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-5 shadow">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Completed</p>
					<p class="mt-2 text-3xl font-semibold text-teal-600">{stats.completedCount}</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100">
					<CheckCircle2 class="h-6 w-6 text-teal-600" />
				</div>
			</div>
		</div>
	</div>
	
	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6 overflow-x-auto">
			<button
				onclick={() => activeTab = 'pending'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'pending' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Pending Approval
				<span class="ml-2 rounded-full {activeTab === 'pending' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs">
					{tabCounts.pending}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'fulfillment'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'fulfillment' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Preparation
				<span class="ml-2 rounded-full {activeTab === 'fulfillment' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs">
					{tabCounts.fulfillment}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'borrowed'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'borrowed' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Picked Up & Return
				<span class="ml-2 rounded-full {activeTab === 'borrowed' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs">
					{tabCounts.borrowed}
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
					<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
					</svg>
				</div>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search by student name, request ID, or item..."
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
			
			<button class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
				</svg>
				Filter
			</button>
			
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
		{#if activeTab === 'pending'}
			<div class="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
				<div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
					<div class="flex flex-wrap items-center gap-3">
						<label class="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
							<input
								type="checkbox"
								checked={filteredRequests.length > 0 && filteredRequests.every((request) => selectedRequests.includes(request.rawId))}
								onchange={toggleSelectAllVisiblePendingRequests}
								class="h-4 w-4 rounded border-gray-300 text-pink-600"
							>
							<span>Select All ({filteredRequests.length})</span>
						</label>

						<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold {selectedRequests.length > 0 ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-500'}">
							{selectedRequests.length} selected
						</span>

						<div class="flex flex-wrap items-center gap-2">
							<button
								onclick={bulkApprove}
								disabled={selectedRequests.length === 0 || bulkActionInFlight}
								class="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
							>
								{bulkActionInFlight ? 'Processing...' : 'Bulk Approve'}
							</button>
							<button
								onclick={() => showBulkRejectModal = true}
								disabled={selectedRequests.length === 0 || bulkActionInFlight}
								class="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-200 disabled:text-red-300 disabled:hover:bg-white"
							>
								Bulk Reject
							</button>
							<button
								onclick={() => selectedRequests = []}
								disabled={selectedRequests.length === 0 || bulkActionInFlight}
								class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white"
							>
								Clear
							</button>
						</div>
					</div>

					<span class="text-xs text-gray-500">
						Showing {filteredRequests.length} of {tabCounts.pending} requests
					</span>
				</div>
			</div>
		{:else}
			<div class="flex items-center justify-between rounded-lg bg-gray-50 p-3">
				<span class="text-sm font-medium text-gray-700">
					{filteredRequests.length} {filteredRequests.length === 1 ? 'request' : 'requests'} found
				</span>
			</div>
		{/if}
		
		{#each filteredRequests as request}
			<div class="flex items-start gap-3">
				{#if request.status === 'pending'}
					<input
						type="checkbox"
						checked={selectedRequests.includes(request.rawId)}
						onchange={() => toggleSelectRequest(request.rawId)}
						class="mt-5 h-5 w-5 rounded border-gray-300 text-pink-600"
					/>
				{/if}

				<div class="flex-1 overflow-hidden rounded-xl border-l-4 bg-white shadow-sm ring-1 ring-gray-200 transition-all hover:shadow-md {getCardBorderColor(request.status, request.rawStatus, request.rejectionReason)}">
					<div class="p-5">
						<div class="flex items-start justify-between gap-3">
							<div class="flex min-w-0 flex-wrap items-center gap-2">
								<span class="font-mono text-sm font-bold tracking-widest text-gray-900">{request.id}</span>
								<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold {getStatusColor(request.status, request.rawStatus, request.rejectionReason)}">
									<svelte:component this={getStatusIconComponent(request.status, request.rawStatus, request.rejectionReason)} size={12} />
									{getStatusLabel(request.status, request.rawStatus, request.rejectionReason)}
								</span>
							</div>
							<time class="shrink-0 whitespace-nowrap text-xs text-gray-400">
								{new Date(request.requestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
							</time>
						</div>

						<div class="mt-4 flex items-start gap-3">
							<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pink-100 font-semibold text-pink-700">
								{request.student.avatar}
							</div>
							<div class="min-w-0">
								<h3 class="text-lg font-semibold text-gray-900">{request.student.name}</h3>
								<p class="text-sm text-gray-500">{request.student.yearLevel} • Block {request.student.block}</p>
								<p class="mt-1 text-xs text-gray-400">Student ID {request.student.studentId}</p>
							</div>
						</div>

						<div class="mt-4">
							<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Equipment Requested</p>
							<div class="flex flex-wrap gap-1.5">
								{#each request.items as item}
									{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
									<span class="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
										{#if pic}
											<img src={pic} alt={item.name} class="h-4 w-4 shrink-0 rounded object-cover" loading="lazy" />
										{:else}
											<svg class="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7"/>
											</svg>
										{/if}
										<span>{item.name}</span>
										<span class="text-gray-400">x{item.quantity}</span>
									</span>
								{/each}
							</div>
						</div>

						<div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
							<div class="flex items-center gap-1.5 text-xs text-gray-500">
								<CalendarDays size={14} class="shrink-0 text-gray-400" />
								<span>
									{new Date(request.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
									–
									{new Date(request.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
								</span>
							</div>
							<div class="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
								<FileText size={14} class="shrink-0 text-gray-400" />
								<span class="max-w-[260px] truncate">{request.purpose}</span>
							</div>
							<div class="flex items-center gap-1.5 text-xs text-gray-500">
								<UserCircle size={14} class="shrink-0 text-gray-400" />
								<span>{request.student.email}</span>
							</div>
						</div>

						<div class="mt-4 flex flex-wrap items-center gap-2">
							<span class="text-xs font-medium text-gray-500">Trust Score</span>
							<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getTrustScoreColor(request.borrowingRecord.trustScore)}">
								{request.borrowingRecord.trustScore}
							</span>
						</div>

						{#if request.status !== 'pending'}
							<div class="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
								<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Workflow Status</p>
								<div class="space-y-2">
									{#if request.approvedDate}
										<div class="flex items-center gap-2 text-xs text-gray-600">
											<span class="text-green-600">✓</span>
											<span>Approved by {request.approvedBy} on {request.approvedDate}</span>
										</div>
									{/if}
									{#if request.custodianStatus}
										<div class="flex items-center gap-2 text-xs text-gray-600">
											<span class="{request.custodianStatus === 'Ready for Pickup' || request.custodianStatus === 'Picked Up' || request.custodianStatus === 'Return Requested' || request.custodianStatus === 'Returned' ? 'text-green-600' : request.custodianStatus === 'Missing - Investigation' ? 'text-rose-600' : 'text-blue-600'}">
												{request.custodianStatus === 'Ready for Pickup' || request.custodianStatus === 'Picked Up' || request.custodianStatus === 'Return Requested' || request.custodianStatus === 'Returned' ? '✓' : request.custodianStatus === 'Missing - Investigation' ? '⚠' : '⏳'}
											</span>
											<span>Custodian Status: {request.custodianStatus}</span>
										</div>
									{/if}
									{#if request.releasedDate}
										<div class="flex items-center gap-2 text-xs text-gray-600">
											<span class="text-green-600">✓</span>
											<span>Released on {request.releasedDate}</span>
										</div>
									{/if}
									{#if request.pickedUpDate}
										<div class="flex items-center gap-2 text-xs text-gray-600">
											<span class="text-green-600">✓</span>
											<span>Picked up on {request.pickedUpDate}</span>
										</div>
									{/if}
									{#if request.actualReturnDate}
										<div class="flex items-center gap-2 text-xs text-gray-600">
											<span class="text-green-600">✓</span>
											<span>Returned on {request.actualReturnDate}</span>
										</div>
									{/if}
									{#if request.returnCondition}
										<div class="flex items-center gap-2 text-xs text-gray-600">
											<span class="text-gray-500">•</span>
											<span>Condition: <span class="font-medium {request.returnCondition === 'Good' ? 'text-green-600' : request.returnCondition === 'Fair' ? 'text-yellow-600' : 'text-red-600'}">{request.returnCondition}</span></span>
										</div>
									{/if}
									{#if request.returnNotes}
										<div class="flex items-start gap-2 text-xs text-gray-600">
											<span class="mt-0.5 text-gray-500">📝</span>
											<span class="flex-1">{request.returnNotes}</span>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>

					<div class="flex flex-col gap-3 border-t border-gray-100 bg-gray-50/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
						<div class="text-xs font-medium {getStatusHint(request.status, request.rawStatus, request.rejectionReason).color}">
							{getStatusHint(request.status, request.rawStatus, request.rejectionReason).text || ' '}
						</div>
						<div class="flex items-center gap-2">
							<button
								onclick={() => openDetailModal(request)}
								class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
							>
								View Details
							</button>
							{#if request.status === 'pending'}
								<button
									onclick={() => approveRequest(request.rawId)}
									disabled={isActionInFlight(request.rawId) || bulkActionInFlight}
									class="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
								>
									{isActionInFlight(request.rawId) ? 'Approving...' : 'Approve'}
								</button>
								<button
									onclick={() => { selectedRequests = [request.rawId]; showBulkRejectModal = true; }}
									disabled={isActionInFlight(request.rawId) || bulkActionInFlight}
									class="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-100 disabled:text-red-300 disabled:hover:bg-white"
								>
									Reject
								</button>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/each}
		
		{#if filteredRequests.length === 0}
			{@const emptyState = getEmptyState(activeTab, Boolean(searchQuery.trim()))}
			<div class="rounded-xl border border-dashed border-gray-300 bg-gradient-to-b from-gray-50 to-white p-12 text-center shadow-sm">
				<div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pink-50 text-pink-600 ring-1 ring-pink-100">
					<emptyState.icon class="h-7 w-7" />
				</div>
				<h3 class="mt-5 text-base font-semibold text-gray-900">{emptyState.title}</h3>
				<p class="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">{emptyState.description}</p>
				{#if searchQuery.trim()}
					<button
						onclick={() => (searchQuery = '')}
						class="mt-5 inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
					>
						Clear Search
					</button>
				{/if}
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
						<h3 class="text-lg font-semibold">Request Review - {selectedRequest.id}</h3>
						<button onclick={closeDetailModal} class="text-gray-400 hover:text-gray-500">
							<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					</div>
				</div>
				
				<div class="grid max-h-[70vh] grid-cols-1 overflow-y-auto lg:grid-cols-2">
					<!-- Left Panel -->
					<div class="space-y-6 border-gray-200/70 p-6 lg:border-r">
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-3">Student Information</h4>
							<div class="rounded-xl border border-white/70 bg-white/55 p-4 backdrop-blur-sm">
								<div class="flex items-center gap-3 mb-4">
									<div class="flex h-16 w-16 items-center justify-center rounded-full bg-pink-100 text-pink-700 font-semibold text-xl">
										{selectedRequest.student.avatar}
									</div>
									<div>
										<p class="font-semibold">{selectedRequest.student.name}</p>
										<p class="text-sm text-gray-600">{selectedRequest.student.yearLevel} • Block {selectedRequest.student.block}</p>
										<p class="text-xs text-gray-500">{selectedRequest.student.studentId}</p>
									</div>
								</div>
								<div class="space-y-2 text-sm">
									<div class="flex justify-between">
										<span class="text-gray-600">Email:</span>
										<span class="font-medium">{selectedRequest.student.email}</span>
									</div>
								</div>
							</div>
						</div>
						
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-3">Requested Items</h4>
							<div class="space-y-2">
								{#each selectedRequest.items as item}
									{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
									<div class="flex items-center gap-3 rounded-xl border border-white/70 bg-white/55 p-3 backdrop-blur-sm">
										{#if pic}
											<img src={pic} alt={item.name} class="h-10 w-10 rounded object-cover" loading="lazy" />
										{:else}
											<span class="text-2xl">{item.image}</span>
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
							<h4 class="text-sm font-medium text-gray-700 mb-3">Request Details</h4>
							<div class="space-y-3 rounded-xl border border-white/70 bg-white/55 p-4 backdrop-blur-sm">
								<div>
									<p class="text-xs font-medium text-gray-500">Borrow Period</p>
									<p class="mt-1 text-sm">{new Date(selectedRequest.borrowDate).toLocaleDateString()} - {new Date(selectedRequest.returnDate).toLocaleDateString()}</p>
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500">Purpose</p>
									<p class="mt-1 text-sm">{selectedRequest.purpose}</p>
								</div>
							</div>
						</div>
					</div>
					
					<!-- Right Panel -->
					<div class="space-y-6 bg-white/35 p-6">
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-3">Student Borrowing Record</h4>
							<div class="rounded-xl border border-white/70 bg-white/65 p-4 backdrop-blur-sm">
								<div class="mb-4 pb-4 border-b">
									<div class="flex items-center justify-between">
										<span class="text-sm text-gray-600">Trust Score:</span>
										<span class="rounded-full px-3 py-1 text-sm font-semibold {getTrustScoreColor(selectedRequest.borrowingRecord.trustScore)}">
											{selectedRequest.borrowingRecord.trustScore}
										</span>
									</div>
									<div class="mt-2">
										<div class="flex items-center justify-between text-xs text-gray-500 mb-1">
											<span>Return Rate</span>
											<span class="font-semibold">{selectedRequest.borrowingRecord.returnRate}%</span>
										</div>
										<div class="w-full bg-gray-200 rounded-full h-2">
											<div class="bg-green-600 h-2 rounded-full" style="width: {selectedRequest.borrowingRecord.returnRate}%"></div>
										</div>
									</div>
								</div>
								<div class="grid grid-cols-2 gap-4">
									<div class="text-center">
										<p class="text-2xl font-bold">{selectedRequest.borrowingRecord.totalBorrowed}</p>
										<p class="text-xs text-gray-500">Total Borrowed</p>
									</div>
									<div class="text-center">
										<p class="text-2xl font-bold text-yellow-600">{selectedRequest.borrowingRecord.overdue}</p>
										<p class="text-xs text-gray-500">Overdue</p>
									</div>
								</div>
							</div>
						</div>
						
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-3">Equipment Availability</h4>
							<div class="rounded-xl border border-white/70 bg-white/65 p-4 backdrop-blur-sm">
								{#each selectedRequest.items as item}
									<div class="flex items-center justify-between py-2">
										<span class="text-sm">{item.name}</span>
										<span class="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
											✓ Available
										</span>
									</div>
								{/each}
							</div>
						</div>
						
						{#if selectedRequest.status === 'pending'}
							<div>
								<h4 class="text-sm font-medium text-gray-700 mb-3">Quick Actions</h4>
								<div class="space-y-2">
									<button
										onclick={() => approveRequest(selectedRequest.rawId)}
										disabled={isActionInFlight(selectedRequest.rawId) || bulkActionInFlight}
										class="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
									>
										{isActionInFlight(selectedRequest.rawId) ? 'Approving...' : 'Approve Request'}
									</button>
									<button onclick={() => { selectedRequests = [selectedRequest.rawId]; showBulkRejectModal = true; }} disabled={isActionInFlight(selectedRequest.rawId) || bulkActionInFlight} class="w-full rounded-lg border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-200 disabled:text-red-300 disabled:hover:bg-white">
										Reject Request
									</button>
								</div>
							</div>
						{/if}
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

<!-- Bulk Reject Modal -->
{#if showBulkRejectModal}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="fixed inset-0 bg-gray-500 bg-opacity-75" onclick={() => showBulkRejectModal = false}></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
				<h3 class="text-lg font-semibold mb-4">Bulk Reject Requests</h3>
				<div class="space-y-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-2">Rejection Reason</label>
						<select bind:value={rejectReason} class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
							<option value="">Select a reason...</option>
							{#each rejectReasons as reason}
								<option value={reason}>{reason}</option>
							{/each}
						</select>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-2">Additional Details</label>
						<textarea bind:value={rejectDetails} rows="4" class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"></textarea>
					</div>
				</div>
				<div class="mt-6 flex justify-end gap-3">
					<button onclick={() => showBulkRejectModal = false} class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
						Cancel
					</button>
					<button onclick={bulkReject} disabled={!rejectReason || bulkActionInFlight} class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
						{bulkActionInFlight ? 'Processing...' : 'Confirm Rejection'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

