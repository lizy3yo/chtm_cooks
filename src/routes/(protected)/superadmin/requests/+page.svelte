<script lang="ts">
	import { Search, Filter, Download, Info, Eye, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-svelte';

	let activeTab = $state<'all' | 'by-status' | 'by-class' | 'overdue'>('all');
	let searchQuery = $state('');
	let selectedStatus = $state('all');
	let selectedClass = $state('all');

	let stats = $state({
		totalRequests: 3456,
		pending: 45,
		approved: 78,
		active: 234,
		overdue: 12,
		completed: 3087
	});

	function getStatusBadgeColor(status: string): string {
		const colors: Record<string, string> = {
			pending_instructor: 'bg-yellow-100 text-yellow-800',
			approved_instructor: 'bg-blue-100 text-blue-800',
			borrowed: 'bg-purple-100 text-purple-800',
			returned: 'bg-emerald-100 text-emerald-800',
			overdue: 'bg-red-100 text-red-800',
			rejected: 'bg-gray-100 text-gray-800'
		};
		return colors[status] || 'bg-gray-100 text-gray-800';
	}
</script>

<div class="space-y-6">
	<!-- Header with Info -->
	<div class="flex flex-col gap-4">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900">Request Management</h1>
			<p class="mt-1 text-sm text-gray-500">System-wide oversight of all equipment borrow requests</p>
			
			<div class="mt-4 flex items-start gap-3 rounded-lg border border-pink-200 bg-pink-50 p-4">
				<Info size={20} class="mt-0.5 shrink-0 text-pink-600" />
				<div class="flex-1 text-sm">
					<p class="font-medium text-pink-900">Request Oversight Features</p>
					<ul class="mt-2 space-y-1 text-pink-800">
						<li>• View all borrow requests across all students, instructors, and classes</li>
						<li>• Filter by status, class code, date range, and student/instructor</li>
						<li>• Override request status for emergency interventions</li>
						<li>• Reassign requests to different instructors or custodians</li>
						<li>• Track overdue requests and send automated reminders</li>
						<li>• Export request data for reporting and compliance</li>
						<li>• Monitor request approval rates and turnaround times by class</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6">
			<button onclick={() => activeTab = 'all'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'all' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">
				All Requests
			</button>
			<button onclick={() => activeTab = 'by-status'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'by-status' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">
				By Status
			</button>
			<button onclick={() => activeTab = 'by-class'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'by-class' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">
				By Class Code
			</button>
			<button onclick={() => activeTab = 'overdue'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'overdue' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">
				Overdue Requests
			</button>
		</nav>
	</div>

	<!-- Stats -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Total Requests</p>
			<p class="mt-2 text-3xl font-bold text-gray-900">{stats.totalRequests.toLocaleString()}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Pending</p>
			<p class="mt-2 text-3xl font-bold text-yellow-600">{stats.pending}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Active Loans</p>
			<p class="mt-2 text-3xl font-bold text-purple-600">{stats.active}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Overdue</p>
			<p class="mt-2 text-3xl font-bold text-red-600">{stats.overdue}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Completed</p>
			<p class="mt-2 text-3xl font-bold text-emerald-600">{stats.completed.toLocaleString()}</p>
		</div>
	</div>

	<!-- Filters -->
	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
			<div class="relative flex-1">
				<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
				<input type="text" bind:value={searchQuery} placeholder="Search requests..." class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
			</div>
			<select bind:value={selectedStatus} class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20">
				<option value="all">All Status</option>
				<option value="pending">Pending</option>
				<option value="approved">Approved</option>
				<option value="borrowed">Borrowed</option>
				<option value="returned">Returned</option>
			</select>
			<button class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
				<Download size={18} />
				Export
			</button>
		</div>
	</div>

	<!-- Content based on active tab -->
	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<p class="text-center text-gray-500">Request data will be displayed here</p>
	</div>
</div>
