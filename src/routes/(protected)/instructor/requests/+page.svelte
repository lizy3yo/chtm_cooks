<script lang="ts">
import { onMount } from 'svelte';
import { authStore } from '$lib/stores/auth';
import { borrowRequestsAPI, type BorrowRequestRecord, type BorrowRequestStatus } from '$lib/api/borrowRequests';

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

const rejectReasons = [
'Item not suitable for purpose',
'Student inexperienced with equipment',
'Duration too long',
'Item reserved for lab session',
'Better alternative available',
'Other (specify)'
];

function toUiStatus(status: BorrowRequestStatus): 'pending' | 'fulfillment' | 'borrowed' | 'history' {
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
const status = toUiStatus(record.status);
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
} catch (error) {
console.error('Failed to load instructor requests', error);
requests = [];
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

async function approveRequest(rawId: string): Promise<void> {
try {
await borrowRequestsAPI.approve(rawId);
selectedRequests = selectedRequests.filter((id) => id !== rawId);
await loadRequests(true);
} catch (error) {
console.error('Failed to approve request', error);
}
}

async function rejectRequest(rawId: string, reason: string, notes?: string): Promise<void> {
try {
await borrowRequestsAPI.reject(rawId, reason, notes);
selectedRequests = selectedRequests.filter((id) => id !== rawId);
await loadRequests(true);
} catch (error) {
console.error('Failed to reject request', error);
}
}

async function bulkApprove(): Promise<void> {
for (const rawId of selectedRequests) {
await approveRequest(rawId);
}
selectedRequests = [];
}

async function bulkReject(): Promise<void> {
if (!rejectReason) return;
for (const rawId of selectedRequests) {
await rejectRequest(rawId, rejectReason, rejectDetails || undefined);
}
selectedRequests = [];
showBulkRejectModal = false;
rejectReason = '';
rejectDetails = '';
}

function getTrustScoreColor(score: string) {
switch (score) {
case 'Excellent': return 'bg-green-100 text-green-800';
case 'Good': return 'bg-blue-100 text-blue-800';
case 'Fair': return 'bg-yellow-100 text-yellow-800';
default: return 'bg-gray-100 text-gray-800';
}
}

function getStatusBadge(status: string, rawStatus?: BorrowRequestStatus, custodianStatus?: string) {
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
text: rawStatus === 'rejected' ? 'Rejected' : 'Returned',
color: rawStatus === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-teal-100 text-teal-800',
icon: rawStatus === 'rejected' ? 'Rejected' : 'Returned'
};
default:
return { text: status, color: 'bg-gray-100 text-gray-800', icon: 'Status' };
}
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
					<svg class="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
					</svg>
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
					<svg class="h-6 w-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
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
					<svg class="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
					</svg>
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
					<svg class="h-6 w-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
					</svg>
				</div>
			</div>
		</div>
	</div>
	
	<!-- Bulk Actions Bar -->
	{#if selectedRequests.length > 0}
		<div class="rounded-lg border-2 border-pink-200 bg-pink-50 p-4">
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-pink-900">
					{selectedRequests.length} selected
				</span>
				<div class="flex gap-2">
					<button onclick={bulkApprove} class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
						Bulk Approve
					</button>
					<button onclick={() => showBulkRejectModal = true} class="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
						Bulk Reject
					</button>
					<button onclick={() => selectedRequests = []} class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
						Clear
					</button>
				</div>
			</div>
		</div>
	{/if}
	
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
			<div class="flex items-center justify-between rounded-lg bg-gray-50 p-3">
				<label class="flex items-center gap-2">
					<input type="checkbox" class="h-4 w-4 rounded border-gray-300 text-pink-600">
					<span class="text-sm font-medium text-gray-700">Select All ({filteredRequests.length})</span>
				</label>
				<span class="text-xs text-gray-500">
					Showing {filteredRequests.length} of {tabCounts.pending} requests
				</span>
			</div>
		{:else}
			<div class="flex items-center justify-between rounded-lg bg-gray-50 p-3">
				<span class="text-sm font-medium text-gray-700">
					{filteredRequests.length} {filteredRequests.length === 1 ? 'request' : 'requests'} found
				</span>
			</div>
		{/if}
		
		{#each filteredRequests as request}
			<div class="rounded-lg bg-white p-6 shadow">
				<div class="flex gap-4">
					{#if request.status === 'pending'}
						<input
							type="checkbox"
							checked={selectedRequests.includes(request.rawId)}
							onchange={() => toggleSelectRequest(request.rawId)}
							class="h-5 w-5 rounded border-gray-300 text-pink-600"
						/>
					{/if}
					
					<div class="flex-1">
						<div class="flex items-start justify-between">
							<div class="flex items-center gap-3">
								<div class="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100 text-pink-700 font-semibold">
									{request.student.avatar}
								</div>
								<div>
									<h3 class="text-lg font-semibold">{request.student.name}</h3>
									<p class="text-sm text-gray-500">{request.student.yearLevel} • Block {request.student.block}</p>
									<p class="text-xs text-gray-400">{request.id} • {new Date(request.requestDate).toLocaleDateString()}</p>
								</div>
								{#if request.status !== 'pending'}
									{@const badge = getStatusBadge(request.status, request.rawStatus, request.custodianStatus)}
									<span class="ml-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold {badge.color}">
										<span>{badge.icon}</span>
										<span>{badge.text}</span>
									</span>
								{/if}
							</div>
							<div class="flex flex-col gap-2">
								<button
									onclick={() => openDetailModal(request)}
									class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
								>
									Review Details
								</button>
								{#if request.status === 'pending'}
									<button onclick={() => approveRequest(request.rawId)} class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
										✓ Approve
									</button>
									<button onclick={() => { selectedRequests = [request.rawId]; showBulkRejectModal = true; }} class="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
										✗ Reject
									</button>
								{/if}
							</div>
						</div>
						
						<div class="mt-4">
							<p class="text-sm font-medium text-gray-700">Items:</p>
							<div class="mt-2 flex flex-wrap gap-2">
								{#each request.items as item}
									<div class="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
										<span class="mr-2 text-lg">{item.image}</span>
										<span class="text-sm font-medium">{item.name}</span>
									</div>
								{/each}
							</div>
						</div>
						
						<div class="mt-4 grid grid-cols-3 gap-3">
							<div>
								<p class="text-xs font-medium text-gray-500">Borrow Period</p>
								<p class="mt-1 text-sm text-gray-900">
									{new Date(request.borrowDate).toLocaleDateString()} - {new Date(request.returnDate).toLocaleDateString()}
								</p>
							</div>
							<div>
								<p class="text-xs font-medium text-gray-500">Purpose</p>
								<p class="mt-1 text-sm text-gray-900">{request.purpose}</p>
							</div>
							<div>
								<p class="text-xs font-medium text-gray-500">Trust Score</p>
								<span class="mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold {getTrustScoreColor(request.borrowingRecord.trustScore)}">
									{request.borrowingRecord.trustScore}
								</span>
							</div>
						</div>
						
						{#if request.status !== 'pending'}
							<div class="mt-4 rounded-lg bg-gray-50 p-4">
								<p class="text-xs font-medium text-gray-700 mb-2">Workflow Status</p>
								<div class="space-y-2">
									{#if request.approvedDate}
										<div class="flex items-center gap-2 text-xs">
											<span class="text-green-600">✓</span>
											<span class="text-gray-600">Approved by {request.approvedBy} on {request.approvedDate}</span>
										</div>
									{/if}
									{#if request.custodianStatus}
										<div class="flex items-center gap-2 text-xs">
											<span class="{request.custodianStatus === 'Ready for Pickup' || request.custodianStatus === 'Picked Up' || request.custodianStatus === 'Return Requested' || request.custodianStatus === 'Returned' ? 'text-green-600' : request.custodianStatus === 'Missing - Investigation' ? 'text-rose-600' : 'text-blue-600'}">
												{request.custodianStatus === 'Ready for Pickup' || request.custodianStatus === 'Picked Up' || request.custodianStatus === 'Return Requested' || request.custodianStatus === 'Returned' ? '✓' : request.custodianStatus === 'Missing - Investigation' ? '⚠' : '⏳'}
											</span>
											<span class="text-gray-600">Custodian Status: {request.custodianStatus}</span>
										</div>
									{/if}
									{#if request.releasedDate}
										<div class="flex items-center gap-2 text-xs">
											<span class="text-green-600">✓</span>
											<span class="text-gray-600">Released on {request.releasedDate}</span>
										</div>
									{/if}
									{#if request.pickedUpDate}
										<div class="flex items-center gap-2 text-xs">
											<span class="text-green-600">✓</span>
											<span class="text-gray-600">Picked up on {request.pickedUpDate}</span>
										</div>
									{/if}
									{#if request.actualReturnDate}
										<div class="flex items-center gap-2 text-xs">
											<span class="text-green-600">✓</span>
											<span class="text-gray-600">Returned on {request.actualReturnDate}</span>
										</div>
									{/if}
									{#if request.returnCondition}
										<div class="flex items-center gap-2 text-xs">
											<span class="text-gray-500">•</span>
											<span class="text-gray-600">Condition: <span class="font-medium {request.returnCondition === 'Good' ? 'text-green-600' : request.returnCondition === 'Fair' ? 'text-yellow-600' : 'text-red-600'}">{request.returnCondition}</span></span>
										</div>
									{/if}
									{#if request.returnNotes}
										<div class="flex items-start gap-2 text-xs">
											<span class="text-gray-500 mt-0.5">📝</span>
											<span class="text-gray-600 flex-1">{request.returnNotes}</span>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/each}
		
		{#if filteredRequests.length === 0}
			<div class="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
				<p class="text-gray-500">No requests found</p>
			</div>
		{/if}
	</div>
</div>


<!-- Detail Modal -->
{#if showDetailModal && selectedRequest}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="fixed inset-0 bg-gray-500 bg-opacity-75" onclick={closeDetailModal}></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative w-full max-w-6xl rounded-lg bg-white shadow-xl">
				<div class="border-b border-gray-200 bg-gray-50 px-6 py-4">
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">Request Review - {selectedRequest.id}</h3>
						<button onclick={closeDetailModal} class="text-gray-400 hover:text-gray-500">
							<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					</div>
				</div>
				
				<div class="grid grid-cols-2 max-h-[70vh] overflow-y-auto">
					<!-- Left Panel -->
					<div class="border-r border-gray-200 p-6 space-y-6">
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-3">Student Information</h4>
							<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
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
									<div class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
										<span class="text-2xl">{item.image}</span>
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
							<div class="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
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
					<div class="p-6 space-y-6 bg-gray-50">
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-3">Student Borrowing Record</h4>
							<div class="rounded-lg border border-gray-200 bg-white p-4">
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
							<div class="rounded-lg border border-gray-200 bg-white p-4">
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
									<button onclick={() => approveRequest(selectedRequest.rawId)} class="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700">
										Approve Request
									</button>
									<button onclick={() => { selectedRequests = [selectedRequest.rawId]; showBulkRejectModal = true; }} class="w-full rounded-lg border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-50">
										Reject Request
									</button>
								</div>
							</div>
						{/if}
					</div>
				</div>
				
				<div class="border-t border-gray-200 bg-gray-50 px-6 py-4">
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
					<button onclick={bulkReject} disabled={!rejectReason} class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
						Confirm Rejection
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

