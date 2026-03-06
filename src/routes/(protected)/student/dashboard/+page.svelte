<script lang="ts">
	import { user, authStore, justLoggedIn } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { onMount } from 'svelte';
	
	let currentTime = $state(new Date());
	
	// Placeholder data - will be replaced with real API calls
	const stats = [
		{
			title: 'Active Loans',
			value: '3',
			change: '+1',
			changeType: 'neutral',
			icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4',
			bgColor: 'bg-blue-500'
		},
		{
			title: 'Pending Requests',
			value: '2',
			change: '+2',
			changeType: 'neutral',
			icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
			bgColor: 'bg-yellow-500'
		},
		{
			title: 'Overdue Items',
			value: '0',
			change: '0',
			changeType: 'positive',
			icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
			bgColor: 'bg-red-500'
		},
		{
			title: 'Available Equipment',
			value: '247',
			change: '+12',
			changeType: 'positive',
			icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
			bgColor: 'bg-green-500'
		}
	];
	
	const upcomingReturns = [
		{ item: 'Chef Knife Set', dueDate: 'Tomorrow', daysRemaining: 1, status: 'warning' },
		{ item: 'Mixing Bowl Large', dueDate: 'In 3 days', daysRemaining: 3, status: 'good' },
		{ item: 'Digital Scale', dueDate: 'In 5 days', daysRemaining: 5, status: 'good' }
	];
	
	const recentActivity = [
		{ action: 'Request approved', item: 'Chef Knife Set', time: '2 hours ago', status: 'approved' },
		{ action: 'Item borrowed', item: 'Mixing Bowl Large', time: '1 day ago', status: 'completed' },
		{ action: 'Request submitted', item: 'Digital Scale', time: '2 days ago', status: 'pending' },
		{ action: 'Item returned', item: 'Cutting Board', time: '3 days ago', status: 'completed' },
		{ action: 'Request rejected', item: 'Food Processor', time: '4 days ago', status: 'rejected' }
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
	<title>Student Dashboard - CHTM Lab Equipment</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">
				{greeting()}, {$user?.firstName}!
			</h1>
			<p class="mt-1 text-sm text-gray-500">
				{#if $user?.yearLevel && $user?.block}
					{$user.yearLevel} • Block {$user.block}
				{:else}
					Lab Equipment Management
				{/if}
			</p>
		</div>
		<div class="flex gap-3">
			<a href="/student/catalog" class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500">
				<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
				</svg>
				Browse Equipment
			</a>
		</div>
	</div>
	
	<!-- Stats Grid -->
	<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
		{#each stats as stat}
			<div class="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 sm:py-6">
				<dt>
					<div class="absolute rounded-md {stat.bgColor} p-3">
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
	
	<!-- Quick Actions -->
	<div class="rounded-lg bg-white shadow">
		<div class="border-b border-gray-200 px-6 py-4">
			<h2 class="text-lg font-semibold text-gray-900">Quick Actions</h2>
		</div>
		<div class="grid grid-cols-1 divide-y divide-gray-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
			<a href="/student/catalog" class="flex items-center px-6 py-5 transition-colors hover:bg-gray-50">
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-pink-100">
					<svg class="h-6 w-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-900">Browse Equipment</p>
					<p class="text-sm text-gray-500">View available items</p>
				</div>
			</a>
			<a href="/student/request" class="flex items-center px-6 py-5 transition-colors hover:bg-gray-50">
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
					<svg class="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-900">Submit Request</p>
					<p class="text-sm text-gray-500">Borrow equipment</p>
				</div>
			</a>
			<a href="/student/borrowed" class="flex items-center px-6 py-5 transition-colors hover:bg-gray-50">
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
					<svg class="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
					</svg>
				</div>
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-900">View My Items</p>
					<p class="text-sm text-gray-500">Check borrowed items</p>
				</div>
			</a>
		</div>
	</div>
	
	<!-- Two Column Layout -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Upcoming Returns -->
		<div class="rounded-lg bg-white shadow">
			<div class="border-b border-gray-200 px-6 py-4">
				<div class="flex items-center justify-between">
					<h2 class="text-lg font-semibold text-gray-900">Upcoming Returns</h2>
					<span class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
						{upcomingReturns.length} items
					</span>
				</div>
			</div>
			<div class="divide-y divide-gray-200">
				{#each upcomingReturns as item}
					<div class="px-6 py-4 hover:bg-gray-50">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<p class="text-sm font-medium text-gray-900">{item.item}</p>
								<p class="mt-1 text-sm text-gray-500">Due: {item.dueDate}</p>
							</div>
							<div class="ml-4 flex flex-col items-end">
								<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {
									item.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
									'bg-green-100 text-green-800'
								}">
									{item.daysRemaining} {item.daysRemaining === 1 ? 'day' : 'days'} left
								</span>
								<button class="mt-2 text-xs font-medium text-pink-600 hover:text-pink-700">
									Quick Return
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
			<div class="border-t border-gray-200 px-6 py-3">
				<a href="/student/borrowed" class="text-sm font-medium text-pink-600 hover:text-pink-700">
					View all borrowed items →
				</a>
			</div>
		</div>
		
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
								<p class="mt-1 text-sm text-gray-500">{activity.item}</p>
							</div>
							<div class="ml-4 flex flex-col items-end">
								<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {
									activity.status === 'completed' ? 'bg-green-100 text-green-800' :
									activity.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
									activity.status === 'approved' ? 'bg-blue-100 text-blue-800' :
									'bg-red-100 text-red-800'
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
				<a href="/student/history" class="text-sm font-medium text-pink-600 hover:text-pink-700">
					View all activity →
				</a>
			</div>
		</div>
	</div>
</div>
