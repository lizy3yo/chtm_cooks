<script lang="ts">
import { onMount } from 'svelte';
import { borrowRequestsAPI, type BorrowRequestRecord, type BorrowRequestStatus } from '$lib/api/borrowRequests';

type Tab = 'pending' | 'active' | 'overdue' | 'return' | 'history';

let activeTab = $state<Tab>('pending');
let pendingRequests = $state<any[]>([]);
let activeLoans = $state<any[]>([]);
let overdueItems = $state<any[]>([]);
let returnQueue = $state<any[]>([]);
let requestHistory = $state<any[]>([]);

function toUiStatus(status: BorrowRequestStatus): 'pending' | 'active' | 'overdue' | 'return' | 'history' {
switch (status) {
case 'approved_instructor': return 'pending';
case 'borrowed': return 'active';
case 'returned': return 'history';
case 'rejected': return 'history';
default: return 'history';
}
}

function formatDate(value: string): string {
const date = new Date(value);
if (Number.isNaN(date.getTime())) return value;
return date.toLocaleDateString();
}

function mapRequests(records: BorrowRequestRecord[]): void {
const now = new Date();

pendingRequests = records
.filter((request) => request.status === 'approved_instructor')
.map((request) => ({
id: request.id,
student: request.student?.fullName || `Student ${request.studentId.slice(-6).toUpperCase()}`,
studentId: request.studentId.slice(-8).toUpperCase(),
item: request.items.map((item) => item.name).join(', '),
quantity: request.items.reduce((sum, item) => sum + item.quantity, 0),
requestDate: formatDate(request.createdAt),
purpose: request.purpose
}));

activeLoans = records
.filter((request) => request.status === 'borrowed')
.map((request) => ({
id: request.id,
student: request.student?.fullName || `Student ${request.studentId.slice(-6).toUpperCase()}`,
studentId: request.studentId.slice(-8).toUpperCase(),
item: request.items.map((item) => item.name).join(', '),
quantity: request.items.reduce((sum, item) => sum + item.quantity, 0),
borrowDate: formatDate(request.pickedUpAt || request.borrowDate),
dueDate: formatDate(request.returnDate),
status: new Date(request.returnDate) < now ? 'Overdue' : 'On Time'
}));

overdueItems = records
.filter((request) => request.status === 'borrowed' && new Date(request.returnDate) < now)
.map((request) => {
const dueDate = new Date(request.returnDate);
const diff = Math.max(1, Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
return {
id: request.id,
student: request.student?.fullName || `Student ${request.studentId.slice(-6).toUpperCase()}`,
studentId: request.studentId.slice(-8).toUpperCase(),
item: request.items.map((item) => item.name).join(', '),
quantity: request.items.reduce((sum, item) => sum + item.quantity, 0),
dueDate: formatDate(request.returnDate),
daysOverdue: diff
};
});

returnQueue = records
.filter((request) => request.status === 'borrowed')
.map((request) => ({
id: request.id,
student: request.student?.fullName || `Student ${request.studentId.slice(-6).toUpperCase()}`,
studentId: request.studentId.slice(-8).toUpperCase(),
item: request.items.map((item) => item.name).join(', '),
quantity: request.items.reduce((sum, item) => sum + item.quantity, 0),
returnDate: formatDate(request.returnDate),
condition: 'pending'
}));

requestHistory = records
.filter((request) => ['returned', 'rejected', 'ready_for_pickup', 'approved_instructor'].includes(request.status))
.map((request) => ({
id: request.id,
student: request.student?.fullName || `Student ${request.studentId.slice(-6).toUpperCase()}`,
item: request.items.map((item) => item.name).join(', '),
action:
request.status === 'returned'
? 'Returned'
: request.status === 'rejected'
? 'Rejected'
: request.status === 'ready_for_pickup'
? 'Released'
: 'Approved',
date: formatDate(request.updatedAt),
status: request.status === 'rejected' ? 'Rejected' : 'Completed'
}));
}

async function loadRequests(forceRefresh = false): Promise<void> {
try {
const response = await borrowRequestsAPI.list({}, { forceRefresh });
mapRequests(response.requests);
} catch (error) {
console.error('Failed to load custodian requests', error);
pendingRequests = [];
activeLoans = [];
overdueItems = [];
returnQueue = [];
requestHistory = [];
}
}

onMount(async () => {
await loadRequests();
});

function switchTab(tab: Tab) {
activeTab = tab;
}

async function approveRequest(requestId: string): Promise<void> {
try {
await borrowRequestsAPI.release(requestId);
await loadRequests(true);
} catch (error) {
console.error('Failed to release request', error);
}
}

async function rejectRequest(requestId: string): Promise<void> {
try {
await borrowRequestsAPI.reject(requestId, 'Rejected by custodian', 'Rejected during item preparation.');
await loadRequests(true);
} catch (error) {
console.error('Failed to reject request', error);
}
}

async function processReturn(returnId: string, _condition: string) {
try {
await borrowRequestsAPI.markReturned(returnId);
await loadRequests(true);
} catch (error) {
console.error('Failed to process return', error);
}
}

function sendReminder(loanId: string) {
console.log('Reminder action placeholder for loan', loanId);
}
</script>

<svelte:head>
	<title>Requests & Loans Management - CHTM Cooks</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Requests & Loans Management</h1>
			<p class="mt-1 text-sm text-gray-500">Track and manage all borrowing requests and item loans</p>
		</div>
		<button class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
			<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
			</svg>
			Export Report
		</button>
	</div>
	
	<!-- Stats Overview -->
	<div class="grid grid-cols-1 gap-5 sm:grid-cols-5">
		<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
			<dt class="truncate text-sm font-medium text-gray-500">Pending</dt>
			<dd class="mt-1 text-3xl font-semibold text-yellow-600">{pendingRequests.length}</dd>
		</div>
		<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
			<dt class="truncate text-sm font-medium text-gray-500">Active Loans</dt>
			<dd class="mt-1 text-3xl font-semibold text-blue-600">{activeLoans.length}</dd>
		</div>
		<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
			<dt class="truncate text-sm font-medium text-gray-500">Overdue</dt>
			<dd class="mt-1 text-3xl font-semibold text-red-600">{overdueItems.length}</dd>
		</div>
		<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
			<dt class="truncate text-sm font-medium text-gray-500">To Return</dt>
			<dd class="mt-1 text-3xl font-semibold text-purple-600">{returnQueue.length}</dd>
		</div>
		<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
			<dt class="truncate text-sm font-medium text-gray-500">Total History</dt>
			<dd class="mt-1 text-3xl font-semibold text-gray-900">{requestHistory.length}</dd>
		</div>
	</div>
	
	<!-- Tabs Navigation -->
	<div class="border-b border-gray-200 bg-white shadow-sm">
		<nav class="-mb-px flex overflow-x-auto" aria-label="Tabs">
			<button
				onclick={() => switchTab('pending')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'pending'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
					Pending Requests
					<span class="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">{pendingRequests.length}</span>
				</div>
			</button>
			
			<button
				onclick={() => switchTab('active')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'active'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
					</svg>
					Active Loans
					<span class="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">{activeLoans.length}</span>
				</div>
			</button>
			
			<button
				onclick={() => switchTab('overdue')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'overdue'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
					</svg>
					Overdue Items
					<span class="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">{overdueItems.length}</span>
				</div>
			</button>
			
			<button
				onclick={() => switchTab('return')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'return'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
					Return Processing
					<span class="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">{returnQueue.length}</span>
				</div>
			</button>
			
			<button
				onclick={() => switchTab('history')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'history'
					? 'border-emerald-500 text-emerald-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
					Request History
				</div>
			</button>
		</nav>
	</div>
	
	<!-- Tab Content -->
	<div class="rounded-lg bg-white shadow">
		{#if activeTab === 'pending'}
			<!-- Pending Requests View -->
			<div class="p-6">
				<div class="mb-6">
					<h3 class="text-lg font-semibold text-gray-900">Pending Requests</h3>
					<p class="mt-1 text-sm text-gray-500">Review and approve student borrowing requests</p>
				</div>
				
				{#if pendingRequests.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No pending requests</h3>
						<p class="mt-2 text-sm text-gray-500">All requests have been processed.</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student ID</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Quantity</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Request Date</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Purpose</th>
									<th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each pendingRequests as request}
									<tr class="hover:bg-gray-50">
										<td class="whitespace-nowrap px-6 py-4">
											<div class="text-sm font-medium text-gray-900">{request.student}</div>
										</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{request.studentId}</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{request.item}</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{request.quantity}</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{request.requestDate}</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{request.purpose}</td>
										<td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
											<button 
												onclick={() => approveRequest(request.id)}
												class="mr-3 text-emerald-600 hover:text-emerald-900"
											>
												Approve
											</button>
											<button 
												onclick={() => rejectRequest(request.id)}
												class="text-red-600 hover:text-red-900"
											>
												Reject
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
			
		{:else if activeTab === 'active'}
			<!-- Active Loans View -->
			<div class="p-6">
				<div class="mb-6">
					<h3 class="text-lg font-semibold text-gray-900">Active Loans</h3>
					<p class="mt-1 text-sm text-gray-500">Currently borrowed items</p>
				</div>
				
				{#if activeLoans.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No active loans</h3>
						<p class="mt-2 text-sm text-gray-500">No items are currently on loan.</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student ID</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Quantity</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Borrow Date</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Due Date</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
									<th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each activeLoans as loan}
									<tr class="hover:bg-gray-50">
										<td class="whitespace-nowrap px-6 py-4">
											<div class="text-sm font-medium text-gray-900">{loan.student}</div>
										</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{loan.studentId}</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{loan.item}</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{loan.quantity}</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{loan.borrowDate}</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{loan.dueDate}</td>
										<td class="whitespace-nowrap px-6 py-4">
											<span class="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
												{loan.status}
											</span>
										</td>
										<td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
											<button 
												onclick={() => sendReminder(loan.id)}
												class="text-blue-600 hover:text-blue-900"
											>
												Send Reminder
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
			
		{:else if activeTab === 'overdue'}
			<!-- Overdue Items View -->
			<div class="p-6">
				<div class="mb-6">
					<h3 class="text-lg font-semibold text-gray-900">Overdue Items</h3>
					<p class="mt-1 text-sm text-gray-500">Items past their return date</p>
				</div>
				
				{#if overdueItems.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No overdue items</h3>
						<p class="mt-2 text-sm text-gray-500">All items have been returned on time.</p>
					</div>
				{:else}
					<div class="space-y-4">
						{#each overdueItems as item}
							<div class="rounded-lg border-2 border-red-200 bg-red-50 p-4">
								<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
									<div class="flex items-center space-x-4">
										<div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
											<svg class="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
											</svg>
										</div>
										<div>
											<div class="flex items-center gap-2">
												<h4 class="font-semibold text-gray-900">{item.item}</h4>
												<span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
													{item.daysOverdue} {item.daysOverdue === 1 ? 'day' : 'days'} overdue
												</span>
											</div>
											<p class="text-sm text-gray-600">Student: {item.student} ({item.studentId})</p>
											<p class="text-sm text-gray-600">Due Date: {item.dueDate}</p>
										</div>
									</div>
									<div class="flex gap-2">
										<button 
											onclick={() => sendReminder(item.id)}
											class="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-100"
										>
											Send Reminder
										</button>
										<button class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
											Take Action
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			
		{:else if activeTab === 'return'}
			<!-- Return Processing View -->
			<div class="p-6">
				<div class="mb-6">
					<h3 class="text-lg font-semibold text-gray-900">Return Processing</h3>
					<p class="mt-1 text-sm text-gray-500">Check-in returned items and verify condition</p>
				</div>
				
				{#if returnQueue.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No returns to process</h3>
						<p class="mt-2 text-sm text-gray-500">All returns have been processed.</p>
					</div>
				{:else}
					<div class="space-y-4">
						{#each returnQueue as returnItem}
							<div class="rounded-lg border-2 border-purple-200 bg-purple-50 p-6">
								<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
									<div class="flex-1">
										<div class="flex items-center gap-3">
											<div class="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
												<svg class="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
												</svg>
											</div>
											<div>
												<h4 class="font-semibold text-gray-900">{returnItem.item}</h4>
												<p class="text-sm text-gray-600">Student: {returnItem.student} ({returnItem.studentId})</p>
												<p class="text-sm text-gray-600">Return Date: {returnItem.returnDate}</p>
											</div>
										</div>
									</div>
									
									<div class="flex flex-col gap-3 sm:flex-row">
										<div class="flex flex-col gap-2">
											<label class="text-xs font-medium text-gray-700">Item Condition</label>
											<div class="flex gap-2">
												<button 
													onclick={() => processReturn(returnItem.id, 'good')}
													class="flex-1 rounded-lg border-2 border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
												>
													<svg class="mx-auto h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
													</svg>
													Good
												</button>
												<button 
													onclick={() => processReturn(returnItem.id, 'damaged')}
													class="flex-1 rounded-lg border-2 border-yellow-300 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-100"
												>
													<svg class="mx-auto h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
													</svg>
													Damaged
												</button>
												<button 
													onclick={() => processReturn(returnItem.id, 'lost')}
													class="flex-1 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
												>
													<svg class="mx-auto h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
													</svg>
													Lost
												</button>
											</div>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			
		{:else if activeTab === 'history'}
			<!-- Request History View -->
			<div class="p-6">
				<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h3 class="text-lg font-semibold text-gray-900">Request History</h3>
						<p class="mt-1 text-sm text-gray-500">Complete log of all requests and transactions</p>
					</div>
					<div class="flex gap-3">
						<select class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500">
							<option>All Status</option>
							<option>Completed</option>
							<option>Rejected</option>
						</select>
						<input 
							type="date" 
							class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
						/>
					</div>
				</div>
				
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Action</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
								<th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Details</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each requestHistory as history}
								<tr class="hover:bg-gray-50">
									<td class="whitespace-nowrap px-6 py-4">
										<div class="text-sm font-medium text-gray-900">{history.student}</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{history.item}</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{history.action}</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{history.date}</td>
									<td class="whitespace-nowrap px-6 py-4">
										<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {
											history.status === 'Completed' ? 'bg-green-100 text-green-800' :
											history.status === 'Rejected' ? 'bg-red-100 text-red-800' :
											'bg-gray-100 text-gray-800'
										}">
											{history.status}
										</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
										<button class="text-emerald-600 hover:text-emerald-900">View</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</div>
</div>

