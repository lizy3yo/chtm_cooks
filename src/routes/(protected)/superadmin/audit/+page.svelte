<script lang="ts">
	import { FileText, User, Shield, Settings, Info, Search, Download, Filter } from 'lucide-svelte';

	let activeTab = $state<'all' | 'user-actions' | 'security' | 'system'>('all');
	let searchQuery = $state('');
	let selectedAction = $state('all');
	let selectedUser = $state('all');
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900">Audit Logs</h1>
			<p class="mt-1 text-sm text-gray-500">Complete activity trail for compliance and security monitoring</p>
			
			<div class="mt-4 flex items-start gap-3 rounded-lg border border-pink-200 bg-pink-50 p-4">
				<Info size={20} class="mt-0.5 shrink-0 text-pink-600" />
				<div class="flex-1 text-sm">
					<p class="font-medium text-pink-900">Audit Logging Features</p>
					<ul class="mt-2 space-y-1 text-pink-800">
						<li>• Comprehensive audit trail: user creation/modification, role changes, request status changes</li>
						<li>• Security events: login/logout, failed authentication, permission changes</li>
						<li>• System changes: configuration updates, database operations, maintenance activities</li>
						<li>• Detailed metadata: timestamp, actor, action type, before/after values, IP address</li>
						<li>• Advanced filtering: by user, action type, date range, resource type</li>
						<li>• Export audit logs for compliance reporting and external analysis</li>
						<li>• Immutable logs with retention policies for regulatory compliance</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6">
			<button onclick={() => activeTab = 'all'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'all' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">All Activity</button>
			<button onclick={() => activeTab = 'user-actions'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'user-actions' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">User Actions</button>
			<button onclick={() => activeTab = 'security'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'security' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">Security Events</button>
			<button onclick={() => activeTab = 'system'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'system' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">System Changes</button>
		</nav>
	</div>

	<!-- Filters -->
	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
			<div class="relative flex-1">
				<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
				<input type="text" bind:value={searchQuery} placeholder="Search audit logs..." class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
			</div>
			<select bind:value={selectedAction} class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20">
				<option value="all">All Actions</option>
				<option value="create">Create</option>
				<option value="update">Update</option>
				<option value="delete">Delete</option>
				<option value="login">Login</option>
			</select>
			<button class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
				<Download size={18} />
				Export
			</button>
		</div>
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<p class="text-center text-gray-500">Audit log entries will be displayed here</p>
	</div>
</div>
