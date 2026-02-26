<script lang="ts">
	import { user, authStore, justLoggedIn } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { onMount } from 'svelte';
	
	let currentTime = $state(new Date());
	
	onMount(() => {
		// Show welcome toast if just logged in
		if ($justLoggedIn) {
			toastStore.success('Welcome back! You have successfully logged in.', 'Login Successful', 5000);
			// Clear the flag
			authStore.clearJustLoggedIn();
		}
		
		const interval = setInterval(() => {
			currentTime = new Date();
		}, 1000);
		
		return () => clearInterval(interval);
	});
	
	const greeting = $derived(() => {
		const hour = currentTime.getHours();
		if (hour < 12) return 'Good morning';
		if (hour < 18) return 'Good afternoon';
		return 'Good evening';
	});
</script>

<svelte:head>
	<title>Admin Dashboard - CHTM Cooks</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mx-auto max-w-7xl space-y-6">
		<!-- Header -->
		<div class="rounded-2xl bg-gradient-to-r from-purple-600 to-purple-700 p-8 text-white shadow-lg">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-4xl font-bold">
						{greeting()}, {$user?.firstName}! 👋
					</h1>
					<p class="mt-2 text-lg text-purple-100">
						Welcome to the administration panel
					</p>
					<p class="mt-1 text-sm text-purple-200">
						Super Administrator
					</p>
				</div>
				<div class="hidden md:block">
					<div class="rounded-full bg-white/10 p-4 backdrop-blur-sm">
						<svg class="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
						</svg>
					</div>
				</div>
			</div>
		</div>
	
	<!-- Stats Overview -->
	<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-600">Total Users</h3>
			<p class="mt-2 text-3xl font-bold text-gray-900">0</p>
			<p class="mt-1 text-sm text-gray-500">All registered users</p>
		</div>
		
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-600">Active Students</h3>
			<p class="mt-2 text-3xl font-bold text-blue-600">0</p>
			<p class="mt-1 text-sm text-gray-500">Currently active</p>
		</div>
		
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-600">Staff Members</h3>
			<p class="mt-2 text-3xl font-bold text-green-600">0</p>
			<p class="mt-1 text-sm text-gray-500">Instructors & Custodians</p>
		</div>
		
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-600">Active Shortcut Keys</h3>
			<p class="mt-2 text-3xl font-bold text-purple-600">0</p>
			<p class="mt-1 text-sm text-gray-500">Valid access keys</p>
		</div>
	</div>
	
	<!-- Quick Actions -->
	<div class="rounded-lg bg-white p-6 shadow-sm">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Quick Actions</h2>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<a
				href="/admin/users"
				class="flex items-center rounded-lg border-2 border-gray-200 p-4 transition-colors hover:border-blue-500 hover:bg-blue-50"
			>
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
					<svg class="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="font-medium text-gray-900">Manage Users</p>
					<p class="text-sm text-gray-500">View and edit user accounts</p>
				</div>
			</a>
			
			<a
				href="/admin/shortcut-keys"
				class="flex items-center rounded-lg border-2 border-gray-200 p-4 transition-colors hover:border-green-500 hover:bg-green-50"
			>
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
					<svg class="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="font-medium text-gray-900">Shortcut Keys</p>
					<p class="text-sm text-gray-500">Manage staff access keys</p>
				</div>
			</a>
			
			<a
				href="/admin/settings"
				class="flex items-center rounded-lg border-2 border-gray-200 p-4 transition-colors hover:border-purple-500 hover:bg-purple-50"
			>
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
					<svg class="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="font-medium text-gray-900">System Settings</p>
					<p class="text-sm text-gray-500">Configure system options</p>
				</div>
			</a>
		</div>
	</div>
	</div>
</div>
