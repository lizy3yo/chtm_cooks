<script lang="ts">
import { onMount } from 'svelte';
import { borrowRequestsAPI, type BorrowRequestRecord } from '$lib/api/borrowRequests';

let activeTab = $state<'all' | 'pending' | 'approved' | 'ready' | 'picked-up' | 'returned' | 'rejected'>('all');
let searchQuery = $state('');
let sortBy = $state('newest');
let showDetailModal = $state(false);
let selectedRequest = $state<any>(null);
let dateFilter = $state({ from: '', to: '' });
let requests = $state<any[]>([]);

function inferItemIcon(itemName: string): string {
const normalized = itemName.toLowerCase();
if (normalized.includes('knife')) return 'Knife';
if (normalized.includes('bowl')) return 'Bowl';
if (normalized.includes('scale')) return 'Scale';
if (normalized.includes('mixer')) return 'Mixer';
if (normalized.includes('processor')) return 'Processor';
return 'Item';
}

function toUiStatus(status: BorrowRequestRecord['status']): 'pending' | 'approved' | 'ready' | 'picked-up' | 'returned' | 'rejected' {
switch (status) {
case 'pending_instructor':
return 'pending';
case 'approved_instructor':
return 'approved';
case 'ready_for_pickup':
return 'ready';
case 'borrowed':
return 'picked-up';
case 'returned':
return 'returned';
case 'rejected':
return 'rejected';
default:
return 'approved';
}
}

function formatRequestCode(id: string): string {
return `REQ-${id.slice(-6).toUpperCase()}`;
}

function mapRequest(request: BorrowRequestRecord): any {
const uiStatus = toUiStatus(request.status);
return {
rawId: request.id,
id: formatRequestCode(request.id),
items: request.items.map((item) => ({
name: item.name,
image: inferItemIcon(item.name)
})),
status: uiStatus,
requestDate: request.createdAt,
borrowDate: request.borrowDate,
returnDate: request.returnDate,
purpose: request.purpose,
instructor: request.instructor?.fullName || 'Pending Assignment',
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
}
}

onMount(async () => {
await loadRequests();
});

function getStatusColor(status: string) {
switch (status) {
case 'pending': return 'bg-yellow-100 text-yellow-800';
case 'approved': return 'bg-blue-100 text-blue-800';
case 'ready': return 'bg-green-100 text-green-800';
case 'picked-up': return 'bg-purple-100 text-purple-800';
case 'returned': return 'bg-teal-100 text-teal-800';
case 'rejected': return 'bg-red-100 text-red-800';
default: return 'bg-gray-100 text-gray-800';
}
}

function getStatusIcon(status: string) {
switch (status) {
case 'pending': return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z';
case 'approved': return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
case 'ready': return 'M5 13l4 4L19 7';
case 'picked-up': return 'M3 3h2.586a1 1 0 01.707.293L12 10.586l5.707-5.707a1 1 0 01.707-.293H21a1 1 0 011 1v14a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z';
case 'returned': return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
case 'rejected': return 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z';
default: return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z';
}
}

const filteredRequests = $derived.by(() => {
	let result = requests.filter((req) => {
		if (activeTab !== 'all' && req.status !== activeTab) return false;
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
all: requests.length,
pending: requests.filter((r) => r.status === 'pending').length,
approved: requests.filter((r) => r.status === 'approved').length,
ready: requests.filter((r) => r.status === 'ready').length,
'picked-up': requests.filter((r) => r.status === 'picked-up').length,
returned: requests.filter((r) => r.status === 'returned').length,
rejected: requests.filter((r) => r.status === 'rejected').length
});

const stats = $derived({
totalRequests: requests.length,
pendingCount: requests.filter(r => r.status === 'pending').length,
activeCount: requests.filter(r => ['approved', 'ready', 'picked-up'].includes(r.status)).length,
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

async function pickupNow(rawId: string): Promise<void> {
try {
await borrowRequestsAPI.pickup(rawId);
await loadRequests(true);
if (selectedRequest?.rawId === rawId) {
showDetailModal = false;
}
} catch (error) {
console.error('Failed to pick up request', error);
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
timeline.push({ step: 'Instructor Approved', status: 'completed', date: request.requestDate, by: request.instructor });
timeline.push({ step: 'Custodian Approval', status: 'pending', date: null, by: 'Custodian' });
} else if (request.status === 'ready') {
timeline.push({ step: 'Instructor Approved', status: 'completed', date: request.requestDate, by: request.instructor });
timeline.push({ step: 'Custodian Approved', status: 'completed', date: request.requestDate, by: 'Custodian' });
timeline.push({ step: 'Awaiting Pickup', status: 'pending', date: null, by: 'You' });
} else if (request.status === 'picked-up') {
timeline.push({ step: 'Instructor Approved', status: 'completed', date: request.requestDate, by: request.instructor });
timeline.push({ step: 'Custodian Approved', status: 'completed', date: request.requestDate, by: 'Custodian' });
timeline.push({ step: 'Picked Up', status: 'completed', date: request.requestDate, by: 'You' });
timeline.push({ step: 'Awaiting Return', status: 'pending', date: null, by: 'You' });
} else if (request.status === 'returned') {
timeline.push({ step: 'Instructor Approved', status: 'completed', date: request.requestDate, by: request.instructor });
timeline.push({ step: 'Custodian Approved', status: 'completed', date: request.requestDate, by: 'Custodian' });
timeline.push({ step: 'Picked Up', status: 'completed', date: request.requestDate, by: 'You' });
timeline.push({ step: 'Returned', status: 'completed', date: request.requestDate, by: 'You' });
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
					<p class="text-sm font-medium text-gray-600">Active Loan(s)</p>
					<p class="mt-2 text-3xl font-semibold text-green-600">{stats.activeCount}</p>
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
					<p class="text-sm font-medium text-gray-600">Ready for Pickup</p>
					<p class="mt-2 text-3xl font-semibold text-pink-600">{stats.readyForPickup}</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100">
					<svg class="h-6 w-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2 1m2-1l-2-1m2 1v2.5"/>
					</svg>
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
				onclick={() => activeTab = 'approved'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'approved' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Approved - Preparing
				<span class="ml-2 rounded-full {activeTab === 'approved' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs">
					{tabCounts.approved}
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
				onclick={() => activeTab = 'picked-up'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'picked-up' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Picked Up
				<span class="ml-2 rounded-full {activeTab === 'picked-up' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs">
					{tabCounts['picked-up']}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'returned'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'returned' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Returned
				<span class="ml-2 rounded-full {activeTab === 'returned' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs">
					{tabCounts.returned}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'rejected'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'rejected' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Rejected ({tabCounts.rejected})
			</button>
			<button
				onclick={() => activeTab = 'all'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'all' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				All Requests ({tabCounts.all})
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
					activeTab = 'all';
				}}
				class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
				</svg>
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
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
				</svg>
				New Request
			</a>
		</div>
		
		{#each filteredRequests as request}
			<div class="rounded-lg bg-white p-6 shadow transition-all hover:shadow-md">
				<div class="flex gap-4">
					<div class="flex-1">
						<div class="flex items-start justify-between">
							<div>
								<div class="flex items-center gap-3">
									<h3 class="text-lg font-semibold text-gray-900">{request.id}</h3>
									<span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold {getStatusColor(request.status)}">
										<svg class="mr-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getStatusIcon(request.status)}/>
										</svg>
										{request.status.charAt(0).toUpperCase() + request.status.slice(1)}
									</span>
								</div>
								<p class="mt-1 text-sm text-gray-500">Requested on {new Date(request.requestDate).toLocaleDateString()}</p>
							</div>
						</div>
						
						<!-- Items -->
						<div class="mt-4">
							<p class="text-xs font-medium text-gray-500">ITEMS REQUESTED</p>
							<div class="mt-2 flex flex-wrap gap-2">
								{#each request.items as item}
									<div class="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
										<span class="mr-2 text-lg">{item.image}</span>
										<span class="text-sm font-medium text-gray-900">{item.name}</span>
									</div>
								{/each}
							</div>
						</div>
						
						<!-- Details Grid -->
						<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
							<div>
								<p class="text-xs font-medium text-gray-500">Borrow Period</p>
								<p class="mt-1 text-sm font-medium text-gray-900">
									{new Date(request.borrowDate).toLocaleDateString()} - {new Date(request.returnDate).toLocaleDateString()}
								</p>
							</div>
							<div>
								<p class="text-xs font-medium text-gray-500">Purpose</p>
								<p class="mt-1 text-sm font-medium text-gray-900">{request.purpose}</p>
							</div>
							<div>
								<p class="text-xs font-medium text-gray-500">Assigned To</p>
								<p class="mt-1 text-sm font-medium text-gray-900">{request.instructor}</p>
							</div>
						</div>
						
						<!-- Rejection Reason -->
						{#if request.status === 'rejected' && request.rejectionReason}
							<div class="mt-4 rounded-lg bg-red-50 border border-red-200 p-3">
								<div class="flex gap-3">
									<svg class="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
									</svg>
									<div class="flex-1 min-w-0">
										<p class="text-sm font-medium text-red-800">Rejection Reason</p>
										<p class="mt-0.5 text-sm text-red-700">{request.rejectionReason}</p>
									</div>
								</div>
							</div>
						{/if}
					</div>
					
					<!-- Actions -->
					<div class="flex flex-col gap-2 lg:ml-6">
						<button
							onclick={() => openDetailModal(request)}
							class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>
							View Details
						</button>
						{#if request.status === 'pending'}
							<button class="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
								Cancel
							</button>
						{/if}
						{#if request.status === 'ready'}
							<button
								onclick={() => pickupNow(request.rawId)}
								class="inline-flex items-center justify-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700"
							>
								Pick Up Now
							</button>
						{/if}
						{#if request.status === 'rejected'}
							<button class="inline-flex items-center justify-center rounded-lg border border-pink-300 bg-white px-4 py-2 text-sm font-medium text-pink-700 hover:bg-pink-50">
								Appeal
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/each}
		
		{#if filteredRequests.length === 0}
			<div class="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
				<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
				</svg>
				<h3 class="mt-2 text-sm font-medium text-gray-900">No requests found</h3>
				<p class="mt-1 text-sm text-gray-500">Get started by creating a new request.</p>
				<div class="mt-6">
					<a href="/student/request" class="inline-flex items-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700">
						<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
						</svg>
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
		<div class="fixed inset-0 bg-gray-500 bg-opacity-75" onclick={closeDetailModal}></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative w-full max-w-3xl rounded-lg bg-white shadow-xl">
				<!-- Header -->
				<div class="border-b border-gray-200 bg-gray-50 px-6 py-4">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="text-lg font-semibold text-gray-900">Request Details</h3>
							<p class="mt-1 text-sm text-gray-500">{selectedRequest.id}</p>
						</div>
						<button onclick={closeDetailModal} class="text-gray-400 hover:text-gray-500">
							<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					</div>
				</div>
				
				<!-- Content -->
				<div class="max-h-[70vh] overflow-y-auto px-6 py-6">
					<div class="space-y-6">
						<!-- Status Badge -->
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-3">Current Status</h4>
							<span class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold {getStatusColor(selectedRequest.status)}">
								<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getStatusIcon(selectedRequest.status)}/>
								</svg>
								{selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1)}
							</span>
						</div>
						
						<!-- Requested Items -->
						<div>
							<h4 class="text-sm font-medium text-gray-700 mb-3">Requested Items</h4>
							<div class="space-y-2">
								{#each selectedRequest.items as item}
									<div class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
										<span class="text-2xl">{item.image}</span>
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
															step.status === 'rejected' ? 'bg-red-600' :
															'bg-gray-300'
														}">
															{#if step.status === 'completed'}
																<svg class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
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
							<button class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
								Cancel Request
							</button>
						{/if}
						{#if selectedRequest.status === 'ready'}
							<button
								onclick={() => pickupNow(selectedRequest.rawId)}
								class="rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700"
							>
								Pick Up Now
							</button>
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

