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
	<title>Student Dashboard - CHTM Cooks</title>
</svelte:head>

<div class="p-6">
	<div class="mx-auto max-w-7xl space-y-6">
		<!-- Welcome Header -->
		<div class="rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 p-8 text-white shadow-lg">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-4xl font-bold">
						{greeting()}, {$user?.firstName}! 👋
					</h1>
					<p class="mt-2 text-lg text-blue-100">
						Welcome to your student dashboard
					</p>
					{#if $user?.yearLevel && $user?.block}
						<p class="mt-1 text-sm text-blue-200">
							{$user.yearLevel} • Block {$user.block}
						</p>
					{/if}
				</div>
				<div class="hidden md:block">
					<div class="rounded-full bg-white/10 p-4 backdrop-blur-sm">
						<svg class="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
						</svg>
					</div>
				</div>
			</div>
		</div>
	
	<!-- Quick Stats -->
	<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<div class="flex items-center">
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
					<svg class="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-600">Recipes</p>
					<p class="text-2xl font-bold text-gray-900">0</p>
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<div class="flex items-center">
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
					<svg class="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-600">Completed</p>
					<p class="text-2xl font-bold text-gray-900">0</p>
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<div class="flex items-center">
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
					<svg class="h-6 w-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-600">In Progress</p>
					<p class="text-2xl font-bold text-gray-900">0</p>
				</div>
			</div>
		</div>
		
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<div class="flex items-center">
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
					<svg class="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-600">Favorites</p>
					<p class="text-2xl font-bold text-gray-900">0</p>
				</div>
			</div>
		</div>
	</div>
	
	<!-- Recent Activity -->
	<div class="rounded-lg bg-white p-6 shadow-sm">
		<h2 class="text-lg font-semibold text-gray-900">Recent Activity</h2>
		<div class="mt-4 text-center text-gray-500">
			<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
			</svg>
			<p class="mt-4">No recent activity yet</p>
			<p class="mt-1 text-sm">Start exploring recipes to see your activity here</p>
		</div>
	</div>
	</div>
</div>
