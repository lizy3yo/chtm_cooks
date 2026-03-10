<script lang="ts">
import { onMount } from 'svelte';
import { borrowRequestsAPI, type BorrowRequestRecord, type BorrowRequestStatus } from '$lib/api/borrowRequests';
import ItemInspectionModal from '$lib/components/custodian/ItemInspectionModal.svelte';

type Tab = 'pending' | 'ready' | 'active' | 'missing' | 'history';

let activeTab = $state<Tab>('pending');
let showDetailModal = $state(false);
let showInspectionModal = $state(false);
let selectedRequest = $state<any>(null);
let requests = $state<any[]>([]);
let searchQuery = $state('');
let sortBy = $state<'date' | 'student' | 'status'>('date');
let actionSuccess = $state<string | null>(null);
let actionError = $state<string | null>(null);
let openActionMenuFor = $state<string | null>(null);

function toUiStatus(status: BorrowRequestStatus): 'pending' | 'ready' | 'active' | 'missing' | 'history' {
switch (status) {
case 'approved_instructor': return 'pending';
case 'ready_for_pickup': return 'ready';
case 'borrowed': return 'active';
case 'pending_return': return 'active';
case 'missing': return 'missing';
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
const status = toUiStatus(record.status);
const studentName = record.student?.fullName || `Student ${record.studentId.slice(-6).toUpperCase()}`;
const now = new Date();
const isOverdue = ['borrowed', 'pending_return'].includes(record.status) && new Date(record.returnDate) < now;
const daysOverdue = isOverdue ? Math.max(1, Math.ceil((now.getTime() - new Date(record.returnDate).getTime()) / (1000 * 60 * 60 * 24))) : 0;

return {
rawId: record.id,
rawStatus: record.status,
rawItems: record.items,
id: getDisplayId(record.id),
student: {
name: studentName,
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
daysOverdue: isOverdue ? daysOverdue : 0,
isOverdue,
releasedDate: formatDateTime(record.releasedAt),
pickedUpDate: formatDateTime(record.pickedUpAt),
returnedDate: formatDateTime(record.returnedAt),
missingDate: formatDateTime(record.missingAt),
lastReminderAt: formatDateTime(record.lastReminderAt),
reminderCount: record.reminderCount || 0,
approvedBy: record.instructor?.fullName || 'Instructor',
approvedDate: formatDateTime(record.approvedAt)
};
}

function clearActionMessages(): void {
actionSuccess = null;
actionError = null;
}

function setActionSuccess(message: string): void {
actionSuccess = message;
actionError = null;
setTimeout(() => {
actionSuccess = null;
}, 4000);
}

function setActionError(message: string): void {
actionError = message;
actionSuccess = null;
setTimeout(() => {
actionError = null;
}, 6000);
}

async function markReady(rawId: string): Promise<void> {
closeActionMenu();
clearActionMessages();
try {
await borrowRequestsAPI.release(rawId);
await loadRequests(true);
setActionSuccess('Request marked ready for student pickup.');
} catch (error) {
console.error('Failed to mark request as ready for pickup', error);
setActionError(error instanceof Error ? error.message : 'Failed to mark request as ready for pickup');
}
}

async function confirmPickup(rawId: string): Promise<void> {
closeActionMenu();
clearActionMessages();
try {
await borrowRequestsAPI.pickup(rawId);
await loadRequests(true);
setActionSuccess('Pickup confirmed successfully.');
} catch (error) {
console.error('Failed to confirm item pickup', error);
setActionError(error instanceof Error ? error.message : 'Failed to confirm item pickup');
}
}

async function confirmReturn(rawId: string): Promise<void> {
closeActionMenu();
clearActionMessages();
	
	// Open inspection modal instead of directly confirming
	const request = requests.find(r => r.rawId === rawId);
	if (request) {
		selectedRequest = request;
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
			setActionSuccess(
				`Inspection complete. ${result.obligationsCreated} financial obligation(s) created for damaged/missing items.`
			);
		} else {
			setActionSuccess('All items returned in good condition. Inventory updated successfully.');
		}
	} catch (error) {
		console.error('Failed to submit inspection', error);
		setActionError(error instanceof Error ? error.message : 'Failed to submit inspection');
		throw error;
	}
}

async function markMissing(rawId: string): Promise<void> {
	closeActionMenu();
	clearActionMessages();
try {
	await borrowRequestsAPI.markMissing(rawId);
	await loadRequests(true);
	setActionSuccess('Request marked as missing for escalation and follow-up.');
} catch (error) {
	console.error('Failed to mark item as missing', error);
	setActionError(error instanceof Error ? error.message : 'Failed to mark item as missing');
}
}

async function sendReminder(rawId: string): Promise<void> {
closeActionMenu();
clearActionMessages();
try {
	const result = await borrowRequestsAPI.sendOverdueReminder(rawId);
	await loadRequests(true);
	setActionSuccess(`${result.message} (total reminders: ${result.reminderCount})`);
} catch (error) {
	console.error('Failed to send overdue reminder', error);
	setActionError(error instanceof Error ? error.message : 'Failed to send overdue reminder');
}
}

async function loadRequests(forceRefresh = false): Promise<void> {
try {
const response = await borrowRequestsAPI.list({}, { forceRefresh });
requests = response.requests
.filter((record) => record.status !== 'pending_instructor')
.map(mapRequest);
} catch (error) {
console.error('Failed to load custodian requests', error);
requests = [];
}
}

onMount(async () => {
await loadRequests();
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
missing: requests.filter(r => r.status === 'missing').length,
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

function getStatusBadge(status: Tab) {
switch (status) {
case 'pending':
return { text: 'Pending Preparation', color: 'bg-blue-100 text-blue-800', icon: '📋' };
case 'ready':
return { text: 'Ready for Pickup', color: 'bg-green-100 text-green-800', icon: '✓' };
case 'active':
return { text: 'On Loan', color: 'bg-purple-100 text-purple-800', icon: '📦' };
case 'missing':
return { text: 'Missing', color: 'bg-rose-100 text-rose-800', icon: '⚠' };
case 'history':
return { text: 'Completed', color: 'bg-gray-100 text-gray-800', icon: '✓' };
default:
return { text: status, color: 'bg-gray-100 text-gray-800', icon: '○' };
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
		{#if actionSuccess}
			<div class="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 lg:col-span-5">
				{actionSuccess}
			</div>
		{/if}
		{#if actionError}
			<div class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 lg:col-span-5">
				{actionError}
			</div>
		{/if}
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
				onclick={() => activeTab = 'missing'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'missing' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500'}"
			>
				Missing
				<span class="ml-2 rounded-full {activeTab === 'missing' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs">
					{tabCounts.missing}
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
			<div class="rounded-lg bg-white p-6 shadow">
				<div class="flex gap-4">
					<div class="flex-1">
						<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<div class="flex items-center gap-3">
								<div class="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100 text-pink-700 font-semibold">
									{request.student.avatar}
								</div>
								<div>
									<h3 class="text-lg font-semibold">{request.student.name}</h3>
									<p class="text-sm text-gray-500">{request.student.studentId}</p>
									<p class="text-xs text-gray-400">{request.id} • {new Date(request.requestDate).toLocaleDateString()}</p>
								</div>
								{#if request.status !== 'pending'}
									{@const badge = getStatusBadge(request.status)}
									<span class="ml-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold {badge.color}">
										<span>{badge.icon}</span>
										<span>{badge.text}</span>
									</span>
								{/if}
								{#if request.rawStatus === 'pending_return'}
									<span class="ml-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-orange-100 text-orange-800">
										<span>🔄</span>
										<span>Return Requested</span>
									</span>
								{/if}
							</div>

							<div class="relative w-full rounded-lg border border-gray-200 bg-gray-50 p-3 lg:w-64">
								<div class="mb-2 flex items-center justify-between">
									<p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</p>
									{#if request.status === 'active'}
										<button
											onclick={() => toggleActionMenu(request.rawId)}
											class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
											aria-label="More actions"
										>
											<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5h.01M12 12h.01M12 19h.01"/>
											</svg>
										</button>
									{/if}
								</div>
								<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
									<button
										onclick={() => openDetailModal(request)}
										class="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-100"
									>
										View Details
									</button>
									{#if request.status === 'pending'}
										<button
											onclick={() => markReady(request.rawId)}
											class="inline-flex h-10 items-center justify-center rounded-lg bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700"
										>
											✓ Mark Ready
										</button>
									{/if}
									{#if request.status === 'ready'}
										<button
											onclick={() => confirmPickup(request.rawId)}
											class="inline-flex h-10 items-center justify-center rounded-lg bg-pink-600 px-4 text-sm font-medium text-white hover:bg-pink-700"
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
											class="inline-flex h-10 items-center justify-center rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700"
										>
											✓ Confirm Return
										</button>
									{/if}
								</div>

								{#if request.status === 'active' && openActionMenuFor === request.rawId}
									<div class="absolute right-3 top-12 z-10 w-48 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
										<button
											onclick={() => {
												closeActionMenu();
												markMissing(request.rawId);
											}}
											class="flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"
										>
											⚠ Mark Missing
										</button>
										{#if request.isOverdue}
											<button
												onclick={() => {
													closeActionMenu();
													sendReminder(request.rawId);
												}}
												class="flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"
											>
												⚠ Send Reminder
											</button>
										{/if}
									</div>
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
										<span class="ml-2 text-xs text-gray-500">x{item.quantity}</span>
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
								<p class="text-xs font-medium text-gray-500">Approved By</p>
								<p class="mt-1 text-sm text-gray-900">{request.approvedBy}</p>
							</div>
						</div>
						
						{#if request.isOverdue}
							<div class="mt-4 rounded-lg border-2 border-red-200 bg-red-50 p-3">
								<div class="flex items-center gap-2">
									<svg class="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
									</svg>
									<p class="text-sm font-medium text-red-800">
										{request.daysOverdue} {request.daysOverdue === 1 ? 'day' : 'days'} overdue - Due: {new Date(request.returnDate).toLocaleDateString()}
									</p>
								</div>
							</div>
						{/if}
						
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
									{#if request.returnedDate}
										<div class="flex items-center gap-2 text-xs">
											<span class="text-green-600">✓</span>
											<span class="text-gray-600">Returned on {request.returnedDate}</span>
										</div>
									{/if}
									{#if request.missingDate}
										<div class="flex items-center gap-2 text-xs">
											<span class="text-rose-600">⚠</span>
											<span class="text-gray-600">Marked missing on {request.missingDate}</span>
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
						Completed, returned, and rejected requests will be archived here.
					{/if}
				</p>
			</div>
		{/if}
	</div>
</div>

<!-- Detail Modal -->
{#if showDetailModal && selectedRequest}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="fixed inset-0 bg-gray-500 bg-opacity-75" onclick={closeDetailModal}></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative w-full max-w-2xl rounded-lg bg-white shadow-xl">
				<div class="border-b border-gray-200 bg-gray-50 px-6 py-4">
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">Request Details - {selectedRequest.id}</h3>
						<button onclick={closeDetailModal} class="text-gray-400 hover:text-gray-500">
							<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					</div>
				</div>
				
				<div class="max-h-[70vh] overflow-y-auto p-6 space-y-6">
					<!-- Student Information -->
					<div>
						<h4 class="text-sm font-medium text-gray-700 mb-3">Student Information</h4>
						<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
							<div class="flex items-center gap-3 mb-4">
								<div class="flex h-16 w-16 items-center justify-center rounded-full bg-pink-100 text-pink-700 font-semibold text-xl">
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
					
					<!-- Requested Items -->
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
					
					<!-- Request Details -->
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
							<div>
								<p class="text-xs font-medium text-gray-500">Approved By</p>
								<p class="mt-1 text-sm">{selectedRequest.approvedBy}</p>
							</div>
						</div>
					</div>
					
					<!-- Workflow Timeline -->
					<div>
						<h4 class="text-sm font-medium text-gray-700 mb-3">Workflow Timeline</h4>
						<div class="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
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
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Item Inspection Modal -->
{#if showInspectionModal && selectedRequest}
	<ItemInspectionModal
		items={selectedRequest.rawItems}
		requestId={selectedRequest.rawId}
		onSubmit={handleInspectionSubmit}
		onCancel={() => {
			showInspectionModal = false;
			selectedRequest = null;
		}}
	/>
{/if}

