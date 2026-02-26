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
	<title>Custodian Dashboard - CHTM Cooks</title>
</svelte:head>

<div class="p-6">
	<div class="mx-auto max-w-7xl space-y-6">
		<!-- Welcome Header -->
		<div class="rounded-2xl bg-gradient-to-r from-orange-600 to-orange-700 p-8 text-white shadow-lg">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-4xl font-bold">
						{greeting()}, {$user?.firstName}! 👋
					</h1>
					<p class="mt-2 text-lg text-orange-100">
						Welcome to your custodian dashboard
					</p>
					<p class="mt-1 text-sm text-orange-200">
						Custodian
					</p>
				</div>
				<div class="hidden md:block">
					<div class="rounded-full bg-white/10 p-4 backdrop-blur-sm">
						<svg class="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
						</svg>
					</div>
				</div>
			</div>
		</div>
	
	<!-- Quick Stats -->
	<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-600">Equipment</h3>
			<p class="mt-2 text-3xl font-bold text-orange-600">0</p>
			<p class="mt-1 text-sm text-gray-500">Total items</p>
		</div>
		
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-600">Maintenance</h3>
			<p class="mt-2 text-3xl font-bold text-yellow-600">0</p>
			<p class="mt-1 text-sm text-gray-500">Pending tasks</p>
		</div>
		
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-600">Inventory</h3>
			<p class="mt-2 text-3xl font-bold text-blue-600">0</p>
			<p class="mt-1 text-sm text-gray-500">Items tracked</p>
		</div>
		
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-600">Low Stock</h3>
			<p class="mt-2 text-3xl font-bold text-red-600">0</p>
			<p class="mt-1 text-sm text-gray-500">Items to reorder</p>
		</div>
	</div>
	
	<!-- Quick Actions -->
	<div class="rounded-lg bg-white p-6 shadow-sm">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Quick Actions</h2>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<a
				href="/custodian/equipment"
				class="flex items-center rounded-lg border-2 border-gray-200 p-4 transition-colors hover:border-orange-500 hover:bg-orange-50"
			>
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
					<svg class="h-5 w-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="font-medium text-gray-900">Equipment Status</p>
					<p class="text-sm text-gray-500">Check kitchen equipment</p>
				</div>
			</a>
			
			<a
				href="/custodian/inventory"
				class="flex items-center rounded-lg border-2 border-gray-200 p-4 transition-colors hover:border-blue-500 hover:bg-blue-50"
			>
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
					<svg class="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="font-medium text-gray-900">Inventory</p>
					<p class="text-sm text-gray-500">Manage stock levels</p>
				</div>
			</a>
			
			<a
				href="/custodian/maintenance"
				class="flex items-center rounded-lg border-2 border-gray-200 p-4 transition-colors hover:border-yellow-500 hover:bg-yellow-50"
			>
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100">
					<svg class="h-5 w-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="font-medium text-gray-900">Maintenance</p>
					<p class="text-sm text-gray-500">Schedule and track repairs</p>
				</div>
			</a>
		</div>
	</div>
	
	<!-- Recent Activity -->
	<div class="rounded-lg bg-white p-6 shadow-sm">
		<h2 class="text-lg font-semibold text-gray-900">Recent Activity</h2>
		<div class="mt-4 text-center text-gray-500">
			<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
			</svg>
			<p class="mt-4">No recent activity yet</p>
			<p class="mt-1 text-sm">Your maintenance logs will appear here</p>
		</div>
	</div>
	</div>
</div>
