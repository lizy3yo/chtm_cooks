<script lang="ts">
	import { Search, Filter, Download, Eye } from 'lucide-svelte';

	// Mock audit log data
	let auditLogs = $state([
		{ id: 1, timestamp: '2024-04-14 10:23:45', user: 'John Doe', action: 'User Login', resource: 'Authentication', ip: '192.168.1.100', status: 'success' },
		{ id: 2, timestamp: '2024-04-14 10:15:32', user: 'Admin', action: 'User Created', resource: 'User Management', ip: '192.168.1.50', status: 'success' },
		{ id: 3, timestamp: '2024-04-14 09:58:21', user: 'Unknown', action: 'Failed Login', resource: 'Authentication', ip: '203.45.67.89', status: 'failed' },
		{ id: 4, timestamp: '2024-04-14 09:45:12', user: 'Jane Smith', action: 'Settings Updated', resource: 'System Settings', ip: '192.168.1.75', status: 'success' },
		{ id: 5, timestamp: '2024-04-14 09:30:05', user: 'System', action: 'Database Backup', resource: 'Database', ip: 'localhost', status: 'success' },
		{ id: 6, timestamp: '2024-04-14 09:12:48', user: 'Bob Johnson', action: 'Role Changed', resource: 'User Management', ip: '192.168.1.120', status: 'success' },
		{ id: 7, timestamp: '2024-04-14 08:55:33', user: 'Alice Williams', action: 'File Uploaded', resource: 'File Storage', ip: '192.168.1.90', status: 'success' },
		{ id: 8, timestamp: '2024-04-14 08:42:19', user: 'Unknown', action: 'Failed Login', resource: 'Authentication', ip: '203.45.67.89', status: 'failed' }
	]);

	let searchQuery = $state('');
	let selectedAction = $state('all');
	let selectedStatus = $state('all');

	function getStatusBadgeColor(status: string): string {
		return status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800';
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Audit Logs</h1>
			<p class="mt-1 text-sm text-gray-500">Track all system activities and changes</p>
		</div>
		<button class="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
			<Download size={18} />
			Export Logs
		</button>
	</div>

	<!-- Filters -->
	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<div class="grid gap-4 sm:grid-cols-3">
			<!-- Search -->
			<div class="relative sm:col-span-1">
				<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search logs..."
					class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
				/>
			</div>

			<!-- Action Filter -->
			<select
				bind:value={selectedAction}
				class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
			>
				<option value="all">All Actions</option>
				<option value="login">User Login</option>
				<option value="logout">User Logout</option>
				<option value="create">Create</option>
				<option value="update">Update</option>
				<option value="delete">Delete</option>
			</select>

			<!-- Status Filter -->
			<select
				bind:value={selectedStatus}
				class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
			>
				<option value="all">All Status</option>
				<option value="success">Success</option>
				<option value="failed">Failed</option>
			</select>
		</div>
	</div>

	<!-- Stats -->
	<div class="grid gap-4 sm:grid-cols-4">
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<p class="text-sm text-gray-500">Total Events</p>
			<p class="mt-1 text-2xl font-bold text-gray-900">12,456</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<p class="text-sm text-gray-500">Today</p>
			<p class="mt-1 text-2xl font-bold text-purple-600">234</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<p class="text-sm text-gray-500">Failed Events</p>
			<p class="mt-1 text-2xl font-bold text-red-600">18</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<p class="text-sm text-gray-500">Unique Users</p>
			<p class="mt-1 text-2xl font-bold text-emerald-600">487</p>
		</div>
	</div>

	<!-- Audit Logs Table -->
	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="border-b border-gray-200 bg-gray-50">
					<tr>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Timestamp</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">User</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Action</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Resource</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">IP Address</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Status</th>
						<th class="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#each auditLogs as log}
						<tr class="transition-colors hover:bg-gray-50">
							<td class="px-6 py-4 text-sm text-gray-900">{log.timestamp}</td>
							<td class="px-6 py-4 text-sm font-medium text-gray-900">{log.user}</td>
							<td class="px-6 py-4 text-sm text-gray-900">{log.action}</td>
							<td class="px-6 py-4 text-sm text-gray-500">{log.resource}</td>
							<td class="px-6 py-4 text-sm font-mono text-gray-500">{log.ip}</td>
							<td class="px-6 py-4">
								<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold {getStatusBadgeColor(log.status)}">
									{log.status}
								</span>
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center justify-end">
									<button class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-purple-50 hover:text-purple-600" title="View details">
										<Eye size={16} />
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Pagination -->
		<div class="flex items-center justify-between border-t border-gray-200 px-6 py-4">
			<p class="text-sm text-gray-500">Showing 1 to 8 of 12,456 logs</p>
			<div class="flex gap-2">
				<button class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
					Previous
				</button>
				<button class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
					Next
				</button>
			</div>
		</div>
	</div>
</div>
