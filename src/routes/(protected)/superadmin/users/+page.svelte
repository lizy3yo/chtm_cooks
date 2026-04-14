<script lang="ts">
	import { Search, Plus, Filter, MoreVertical, Edit, Trash2, Shield, UserCheck, UserX } from 'lucide-svelte';

	// Mock data
	let users = $state([
		{ id: 1, name: 'John Doe', email: 'john@example.com', role: 'student', status: 'active', lastActive: '2 hours ago' },
		{ id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'instructor', status: 'active', lastActive: '5 minutes ago' },
		{ id: 3, name: 'Bob Johnson', email: 'bob@example.com', role: 'custodian', status: 'active', lastActive: '1 day ago' },
		{ id: 4, name: 'Alice Williams', email: 'alice@example.com', role: 'admin', status: 'active', lastActive: '3 hours ago' },
		{ id: 5, name: 'Charlie Brown', email: 'charlie@example.com', role: 'student', status: 'inactive', lastActive: '2 weeks ago' }
	]);

	let searchQuery = $state('');
	let selectedRole = $state('all');
	let selectedStatus = $state('all');

	function getRoleBadgeColor(role: string): string {
		const colors: Record<string, string> = {
			student: 'bg-blue-100 text-blue-800',
			instructor: 'bg-purple-100 text-purple-800',
			custodian: 'bg-pink-100 text-pink-800',
			admin: 'bg-indigo-100 text-indigo-800',
			superadmin: 'bg-gray-900 text-white'
		};
		return colors[role] || 'bg-gray-100 text-gray-800';
	}

	function getStatusBadgeColor(status: string): string {
		return status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600';
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">User Management</h1>
			<p class="mt-1 text-sm text-gray-500">Manage all users in the system</p>
		</div>
		<button class="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700">
			<Plus size={18} />
			Add New User
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
					placeholder="Search users..."
					class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
				/>
			</div>

			<!-- Role Filter -->
			<select
				bind:value={selectedRole}
				class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
			>
				<option value="all">All Roles</option>
				<option value="student">Student</option>
				<option value="instructor">Instructor</option>
				<option value="custodian">Custodian</option>
				<option value="admin">Admin</option>
			</select>

			<!-- Status Filter -->
			<select
				bind:value={selectedStatus}
				class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
			>
				<option value="all">All Status</option>
				<option value="active">Active</option>
				<option value="inactive">Inactive</option>
			</select>
		</div>
	</div>

	<!-- Stats -->
	<div class="grid gap-4 sm:grid-cols-4">
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<p class="text-sm text-gray-500">Total Users</p>
			<p class="mt-1 text-2xl font-bold text-gray-900">1,247</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<p class="text-sm text-gray-500">Active</p>
			<p class="mt-1 text-2xl font-bold text-emerald-600">892</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<p class="text-sm text-gray-500">Inactive</p>
			<p class="mt-1 text-2xl font-bold text-gray-600">355</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<p class="text-sm text-gray-500">New This Month</p>
			<p class="mt-1 text-2xl font-bold text-purple-600">47</p>
		</div>
	</div>

	<!-- Users Table -->
	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="border-b border-gray-200 bg-gray-50">
					<tr>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">User</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Role</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Status</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Last Active</th>
						<th class="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#each users as user}
						<tr class="transition-colors hover:bg-gray-50">
							<td class="px-6 py-4">
								<div class="flex items-center gap-3">
									<div class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 text-sm font-semibold text-purple-700">
										{user.name.split(' ').map(n => n[0]).join('')}
									</div>
									<div>
										<p class="font-medium text-gray-900">{user.name}</p>
										<p class="text-sm text-gray-500">{user.email}</p>
									</div>
								</div>
							</td>
							<td class="px-6 py-4">
								<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold {getRoleBadgeColor(user.role)}">
									{user.role}
								</span>
							</td>
							<td class="px-6 py-4">
								<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold {getStatusBadgeColor(user.status)}">
									{user.status}
								</span>
							</td>
							<td class="px-6 py-4 text-sm text-gray-500">{user.lastActive}</td>
							<td class="px-6 py-4">
								<div class="flex items-center justify-end gap-2">
									<button class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-purple-50 hover:text-purple-600" title="Edit user">
										<Edit size={16} />
									</button>
									<button class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600" title="Delete user">
										<Trash2 size={16} />
									</button>
									<button class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100" title="More options">
										<MoreVertical size={16} />
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
			<p class="text-sm text-gray-500">Showing 1 to 5 of 1,247 users</p>
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
