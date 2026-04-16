<script lang="ts">
	import { Search, Plus, Filter, MoreVertical, Edit, Trash2, Shield, UserCheck, UserX, Upload, Download, Info } from 'lucide-svelte';

	// State management
	let activeTab = $state<'all' | 'create' | 'bulk-import' | 'inactive'>('all');
	let searchQuery = $state('');
	let selectedRole = $state('all');
	let selectedStatus = $state('all');

	// Mock data - replace with actual API calls
	let users = $state([
		{ id: 1, name: 'John Doe', email: 'john@example.com', role: 'student', status: 'active', lastActive: '2 hours ago', yearLevel: '3rd Year', block: 'A' },
		{ id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'instructor', status: 'active', lastActive: '5 minutes ago' },
		{ id: 3, name: 'Bob Johnson', email: 'bob@example.com', role: 'custodian', status: 'active', lastActive: '1 day ago' },
		{ id: 4, name: 'Alice Williams', email: 'alice@example.com', role: 'student', status: 'active', lastActive: '3 hours ago', yearLevel: '2nd Year', block: 'B' },
		{ id: 5, name: 'Charlie Brown', email: 'charlie@example.com', role: 'student', status: 'inactive', lastActive: '2 weeks ago', yearLevel: '4th Year', block: 'C' }
	]);

	let stats = $state({
		total: 1247,
		active: 892,
		inactive: 355,
		newThisMonth: 47,
		students: 1050,
		instructors: 45,
		custodians: 12,
		superadmins: 3
	});

	function getRoleBadgeColor(role: string): string {
		const colors: Record<string, string> = {
			student: 'bg-blue-100 text-blue-800',
			instructor: 'bg-purple-100 text-purple-800',
			custodian: 'bg-pink-100 text-pink-800',
			superadmin: 'bg-gray-900 text-white'
		};
		return colors[role] || 'bg-gray-100 text-gray-800';
	}

	function getStatusBadgeColor(status: string): string {
		return status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600';
	}

	function handleCreateUser() {
		activeTab = 'create';
	}

	function handleBulkImport() {
		activeTab = 'bulk-import';
	}
</script>

<div class="space-y-6">
	<!-- Header with Info -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900">User Management</h1>
			<p class="mt-1 text-sm text-gray-500">Manage all users across the system with role-based access control</p>
			
			<!-- Info Banner -->
			<div class="mt-4 flex items-start gap-3 rounded-lg border border-pink-200 bg-pink-50 p-4">
				<Info size={20} class="mt-0.5 shrink-0 text-pink-600" />
				<div class="flex-1 text-sm">
					<p class="font-medium text-pink-900">User Management Features</p>
					<ul class="mt-2 space-y-1 text-pink-800">
						<li>• Create, edit, and deactivate users across all roles (Student, Instructor, Custodian)</li>
						<li>• Bulk import users via CSV/Excel for efficient onboarding</li>
						<li>• Assign users to class codes for organized academic structure</li>
						<li>• Track user activity, login history, and account status</li>
						<li>• Reset passwords and manage account lockouts</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6">
			<button
				onclick={() => activeTab = 'all'}
				class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'all'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				All Users
			</button>
			<button
				onclick={() => activeTab = 'create'}
				class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'create'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Create User
			</button>
			<button
				onclick={() => activeTab = 'bulk-import'}
				class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'bulk-import'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Bulk Import
			</button>
			<button
				onclick={() => activeTab = 'inactive'}
				class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'inactive'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Inactive Users
			</button>
		</nav>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'all'}
		<!-- Stats -->
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
				<p class="text-sm font-medium text-gray-500">Total Users</p>
				<p class="mt-2 text-3xl font-bold text-gray-900">{stats.total.toLocaleString()}</p>
				<p class="mt-1 text-xs text-gray-500">All roles combined</p>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
				<p class="text-sm font-medium text-gray-500">Active Users</p>
				<p class="mt-2 text-3xl font-bold text-emerald-600">{stats.active.toLocaleString()}</p>
				<p class="mt-1 text-xs text-gray-500">{((stats.active / stats.total) * 100).toFixed(1)}% of total</p>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
				<p class="text-sm font-medium text-gray-500">Inactive Users</p>
				<p class="mt-2 text-3xl font-bold text-gray-600">{stats.inactive.toLocaleString()}</p>
				<p class="mt-1 text-xs text-gray-500">Require attention</p>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
				<p class="text-sm font-medium text-gray-500">New This Month</p>
				<p class="mt-2 text-3xl font-bold text-pink-600">{stats.newThisMonth.toLocaleString()}</p>
				<p class="mt-1 text-xs text-emerald-600">+12% from last month</p>
			</div>
		</div>

		<!-- Filters and Actions -->
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div class="grid flex-1 gap-4 sm:grid-cols-3">
					<!-- Search -->
					<div class="relative">
						<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search users..."
							class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
						/>
					</div>

					<!-- Role Filter -->
					<select
						bind:value={selectedRole}
						class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
					>
						<option value="all">All Roles</option>
						<option value="student">Student</option>
						<option value="instructor">Instructor</option>
						<option value="custodian">Custodian</option>
						<option value="superadmin">Superadmin</option>
					</select>

					<!-- Status Filter -->
					<select
						bind:value={selectedStatus}
						class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
					>
						<option value="all">All Status</option>
						<option value="active">Active</option>
						<option value="inactive">Inactive</option>
					</select>
				</div>

				<div class="flex gap-2">
					<button
						onclick={handleBulkImport}
						class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
					>
						<Upload size={18} />
						Import
					</button>
					<button
						onclick={handleCreateUser}
						class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-pink-700"
					>
						<Plus size={18} />
						Add User
					</button>
				</div>
			</div>
		</div>

		<!-- Users Table -->
		<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">User</th>
							<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Role</th>
							<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Status</th>
							<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Details</th>
							<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Last Active</th>
							<th class="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each users as user}
							<tr class="transition-colors hover:bg-gray-50">
								<td class="px-6 py-4">
									<div class="flex items-center">
										<div class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-sm font-semibold text-white">
											{user.name.split(' ').map(n => n[0]).join('')}
										</div>
										<div class="ml-3">
											<p class="font-medium text-gray-900">{user.name}</p>
											<p class="text-sm text-gray-500">{user.email}</p>
										</div>
									</div>
								</td>
								<td class="px-6 py-4">
									<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {getRoleBadgeColor(user.role)}">
										{user.role.charAt(0).toUpperCase() + user.role.slice(1)}
									</span>
								</td>
								<td class="px-6 py-4">
									<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {getStatusBadgeColor(user.status)}">
										{user.status.charAt(0).toUpperCase() + user.status.slice(1)}
									</span>
								</td>
								<td class="px-6 py-4 text-sm text-gray-600">
									{#if user.yearLevel && user.block}
										{user.yearLevel} - Block {user.block}
									{:else}
										—
									{/if}
								</td>
								<td class="px-6 py-4 text-sm text-gray-600">{user.lastActive}</td>
								<td class="px-6 py-4 text-right">
									<button class="inline-flex items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
										<MoreVertical size={18} />
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{:else if activeTab === 'create'}
		<div class="mx-auto max-w-2xl">
			<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<h2 class="text-lg font-semibold text-gray-900">Create New User</h2>
				<p class="mt-1 text-sm text-gray-500">Add a new user to the system with role-based permissions</p>
				
				<form class="mt-6 space-y-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class="block text-sm font-medium text-gray-700">First Name</label>
							<input type="text" class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700">Last Name</label>
							<input type="text" class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
						</div>
					</div>
					
					<div>
						<label class="block text-sm font-medium text-gray-700">Email Address</label>
						<input type="email" class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
					</div>
					
					<div>
						<label class="block text-sm font-medium text-gray-700">Role</label>
						<select class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20">
							<option value="">Select a role</option>
							<option value="student">Student</option>
							<option value="instructor">Instructor</option>
							<option value="custodian">Custodian</option>
							<option value="superadmin">Superadmin</option>
						</select>
					</div>
					
					<div class="flex justify-end gap-3 pt-4">
						<button type="button" onclick={() => activeTab = 'all'} class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
							Cancel
						</button>
						<button type="submit" class="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700">
							Create User
						</button>
					</div>
				</form>
			</div>
		</div>
	{:else if activeTab === 'bulk-import'}
		<div class="mx-auto max-w-2xl">
			<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<h2 class="text-lg font-semibold text-gray-900">Bulk Import Users</h2>
				<p class="mt-1 text-sm text-gray-500">Import multiple users at once using CSV or Excel files</p>
				
				<div class="mt-6 space-y-4">
					<div class="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
						<Upload size={48} class="mx-auto text-gray-400" />
						<p class="mt-2 text-sm font-medium text-gray-900">Drop your file here or click to browse</p>
						<p class="mt-1 text-xs text-gray-500">Supports CSV and Excel files (max 10MB)</p>
						<button class="mt-4 rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700">
							Select File
						</button>
					</div>
					
					<div class="rounded-lg bg-blue-50 p-4">
						<p class="text-sm font-medium text-blue-900">Template Format</p>
						<p class="mt-1 text-xs text-blue-800">Download the template file to ensure your data is formatted correctly</p>
						<button class="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700">
							<Download size={16} />
							Download Template
						</button>
					</div>
				</div>
			</div>
		</div>
	{:else if activeTab === 'inactive'}
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<p class="text-sm text-gray-500">Showing inactive users who haven't logged in for 30+ days</p>
			<div class="mt-4">
				<p class="text-center text-gray-400">No inactive users to display</p>
			</div>
		</div>
	{/if}
</div>
