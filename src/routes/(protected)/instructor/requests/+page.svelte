<script lang="ts">
import { onMount } from 'svelte';
import { authStore } from '$lib/stores/auth';
import { confirmStore } from '$lib/stores/confirm';
import { toastStore } from '$lib/stores/toast';
import { borrowRequestsAPI, type BorrowRequestRecord, type BorrowRequestStatus } from '$lib/api/borrowRequests';
import { catalogAPI } from '$lib/api/catalog';
import { classCodesAPI, type ClassCodeResponse } from '$lib/api/classCodes';
import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
import RequestDetailModal from '$lib/components/instructor/RequestDetailModal.svelte';
import {
	Archive,
	CalendarDays,
	CheckCircle2,
	CircleAlert,
	CircleX,
	ClipboardList,
	Clock3,
	FileText,
	Package,
	PackageCheck,
	SearchX,
	UserCircle
} from 'lucide-svelte';

let activeTab = $state<'pending' | 'fulfillment' | 'borrowed' | 'unresolved' | 'history'>('pending');
let historySubTab = $state<'all' | 'completed' | 'resolved' | 'cancelled'>('all');
let showDetailModal = $state(false);
let selectedRequest = $state<any>(null);
let selectedRequests = $state<string[]>([]);
let showBulkRejectModal = $state(false);
let rejectReason = $state('');
let rejectDetails = $state('');
let searchQuery = $state('');
let sortBy = $state<'date' | 'student' | 'status'>('date');
let viewMode = $state<'list' | 'card'>('list');
let requests = $state<any[]>([]);
let itemPictureCache = $state<Map<string, string>>(new Map());
let classCodeCache = $state<Map<string, ClassCodeResponse>>(new Map());
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

function toUiStatus(status: BorrowRequestStatus, rejectionReason?: string): 'pending' | 'fulfillment' | 'borrowed' | 'unresolved' | 'history' {
switch (status) {
case 'pending_instructor':
return 'pending';
case 'approved_instructor':
case 'ready_for_pickup':
return 'fulfillment';
case 'borrowed':
case 'pending_return':
return 'borrowed';
case 'missing':
return 'unresolved';
case 'resolved':
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
	avatarUrl: record.student?.profilePhotoUrl || null,
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
usageLocation: record.usageLocation,
classCodeId: record.classCodeId,
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
missingDate: formatDateTime(record.missingAt),
resolvedDate: formatDateTime(record.resolvedAt),
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
await backfillClassCodes();
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

async function backfillClassCodes(): Promise<void> {
	const missingClassCodeIds = new Set<string>();
	for (const req of requests) {
		if (req.classCodeId && !classCodeCache.has(req.classCodeId)) {
			missingClassCodeIds.add(req.classCodeId);
		}
	}

	if (missingClassCodeIds.size === 0) return;

	try {
		const next = new Map(classCodeCache);
		for (const classCodeId of missingClassCodeIds) {
			try {
				const classCode = await classCodesAPI.getById(classCodeId);
				next.set(classCodeId, classCode);
			} catch {
				// Skip if class code not found
			}
		}
		classCodeCache = next;
	} catch {
		// Keep graceful fallback when class codes are unavailable.
	}
}

onMount(() => {
	let mounted = true;

	(async () => {
		await loadRequests(true);
		if (!mounted) return;
	})();

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
		mounted = false;
		window.clearInterval(intervalId);
		window.removeEventListener('focus', refresh);
		document.removeEventListener('visibilitychange', onVisibilityChange);
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
fulfillmentCount: requests.filter(r => r.status === 'fulfillment').length,
borrowedCount: requests.filter(r => r.status === 'borrowed').length,
completedCount: requests.filter(r => r.status === 'history').length
});

const tabCounts = $derived({
pending: requests.filter(r => r.status === 'pending').length,
fulfillment: requests.filter(r => r.status === 'fulfillment').length,
borrowed: requests.filter(r => r.status === 'borrowed').length,
unresolved: requests.filter(r => r.status === 'unresolved').length,
history: requests.filter(r => r.status === 'history').length,
historyResolved: requests.filter(r => r.rawStatus === 'resolved').length,
historyCompleted: requests.filter(r => r.rawStatus === 'returned').length,
historyCancelled: requests.filter(r => r.rawStatus === 'cancelled' || r.rawStatus === 'rejected').length
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

	const confirmed = await confirmStore.confirm({
		title: 'Approve Request',
		message: 'Approve this request and forward it to custodian fulfillment?',
		type: 'info',
		confirmText: 'Approve',
		cancelText: 'Cancel'
	});

	if (!confirmed) return;

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

	const confirmed = await confirmStore.warning(
		`Approve ${requestIds.length} selected request${requestIds.length === 1 ? '' : 's'}?`,
		'Bulk Approve Requests',
		'Approve All',
		'Cancel'
	);

	if (!confirmed) return;

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

	const confirmed = await confirmStore.danger(
		`Reject ${requestIds.length} selected request${requestIds.length === 1 ? '' : 's'} with the provided reason?`,
		'Confirm Bulk Rejection',
		'Reject Requests',
		'Review Again'
	);

	if (!confirmed) return;

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
			return 'border-violet-500';
		case 'unresolved':
			return 'border-rose-500';
		case 'history':
			if (rawStatus === 'resolved') return 'border-emerald-400';
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
		return PackageCheck;
	}
	if (status === 'unresolved') return CircleAlert;
	if (status === 'history') return rawStatus === 'rejected' || isCancelledRequest(rawStatus ?? 'returned', rejectionReason) ? CircleX : CheckCircle2;
	return Clock3;
}

function getStatusLabel(status: string, rawStatus?: BorrowRequestStatus, rejectionReason?: string): string {
	if (status === 'pending') return 'Pending Review';
	if (status === 'fulfillment') return rawStatus === 'ready_for_pickup' ? 'Ready for Pickup' : 'In Preparation';
	if (status === 'borrowed') {
		if (rawStatus === 'pending_return') return 'Return Requested';
		return 'Active Loan';
	}
	if (status === 'unresolved') return 'Unresolved';
	if (status === 'history') {
		if (rawStatus === 'resolved') return 'Resolved';
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
		return 'bg-violet-100 text-violet-800';
	}
	if (status === 'unresolved') return 'bg-rose-100 text-rose-800';
	if (status === 'history') {
		if (rawStatus === 'resolved') return 'bg-emerald-100 text-emerald-800';
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

		return {
			text: 'The equipment is currently checked out to the student.',
			color: 'text-violet-700'
		};
	}

	if (status === 'unresolved') {
		return {
			text: 'This request has open incident cases. Coordinate with the custodian to resolve outstanding damage or missing items.',
			color: 'text-rose-700'
		};
	}

	if (status === 'history') {
		if (rawStatus === 'resolved') {
			return {
				text: 'All replacement obligations from this incident have been settled. The request is fully resolved.',
				color: 'text-emerald-700'
			};
		}
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
case 'unresolved':
return {
text: 'Unresolved',
color: 'bg-rose-100 text-rose-800',
icon: 'Alert'
};
case 'history':
return {
text: rawStatus === 'resolved' ? 'Resolved' : isCancelledRequest(rawStatus ?? 'returned', rejectionReason) ? 'Cancelled' : rawStatus === 'rejected' ? 'Rejected' : 'Returned',
color: rawStatus === 'resolved' ? 'bg-emerald-100 text-emerald-800' : isCancelledRequest(rawStatus ?? 'returned', rejectionReason) ? 'bg-slate-100 text-slate-800' : rawStatus === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-teal-100 text-teal-800',
icon: rawStatus === 'resolved' ? 'Resolved' : isCancelledRequest(rawStatus ?? 'returned', rejectionReason) ? 'Cancelled' : rawStatus === 'rejected' ? 'Rejected' : 'Returned'
};
default:
return { text: status, color: 'bg-gray-100 text-gray-800', icon: 'Status' };
}
}

function getEmptyState(tab: 'pending' | 'fulfillment' | 'borrowed' | 'unresolved' | 'history', hasSearch: boolean) {
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
			description: 'Requests that have been picked up or are pending return will appear here.'
		};
	}

	if (tab === 'unresolved') {
		return {
			icon: CircleAlert,
			title: 'No unresolved requests',
			description: 'Requests with open damage or missing item incidents will appear here.'
		};
	}

	return {
		icon: Archive,
		title: 'No request history yet',
		description: 'Returned, resolved, cancelled, and rejected requests will appear here once the workflow is completed.'
	};
}
</script>


<svelte:head>
	<title>Student Requests - Instructor Portal</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Student Requests</h1>
		<p class="mt-1 text-sm text-gray-500">Review and approve equipment borrow requests</p>
	</div>

	<!-- Stats Cards -->
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Total</p>
					<p class="mt-1 text-xl font-semibold text-gray-900 sm:mt-2 sm:text-3xl">{stats.totalRequests}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 sm:h-12 sm:w-12">
					<ClipboardList class="h-5 w-5 text-blue-600 sm:h-6 sm:w-6" />
				</div>
			</div>
		</div>
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Pending</p>
					<p class="mt-1 text-xl font-semibold text-amber-600 sm:mt-2 sm:text-3xl">{stats.pendingCount}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 sm:h-12 sm:w-12">
					<Clock3 class="h-5 w-5 text-amber-600 sm:h-6 sm:w-6" />
				</div>
			</div>
		</div>
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">With Custodian</p>
					<p class="mt-1 text-xl font-semibold text-blue-600 sm:mt-2 sm:text-3xl">{stats.fulfillmentCount}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 sm:h-12 sm:w-12">
					<PackageCheck class="h-5 w-5 text-blue-600 sm:h-6 sm:w-6" />
				</div>
			</div>
		</div>
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Completed</p>
					<p class="mt-1 text-xl font-semibold text-teal-600 sm:mt-2 sm:text-3xl">{stats.completedCount}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 sm:h-12 sm:w-12">
					<CheckCircle2 class="h-5 w-5 text-teal-600 sm:h-6 sm:w-6" />
				</div>
			</div>
		</div>
	</div>

	<!-- Tab Bar -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex" aria-label="Tabs">
			{#each [
				{ key: 'pending',     label: 'Pending',     shortLabel: 'Pending',  count: tabCounts.pending,     urgent: false },
				{ key: 'fulfillment', label: 'Preparation', shortLabel: 'Prep',     count: tabCounts.fulfillment, urgent: false },
				{ key: 'borrowed',    label: 'Borrowed',    shortLabel: 'Borrowed', count: tabCounts.borrowed,    urgent: false },
				{ key: 'unresolved',  label: 'Unresolved',  shortLabel: 'Issues',   count: tabCounts.unresolved,  urgent: tabCounts.unresolved > 0 },
				{ key: 'history',     label: 'History',     shortLabel: 'History',  count: tabCounts.history,     urgent: false }
			] as tab}
				<button
					onclick={() => { activeTab = tab.key as typeof activeTab; }}
					class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium transition-colors sm:text-sm
						{activeTab === tab.key ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
				>
					<span class="hidden sm:inline">{tab.label}</span>
					<span class="sm:hidden">{tab.shortLabel}</span>
					<span class="rounded-full px-1.5 py-0.5 text-[10px]
						{activeTab === tab.key
							? (tab.urgent ? 'bg-rose-100 text-rose-700' : 'bg-pink-100 text-pink-600')
							: (tab.urgent ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-gray-600')}">
						{tab.count}
					</span>
				</button>
			{/each}
		</nav>
	</div>

	<!-- Card Container -->
	<div class="rounded-lg bg-white shadow">
		<div class="p-4 sm:p-6">

			<!-- History Sub-tabs -->
			{#if activeTab === 'history'}
				<div class="-mx-4 -mt-4 mb-5 border-b border-gray-200 px-4 sm:-mx-6 sm:-mt-6 sm:mb-6 sm:px-6">
					<nav class="-mb-px flex overflow-x-auto" aria-label="History filter" style="scrollbar-width:none">
						{#each [
							{ key: 'all',       label: 'All',       count: tabCounts.history },
							{ key: 'resolved',  label: 'Resolved',  count: tabCounts.historyResolved },
							{ key: 'completed', label: 'Completed', count: tabCounts.historyCompleted },
							{ key: 'cancelled', label: 'Cancelled', count: tabCounts.historyCancelled }
						] as sub}
							<button
								onclick={() => (historySubTab = sub.key as typeof historySubTab)}
								class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-2 py-3 text-[11px] font-medium transition-colors sm:flex-none sm:px-4 sm:text-sm
									{historySubTab === sub.key ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
							>
								<span class="truncate">{sub.label}</span>
								<span class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] {historySubTab === sub.key ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">{sub.count}</span>
							</button>
						{/each}
					</nav>
				</div>
			{/if}

			<!-- Search + Sort + Bulk Actions -->
			<div class="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-1 items-center gap-2">
					{#if activeTab === 'pending'}
						<input
							type="checkbox"
							checked={filteredRequests.length > 0 && filteredRequests.every(r => selectedRequests.includes(r.rawId))}
							onchange={toggleSelectAllVisiblePendingRequests}
							class="h-4 w-4 rounded border-gray-300 text-pink-600"
							aria-label="Select all"
						/>
					{/if}
					<div class="relative flex-1 max-w-sm">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
							<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
						</div>
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search by student, ID, or item…"
							class="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
						/>
					</div>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					{#if activeTab === 'pending' && selectedRequests.length > 0}
						<span class="text-xs text-gray-500">{selectedRequests.length} selected</span>
						<button onclick={bulkApprove} disabled={bulkActionInFlight} class="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
							{bulkActionInFlight ? 'Processing…' : 'Approve'}
						</button>
						<button onclick={() => showBulkRejectModal = true} disabled={bulkActionInFlight} class="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
							Reject
						</button>
						<button onclick={() => selectedRequests = []} class="text-xs text-gray-400 hover:text-gray-600">Clear</button>
					{:else}
						<select bind:value={sortBy} class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500">
							<option value="date">Date</option>
							<option value="student">Student</option>
							<option value="status">Status</option>
						</select>
					{/if}
				</div>
			</div>

			<!-- Toggle Bar -->
			<div class="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
				<div class="flex min-w-0 items-center gap-2">
					<span class="text-sm font-semibold text-gray-700">
						{filteredRequests.length}
						{filteredRequests.length === 1 ? 'request' : 'requests'} found
					</span>
					<span class="hidden rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200 sm:inline-flex">
						{viewMode === 'list' ? 'Table view' : 'Card view'}
					</span>
				</div>
				<div class="flex flex-wrap items-center justify-end gap-2">
					<div class="flex overflow-hidden rounded-lg border border-gray-300">
						<button
							onclick={() => (viewMode = 'list')}
							aria-label="Table view"
							class="flex h-10 w-10 items-center justify-center text-sm transition-colors {viewMode === 'list' ? 'bg-pink-100 text-pink-700' : 'bg-white text-gray-600 hover:bg-gray-50'}"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
							</svg>
						</button>
						<button
							onclick={() => (viewMode = 'card')}
							aria-label="Card view"
							class="flex h-10 w-10 items-center justify-center border-l border-gray-300 text-sm transition-colors {viewMode === 'card' ? 'bg-pink-100 text-pink-700' : 'bg-white text-gray-600 hover:bg-gray-50'}"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
							</svg>
						</button>
					</div>
					<button class="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-pink-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-pink-700 sm:gap-2 sm:px-4 sm:text-sm">
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
						</svg>
						<span class="hidden sm:inline">Export</span>
					</button>
				</div>
			</div>

			<!-- Request Views -->
			{#if filteredRequests.length > 0}
				{#if viewMode === 'card'}
					<div style="min-height: 600px;">
						<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" style="align-content: start;">
							{#each filteredRequests as request}
								<div class="relative overflow-hidden rounded-xl border-l-4 bg-white shadow-sm ring-1 ring-gray-200 transition-all hover:shadow-md {getCardBorderColor(request.status, request.rawStatus, request.rejectionReason)}">
									{#if activeTab === 'pending'}
										<div class="absolute top-4 right-4 z-10">
											<input
												type="checkbox"
												checked={selectedRequests.includes(request.rawId)}
												onchange={() => toggleSelectRequest(request.rawId)}
												class="h-4 w-4 rounded border-gray-300 text-pink-600 shadow-sm focus:border-pink-500 focus:ring-pink-500"
											/>
										</div>
									{/if}
									<div class="p-4 sm:p-5">
										<!-- Header: Student, Request ID, Status -->
										<div class="mb-3 flex items-start justify-between gap-3">
											<div class="flex min-w-0 flex-1 items-center gap-3">
												<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
													{#if request.student.avatarUrl}
														<img src={request.student.avatarUrl} alt={request.student.name} class="h-full w-full object-cover" loading="lazy" />
													{:else}
														{request.student.avatar}
													{/if}
												</div>
												<div class="flex min-w-0 flex-col gap-1">
													<span class="font-semibold text-gray-900 truncate">{request.student.name}</span>
													<span class="text-xs font-mono text-gray-500 truncate">{request.id}</span>
												</div>
											</div>
											{#if activeTab !== 'pending'}
												<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold {getStatusBadge(request.status, request.rawStatus, undefined, request.rejectionReason).color}">
													{getStatusBadge(request.status, request.rawStatus, undefined, request.rejectionReason).text}
												</span>
											{/if}
										</div>

										<!-- Qty & Date -->
										<div class="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
											<div class="flex items-center gap-1.5">
												<Package class="h-4 w-4" />
												<span class="font-medium text-gray-900">Qty: {request.items.reduce((sum: number, item: any) => sum + item.quantity, 0)}</span>
											</div>
											<div class="flex items-center gap-1.5">
												<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
												<span>{new Date(request.requestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
											</div>
										</div>
									</div>

									<!-- Card Footer -->
									<div class="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:px-5">
										<div class="relative flex flex-wrap items-center gap-2">
											{#if request.status === 'pending'}
												<button
													onclick={() => approveRequest(request.rawId)}
													disabled={isActionInFlight(request.rawId) || bulkActionInFlight}
													class="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
												>
													{isActionInFlight(request.rawId) ? 'Approving…' : 'Approve'}
												</button>
												<button
													onclick={() => { selectedRequests = [request.rawId]; showBulkRejectModal = true; }}
													disabled={isActionInFlight(request.rawId) || bulkActionInFlight}
													class="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
												>
													Reject
												</button>
											{/if}
											<button
												onclick={() => openDetailModal(request)}
												class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1"
											>
												View Details
												<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
											</button>
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<!-- List View -->
					<div style="min-height: 600px;">
						<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
							<div class="hidden border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold tracking-wide text-gray-500 uppercase md:grid md:grid-cols-[auto_1.1fr_1fr_1.5fr_1fr_auto] md:items-center md:gap-3">
								<span class="w-6 text-center">
									{#if activeTab === 'pending'}
										<input
											type="checkbox"
											checked={filteredRequests.length > 0 && filteredRequests.every(r => selectedRequests.includes(r.rawId))}
											onchange={toggleSelectAllVisiblePendingRequests}
											class="h-4 w-4 rounded border-gray-300 text-pink-600 shadow-sm focus:border-pink-500 focus:ring-pink-500"
											aria-label="Select all"
										/>
									{/if}
								</span>
								<span>Request</span>
								<span>Student</span>
								<span>Items</span>
								<span>Status</span>
								<span class="text-right">Actions</span>
							</div>
							<div class="divide-y divide-gray-100">
								{#each filteredRequests as request}
									<div class="grid gap-3 p-4 md:grid-cols-[auto_1.1fr_1fr_1.5fr_1fr_auto] md:items-center md:gap-3 hover:bg-gray-50 transition-colors">
										<div class="w-6 flex justify-center">
											{#if activeTab === 'pending'}
												<input
													type="checkbox"
													checked={selectedRequests.includes(request.rawId)}
													onchange={() => toggleSelectRequest(request.rawId)}
													class="h-4 w-4 rounded border-gray-300 text-pink-600 shadow-sm focus:border-pink-500 focus:ring-pink-500"
												/>
											{/if}
										</div>

										<div class="min-w-0">
											<p class="font-mono text-xs font-bold tracking-wider text-gray-900">{request.id}</p>
											<p class="mt-1 text-xs text-gray-500">
												{new Date(request.requestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
											</p>
										</div>

										<div class="flex min-w-0 items-center gap-3">
											<div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
												{#if request.student.avatarUrl}
													<img src={request.student.avatarUrl} alt={request.student.name} class="h-full w-full object-cover" loading="lazy" />
												{:else}
													{request.student.avatar}
												{/if}
											</div>
											<div class="min-w-0">
												<p class="truncate text-sm font-semibold text-gray-900">{request.student.name}</p>
												<p class="truncate text-xs text-gray-500">{request.student.yearLevel} • Block {request.student.block}</p>
											</div>
										</div>

										<div class="min-w-0">
											<div class="flex flex-wrap gap-1.5">
												{#each request.items.slice(0, 2) as item}
													<span class="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
														<span class="max-w-[120px] truncate">{item.name}</span>
														<span class="ml-1 text-gray-400">x{item.quantity}</span>
													</span>
												{/each}
												{#if request.items.length > 2}
													<span class="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">+{request.items.length - 2} more</span>
												{/if}
											</div>
											<p class="mt-1 truncate text-xs text-gray-500">{request.purpose}</p>
										</div>

										<div class="min-w-0">
											<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold {getStatusBadge(request.status, request.rawStatus, undefined, request.rejectionReason).color}">
												<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
												{getStatusBadge(request.status, request.rawStatus, undefined, request.rejectionReason).text}
											</span>
										</div>

										<div class="relative flex flex-wrap items-center gap-2 md:justify-end">
											<button
												onclick={() => openDetailModal(request)}
												class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
											>
												Details
											</button>
											{#if request.status === 'pending'}
												<button
													onclick={() => approveRequest(request.rawId)}
													disabled={isActionInFlight(request.rawId) || bulkActionInFlight}
													class="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
												>
													{isActionInFlight(request.rawId) ? 'Approving…' : 'Approve'}
												</button>
												<button
													onclick={() => { selectedRequests = [request.rawId]; showBulkRejectModal = true; }}
													disabled={isActionInFlight(request.rawId) || bulkActionInFlight}
													class="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
												>
													Reject
												</button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			{:else}
				<!-- Completely empty state -->
				{@const emptyState = getEmptyState(activeTab, Boolean(searchQuery.trim()))}
				<div class="py-16 text-center" style="min-height: 600px; display: flex; align-items: center; justify-content: center;">
					<div>
						<div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
							<emptyState.icon class="h-10 w-10 text-pink-600" />
						</div>
						<h3 class="mt-6 text-base font-semibold text-gray-900">{emptyState.title}</h3>
						<p class="mx-auto mt-2 max-w-md text-sm text-gray-600">{emptyState.description}</p>
						{#if searchQuery.trim()}
							<button onclick={() => (searchQuery = '')} class="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
								Clear Search
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>


<!-- Detail Modal -->
{#if showDetailModal && selectedRequest}
	<RequestDetailModal
		request={selectedRequest}
		{itemPictureCache}
		{classCodeCache}
		{isActionInFlight}
		{bulkActionInFlight}
		onClose={closeDetailModal}
		onApprove={approveRequest}
		onReject={(rawId) => { selectedRequests = [rawId]; showBulkRejectModal = true; }}
		{getStatusLabel}
		{getStatusColor}
	/>
{/if}

<!-- Bulk Reject Modal -->
{#if showBulkRejectModal}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm" onclick={() => showBulkRejectModal = false} aria-label="Close modal" tabindex="-1"></button>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
				<h3 class="text-lg font-semibold text-gray-900">Reject Request{selectedRequests.length > 1 ? 's' : ''}</h3>
				<p class="mt-1 text-sm text-gray-500">{selectedRequests.length > 1 ? `Rejecting ${selectedRequests.length} requests.` : 'Provide a reason for rejection.'}</p>
				<div class="mt-4 space-y-4">
					<div>
						<label for="reject-reason" class="mb-1.5 block text-sm font-medium text-gray-700">Rejection Reason</label>
						<select id="reject-reason" bind:value={rejectReason} class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500">
							<option value="">Select a reason…</option>
							{#each rejectReasons as reason}
								<option value={reason}>{reason}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="reject-details" class="mb-1.5 block text-sm font-medium text-gray-700">Additional Notes <span class="text-gray-400">(optional)</span></label>
						<textarea id="reject-details" bind:value={rejectDetails} rows="3" placeholder="Add any additional context…" class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"></textarea>
					</div>
				</div>
				<div class="mt-6 flex justify-end gap-3">
					<button onclick={() => { showBulkRejectModal = false; rejectReason = ''; rejectDetails = ''; selectedRequests = []; }} class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
					<button onclick={bulkReject} disabled={!rejectReason || bulkActionInFlight} class="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
						{bulkActionInFlight ? 'Processing…' : 'Confirm Rejection'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
