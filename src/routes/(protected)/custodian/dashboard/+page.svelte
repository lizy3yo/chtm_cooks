<script lang="ts">
	import { user, authStore, justLoggedIn } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { onMount } from 'svelte';
	
	let currentTime = $state(new Date());
	
	// Placeholder data - will be replaced with real API calls
	const stats = [
		{
			title: 'Total Items',
			value: '247',
			change: '+12',
			changeType: 'positive',
			icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'
		},
		{
			title: 'Active Loans',
			value: '32',
			change: '+5',
			changeType: 'neutral',
			icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
		},
		{
			title: 'Pending Requests',
			value: '8',
			change: '-3',
			changeType: 'positive',
			icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
		},
		{
			title: 'Low Stock Items',
			value: '5',
			change: '+2',
			changeType: 'negative',
			icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
		}
	];
	
	const recentActivity = [
		{ action: 'New request submitted', user: 'John Doe', time: '5 minutes ago', status: 'pending' },
		{ action: 'Item returned', user: 'Jane Smith', time: '1 hour ago', status: 'completed' },
		{ action: 'Loan approved', user: 'Mike Johnson', time: '2 hours ago', status: 'approved' },
		{ action: 'Stock updated', user: 'System', time: '3 hours ago', status: 'info' }
	];
	
	const overdueItems = [
		{ item: 'Chef Knife Set', borrower: 'Sarah Wilson', dueDate: '2 days ago' },
		{ item: 'Mixing Bowl Large', borrower: 'Tom Brown', dueDate: '1 day ago' },
		{ item: 'Digital Scale', borrower: 'Emma Davis', dueDate: '5 hours ago' }
	];
	
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

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">
				{greeting()}, {$user?.firstName}!
			</h1>
			<p class="mt-1 text-sm text-gray-500">Kitchen Laboratory Management Overview</p>
		</div>
		<div class="flex gap-3">
			<button class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500">
				<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
				</svg>
				Export Report
			</button>
		</div>
	</div>
	
	<!-- Stats Grid -->
	<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
		{#each stats as stat}
			<div class="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 sm:py-6">
				<dt>
					<div class="absolute rounded-md bg-emerald-500 p-3">
						<svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={stat.icon}/>
						</svg>
					</div>
					<p class="ml-16 truncate text-sm font-medium text-gray-500">{stat.title}</p>
				</dt>
				<dd class="ml-16 flex items-baseline">
					<p class="text-2xl font-semibold text-gray-900">{stat.value}</p>
					<p class="ml-2 flex items-baseline text-sm font-semibold {stat.changeType === 'positive' ? 'text-green-600' : stat.changeType === 'negative' ? 'text-red-600' : 'text-gray-600'}">
						{stat.change}
					</p>
				</dd>
			</div>
		{/each}
	</div>
	
	<!-- Two Column Layout -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Recent Activity -->
		<div class="rounded-lg bg-white shadow">
			<div class="border-b border-gray-200 px-6 py-4">
				<h2 class="text-lg font-semibold text-gray-900">Recent Activity</h2>
			</div>
			<div class="divide-y divide-gray-200">
				{#each recentActivity as activity}
					<div class="px-6 py-4 hover:bg-gray-50">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<p class="text-sm font-medium text-gray-900">{activity.action}</p>
								<p class="mt-1 text-sm text-gray-500">{activity.user}</p>
							</div>
							<div class="ml-4 flex flex-col items-end">
								<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {
									activity.status === 'completed' ? 'bg-green-100 text-green-800' :
									activity.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
									activity.status === 'approved' ? 'bg-blue-100 text-blue-800' :
									'bg-gray-100 text-gray-800'
								}">
									{activity.status}
								</span>
								<span class="mt-1 text-xs text-gray-500">{activity.time}</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
			<div class="border-t border-gray-200 px-6 py-3">
				<a href="/custodian/requests" class="text-sm font-medium text-emerald-600 hover:text-emerald-700">
					View all activity →
				</a>
			</div>
		</div>
		
		<!-- Overdue Items -->
		<div class="rounded-lg bg-white shadow">
			<div class="border-b border-gray-200 px-6 py-4">
				<div class="flex items-center justify-between">
					<h2 class="text-lg font-semibold text-gray-900">Overdue Items</h2>
					<span class="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
						{overdueItems.length} items
					</span>
				</div>
			</div>
			<div class="divide-y divide-gray-200">
				{#each overdueItems as item}
					<div class="px-6 py-4 hover:bg-gray-50">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<p class="text-sm font-medium text-gray-900">{item.item}</p>
								<p class="mt-1 text-sm text-gray-500">Borrowed by: {item.borrower}</p>
							</div>
							<div class="ml-4 text-right">
								<p class="text-sm font-medium text-red-600">{item.dueDate}</p>
							</div>
						</div>
					</div>
				{/each}
			</div>
			<div class="border-t border-gray-200 px-6 py-3">
				<a href="/custodian/requests" class="text-sm font-medium text-emerald-600 hover:text-emerald-700">
					View all overdue items →
				</a>
			</div>
		</div>
	</div>
	
	<!-- Quick Actions -->
	<div class="rounded-lg bg-white shadow">
		<div class="border-b border-gray-200 px-6 py-4">
			<h2 class="text-lg font-semibold text-gray-900">Quick Actions</h2>
		</div>
		<div class="grid grid-cols-1 divide-y divide-gray-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
			<a href="/custodian/inventory" class="flex items-center px-6 py-5 transition-colors hover:bg-gray-50">
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100">
					<svg class="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-900">Add New Item</p>
					<p class="text-sm text-gray-500">Add inventory item</p>
				</div>
			</a>
			<a href="/custodian/requests" class="flex items-center px-6 py-5 transition-colors hover:bg-gray-50">
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
					<svg class="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-900">Review Requests</p>
					<p class="text-sm text-gray-500">Process pending requests</p>
				</div>
			</a>
			<a href="/custodian/requests" class="flex items-center px-6 py-5 transition-colors hover:bg-gray-50">
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
					<svg class="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-900">Process Returns</p>
					<p class="text-sm text-gray-500">Check-in returned items</p>
				</div>
			</a>
		</div>
	</div>
</div>
