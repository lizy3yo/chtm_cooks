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
	<title>Instructor Dashboard - CHTM Cooks</title>
</svelte:head>

<div class="p-6">
	<div class="mx-auto max-w-7xl space-y-6">
		<!-- Welcome Header -->
		<div class="rounded-2xl bg-gradient-to-r from-green-600 to-green-700 p-8 text-white shadow-lg">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-4xl font-bold">
						{greeting()}, {$user?.firstName}! 👋
					</h1>
					<p class="mt-2 text-lg text-green-100">
						Welcome to your instructor dashboard
					</p>
					<p class="mt-1 text-sm text-green-200">
						Instructor
					</p>
				</div>
				<div class="hidden md:block">
					<div class="rounded-full bg-white/10 p-4 backdrop-blur-sm">
						<svg class="h-16 w-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
						</svg>
					</div>
				</div>
			</div>
		</div>
	
	<!-- Quick Stats -->
	<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-600">My Classes</h3>
			<p class="mt-2 text-3xl font-bold text-green-600">0</p>
			<p class="mt-1 text-sm text-gray-500">Active classes</p>
		</div>
		
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-600">Total Students</h3>
			<p class="mt-2 text-3xl font-bold text-blue-600">0</p>
			<p class="mt-1 text-sm text-gray-500">Enrolled students</p>
		</div>
		
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-600">Pending Reviews</h3>
			<p class="mt-2 text-3xl font-bold text-orange-600">0</p>
			<p class="mt-1 text-sm text-gray-500">Submissions to review</p>
		</div>
		
		<div class="rounded-lg bg-white p-6 shadow-sm">
			<h3 class="text-sm font-medium text-gray-600">Active Recipes</h3>
			<p class="mt-2 text-3xl font-bold text-purple-600">0</p>
			<p class="mt-1 text-sm text-gray-500">Published recipes</p>
		</div>
	</div>
	
	<!-- Quick Actions -->
	<div class="rounded-lg bg-white p-6 shadow-sm">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Quick Actions</h2>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<a
				href="/instructor/classes"
				class="flex items-center rounded-lg border-2 border-gray-200 p-4 transition-colors hover:border-green-500 hover:bg-green-50"
			>
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
					<svg class="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="font-medium text-gray-900">Manage Classes</p>
					<p class="text-sm text-gray-500">View and organize classes</p>
				</div>
			</a>
			
			<a
				href="/instructor/students"
				class="flex items-center rounded-lg border-2 border-gray-200 p-4 transition-colors hover:border-blue-500 hover:bg-blue-50"
			>
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
					<svg class="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="font-medium text-gray-900">View Students</p>
					<p class="text-sm text-gray-500">Monitor student progress</p>
				</div>
			</a>
			
			<a
				href="/instructor/recipes"
				class="flex items-center rounded-lg border-2 border-gray-200 p-4 transition-colors hover:border-purple-500 hover:bg-purple-50"
			>
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
					<svg class="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="font-medium text-gray-900">Manage Recipes</p>
					<p class="text-sm text-gray-500">Create and edit recipes</p>
				</div>
			</a>
		</div>
	</div>
	
	<!-- Recent Activity -->
	<div class="rounded-lg bg-white p-6 shadow-sm">
		<h2 class="text-lg font-semibold text-gray-900">Recent Activity</h2>
		<div class="mt-4 text-center text-gray-500">
			<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
			</svg>
			<p class="mt-4">No recent activity yet</p>
			<p class="mt-1 text-sm">Your class activities will appear here</p>
		</div>
	</div>
	</div>
</div>
