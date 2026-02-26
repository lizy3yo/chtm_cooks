<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user, isSuperadmin, accessToken } from '$lib/stores/auth';
	import Button from '$lib/components/ui/Button.svelte';
	import StatusMessage from '$lib/components/ui/StatusMessage.svelte';
	import CreateUserModal from '$lib/components/admin/CreateUserModal.svelte';
	import EditUserModal from '$lib/components/admin/EditUserModal.svelte';
	import ShortcutKeyModal from '$lib/components/admin/ShortcutKeyModal.svelte';
	
	interface User {
		id: string;
		email: string;
		role: string;
		firstName: string;
		lastName: string;
		isActive: boolean;
		emailVerified: boolean;
		createdAt: string;
		lastLogin?: string;
	}
	
	interface Stats {
		totalUsers: number;
		students: number;
		instructors: number;
		custodians: number;
		superadmins: number;
		activeShortcutKeys: number;
		newUsersThisWeek: number;
		activeUsersThisWeek: number;
		recentUsers: User[];
	}
	
	let stats = $state<Stats | null>(null);
	let users = $state<User[]>([]);
	let loading = $state(true);
	let loadingUsers = $state(false);
	let error = $state<string | null>(null);
	let showCreateModal = $state(false);
	let editingUser = $state<User | null>(null);
	let deletingUser = $state<User | null>(null);
	let creatingKeyForUser = $state<User | null>(null);
	
	// Filters
	let searchQuery = $state('');
	let roleFilter = $state<string>('all');
	let currentPage = $state(1);
	let totalPages = $state(1);
	
	// Access check
	onMount(() => {
		if (!$isSuperadmin) {
			goto('/admin/dashboard');
			return;
		}
		loadStats();
		loadUsers();
	});
	
	async function loadStats() {
		try {
			const response = await fetch('/api/dashboard/stats', {
				headers: {
					'Authorization': `Bearer ${$accessToken}`
				}
			});
			
			if (!response.ok) throw new Error('Failed to load stats');
			
			stats = await response.json();
		} catch (err: any) {
			error = err.message;
		} finally {
			loading = false;
		}
	}
	
	async function loadUsers() {
		loadingUsers = true;
		error = null;
		
		try {
			const params = new URLSearchParams({
				page: currentPage.toString(),
				limit: '10'
			});
			
			if (roleFilter && roleFilter !== 'all') {
				params.append('role', roleFilter);
			}
			
			if (searchQuery) {
				params.append('search', searchQuery);
			}
			
			const response = await fetch(`/api/users?${params}`, {
				headers: {
					'Authorization': `Bearer ${$accessToken}`
				}
			});
			
			if (!response.ok) throw new Error('Failed to load users');
			
			const data = await response.json();
			users = data.users;
			totalPages = data.pagination.totalPages;
		} catch (err: any) {
			error = err.message;
		} finally {
			loadingUsers = false;
		}
	}
	
	async function handleDeleteUser() {
		if (!deletingUser) return;
		
		try {
			const response = await fetch(`/api/users?userId=${deletingUser.id}`, {
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${$accessToken}`
				}
			});
			
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to delete user');
			}
			
			deletingUser = null;
			loadUsers();
			loadStats();
		} catch (err: any) {
			error = err.message;
		}
	}
	
	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
	
	function getRoleBadgeClass(role: string) {
		switch (role) {
			case 'superadmin': return 'bg-purple-100 text-purple-800';
			case 'instructor': return 'bg-blue-100 text-blue-800';
			case 'custodian': return 'bg-green-100 text-green-800';
			case 'student': return 'bg-gray-100 text-gray-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}
	
	$effect(() => {
		if (roleFilter || searchQuery) {
			currentPage = 1;
			loadUsers();
		}
	});
</script>

<svelte:head>
	<title>Superadmin Dashboard - CHTM Cooks</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mx-auto max-w-7xl space-y-6">
		<!-- Header -->
		<div class="rounded-2xl bg-gradient-to-r from-purple-600 to-purple-700 p-8 text-white shadow-lg">
			<h1 class="text-4xl font-bold">Superadmin Dashboard</h1>
			<p class="mt-2 text-lg text-purple-100">
				User Management & System Administration
			</p>
		</div>
		
		{#if loading}
			<div class="flex items-center justify-center py-12">
				<div class="h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600"></div>
			</div>
		{:else if stats}
			<!-- Stats Grid -->
			<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
				<div class="rounded-xl bg-white p-6 shadow-sm">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">Total Users</p>
							<p class="mt-2 text-3xl font-bold text-gray-900">{stats.totalUsers}</p>
							<p class="mt-1 text-xs text-green-600">+{stats.newUsersThisWeek} this week</p>
						</div>
						<div class="rounded-full bg-purple-100 p-3">
							<svg class="h-8 w-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
							</svg>
						</div>
					</div>
				</div>
				
				<div class="rounded-xl bg-white p-6 shadow-sm">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">Students</p>
							<p class="mt-2 text-3xl font-bold text-blue-600">{stats.students}</p>
							<p class="mt-1 text-xs text-gray-500">{Math.round((stats.students / stats.totalUsers) * 100)}% of total</p>
						</div>
						<div class="rounded-full bg-blue-100 p-3">
							<svg class="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
							</svg>
						</div>
					</div>
				</div>
				
				<div class="rounded-xl bg-white p-6 shadow-sm">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">Instructors</p>
							<p class="mt-2 text-3xl font-bold text-green-600">{stats.instructors}</p>
							<p class="mt-1 text-xs text-gray-500">{stats.custodians} custodians</p>
						</div>
						<div class="rounded-full bg-green-100 p-3">
							<svg class="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
							</svg>
						</div>
					</div>
				</div>
				
				<div class="rounded-xl bg-white p-6 shadow-sm">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-gray-600">Active Keys</p>
							<p class="mt-2 text-3xl font-bold text-orange-600">{stats.activeShortcutKeys}</p>
							<p class="mt-1 text-xs text-gray-500">Shortcut access keys</p>
						</div>
						<div class="rounded-full bg-orange-100 p-3">
							<svg class="h-8 w-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
							</svg>
						</div>
					</div>
				</div>
			</div>
			
			<!-- User Management Section -->
			<div class="rounded-xl bg-white p-6 shadow-sm">
				<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 class="text-2xl font-bold text-gray-900">User Management</h2>
						<p class="mt-1 text-sm text-gray-600">
							Manage all system users and their permissions
						</p>
					</div>
					<Button onclick={() => showCreateModal = true}>
						<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
						</svg>
						Create User
					</Button>
				</div>
				
				{#if error}
					<div class="mb-4">
						<StatusMessage type="error" title="Error" message={error} />
					</div>
				{/if}
				
				<!-- Filters -->
				<div class="mb-6 grid gap-4 sm:grid-cols-2">
					<input
						type="text"
						placeholder="Search by name or email..."
						bind:value={searchQuery}
						class="rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
					/>
					
					<select
						bind:value={roleFilter}
						class="rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
					>
						<option value="all">All Roles</option>
						<option value="student">Students</option>
						<option value="instructor">Instructors</option>
						<option value="custodian">Custodians</option>
						<option value="superadmin">Superadmins</option>
					</select>
				</div>
				
				<!-- Users Table -->
				{#if loadingUsers}
					<div class="flex items-center justify-center py-12">
						<div class="h-8 w-8 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600"></div>
					</div>
				{:else if users.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
						</svg>
						<p class="mt-2 text-gray-600">No users found</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead class="border-b border-gray-200 bg-gray-50">
								<tr>
									<th class="px-4 py-3 text-left text-sm font-semibold text-gray-900">User</th>
									<th class="px-4 py-3 text-left text-sm font-semibold text-gray-900">Role</th>
									<th class="px-4 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
									<th class="px-4 py-3 text-left text-sm font-semibold text-gray-900">Created</th>
									<th class="px-4 py-3 text-right text-sm font-semibold text-gray-900">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each users as user (user.id)}
									<tr class="hover:bg-gray-50">
										<td class="px-4 py-4">
											<div>
												<p class="font-medium text-gray-900">
													{user.firstName} {user.lastName}
												</p>
												<p class="text-sm text-gray-600">{user.email}</p>
											</div>
										</td>
										<td class="px-4 py-4">
											<span class="inline-flex rounded-full px-3 py-1 text-xs font-medium {getRoleBadgeClass(user.role)}">
												{user.role}
											</span>
										</td>
										<td class="px-4 py-4">
											<div class="flex items-center gap-2">
												<div class="h-2 w-2 rounded-full {user.isActive ? 'bg-green-500' : 'bg-red-500'}"></div>
												<span class="text-sm text-gray-600">
													{user.isActive ? 'Active' : 'Inactive'}
												</span>
											</div>
										</td>
										<td class="px-4 py-4 text-sm text-gray-600">
											{formatDate(user.createdAt)}
										</td>
										<td class="px-4 py-4">
											<div class="flex justify-end gap-2">
												{#if ['instructor', 'custodian', 'superadmin'].includes(user.role)}
													<button
														onclick={() => creatingKeyForUser = user}
														class="rounded-lg p-2 text-purple-600 hover:bg-purple-50"
														title="Create shortcut key"
													>
														<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
														</svg>
													</button>
												{/if}
												<button
													onclick={() => editingUser = user}
													class="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
													title="Edit user"
												>
													<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
													</svg>
												</button>
												<button
													onclick={() => deletingUser = user}
													class="rounded-lg p-2 text-red-600 hover:bg-red-50"
													title="Delete user"
												>
													<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
													</svg>
												</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					
					<!-- Pagination -->
					{#if totalPages > 1}
						<div class="mt-6 flex items-center justify-between">
							<p class="text-sm text-gray-600">
								Page {currentPage} of {totalPages}
							</p>
							<div class="flex gap-2">
								<button
									onclick={() => { currentPage--; loadUsers(); }}
									disabled={currentPage === 1}
									class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
								>
									Previous
								</button>
								<button
									onclick={() => { currentPage++; loadUsers(); }}
									disabled={currentPage === totalPages}
									class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
								>
									Next
								</button>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- Modals -->
{#if showCreateModal}
	<CreateUserModal 
		onClose={() => showCreateModal = false}
		onSuccess={() => { loadUsers(); loadStats(); }}
	/>
{/if}

{#if editingUser}
	<EditUserModal 
		user={editingUser}
		onClose={() => editingUser = null}
		onSuccess={() => { loadUsers(); loadStats(); }}
	/>
{/if}

{#if creatingKeyForUser}
	<ShortcutKeyModal
		userId={creatingKeyForUser.id}
		userName="{creatingKeyForUser.firstName} {creatingKeyForUser.lastName}"
		userRole={creatingKeyForUser.role}
		onClose={() => creatingKeyForUser = null}
		onSuccess={() => { creatingKeyForUser = null; loadStats(); }}
	/>
{/if}

{#if deletingUser}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-md rounded-2xl bg-white p-6">
			<h3 class="text-xl font-bold text-gray-900">Delete User</h3>
			<p class="mt-2 text-sm text-gray-600">
				Are you sure you want to delete <strong>{deletingUser.firstName} {deletingUser.lastName}</strong>? 
				This action cannot be undone.
			</p>
			<div class="mt-6 flex gap-3">
				<Button
					variant="outline"
					fullWidth
					onclick={() => deletingUser = null}
				>
					Cancel
				</Button>
				<button
					onclick={handleDeleteUser}
					class="flex-1 rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}
