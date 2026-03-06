<script lang="ts">
	import { user, authStore, justLoggedIn } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { onMount } from 'svelte';
	
	let currentTime = $state(new Date());
	
	// Placeholder data - will be replaced with real API calls
	const stats = [
		{
			title: 'Pending Approvals',
			value: '8',
			urgent: 3,
			change: '+2',
			changeType: 'neutral',
			icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
			bgColor: 'bg-yellow-500'
		},
		{
			title: 'Active Lab Sessions',
			value: '2',
			subtitle: 'Today',
			change: '0',
			changeType: 'neutral',
			icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
			bgColor: 'bg-blue-500'
		},
		{
			title: 'Total Students',
			value: '156',
			subtitle: 'Across 4 classes',
			change: '+12',
			changeType: 'positive',
			icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
			bgColor: 'bg-green-500'
		},
		{
			title: 'Equipment in Use',
			value: '24',
			subtitle: 'By your students',
			change: '+5',
			changeType: 'neutral',
			icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
			bgColor: 'bg-purple-500'
		}
	];
	
	const pendingApprovals = [
		{
			id: 'REQ-045',
			student: { name: 'John Doe', yearLevel: '3rd Year', block: 'A', avatar: 'JD' },
			items: ['Chef Knife Set', 'Mixing Bowl'],
			borrowDate: '2026-03-08',
			returnDate: '2026-03-15',
			urgent: true,
			daysUntil: 1
		},
		{
			id: 'REQ-046',
			student: { name: 'Jane Smith', yearLevel: '2nd Year', block: 'B', avatar: 'JS' },
			items: ['Digital Scale'],
			borrowDate: '2026-03-09',
			returnDate: '2026-03-16',
			urgent: true,
			daysUntil: 2
		},
		{
			id: 'REQ-047',
			student: { name: 'Mike Johnson', yearLevel: '3rd Year', block: 'A', avatar: 'MJ' },
			items: ['Stand Mixer', 'Baking Sheet Set'],
			borrowDate: '2026-03-12',
			returnDate: '2026-03-19',
			urgent: false,
			daysUntil: 5
		}
	];
	
	const upcomingSessions = [
		{
			id: 1,
			title: 'Baking Fundamentals Lab',
			date: '2026-03-08',
			time: '09:00 AM - 12:00 PM',
			section: 'CULN 301-A',
			room: 'Lab Room 1',
			students: 28,
			equipment: ['Oven', 'Mixing Bowls', 'Measuring Tools']
		},
		{
			id: 2,
			title: 'Culinary Techniques Demo',
			date: '2026-03-09',
			time: '02:00 PM - 05:00 PM',
			section: 'CULN 201-B',
			room: 'Lab Room 2',
			students: 32,
			equipment: ['Chef Knives', 'Cutting Boards', 'Pots & Pans']
		},
		{
			id: 3,
			title: 'Food Safety Practical',
			date: '2026-03-10',
			time: '10:00 AM - 01:00 PM',
			section: 'CULN 101-C',
			room: 'Lab Room 3',
			students: 25,
			equipment: ['Thermometers', 'Sanitizing Equipment']
		}
	];
	
	const recentActivity = [
		{ action: 'Approved request', detail: 'REQ-044 - Sarah Wilson', time: '10 minutes ago', type: 'approved' },
		{ action: 'New request submitted', detail: 'REQ-047 - Mike Johnson', time: '1 hour ago', type: 'pending' },
		{ action: 'Rejected request', detail: 'REQ-043 - Tom Brown (Item unavailable)', time: '2 hours ago', type: 'rejected' },
		{ action: 'Equipment returned', detail: 'Chef Knife Set - Emma Davis', time: '3 hours ago', type: 'completed' }
	];
	
	const classes = [
		{ code: 'CULN 301-A', name: 'Advanced Baking', students: 28, activeBorrowers: 8, overdue: 0 },
		{ code: 'CULN 201-B', name: 'Culinary Techniques', students: 32, activeBorrowers: 12, overdue: 1 },
		{ code: 'CULN 101-C', name: 'Food Safety', students: 25, activeBorrowers: 4, overdue: 0 },
		{ code: 'CULN 401-A', name: 'Restaurant Management', students: 71, activeBorrowers: 0, overdue: 0 }
	];
	
	onMount(() => {
		if ($justLoggedIn) {
			toastStore.success('Welcome back! You have successfully logged in.', 'Login Successful', 5000);
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
	<title>Instructor Dashboard - CHTM Lab Equipment</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">
				{greeting()}, {$user?.firstName}!
			</h1>
			<p class="mt-1 text-sm text-gray-500">Lab Equipment Management Overview</p>
		</div>
		<div class="flex gap-3">
			<a href="/instructor/requests" class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500">
				<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
				</svg>
				Review Requests
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
					{#if stat.subtitle}
						<p class="ml-16 text-xs text-gray-400">{stat.subtitle}</p>
					{/if}
				</dt>
				<dd class="ml-16 flex items-baseline">
					<p class="text-2xl font-semibold text-gray-900">{stat.value}</p>
					{#if stat.urgent}
						<span class="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
							{stat.urgent} urgent
						</span>
					{/if}
				</dd>
			</div>
		{/each}
	</div>
	
	<!-- Pending Approvals Widget (Priority) -->
	<div class="rounded-lg bg-white shadow">
		<div class="border-b border-gray-200 px-6 py-4">
			<div class="flex items-center justify-between">
				<div>
					<h2 class="text-lg font-semibold text-gray-900">Pending Approvals</h2>
					<p class="mt-1 text-sm text-gray-500">Requests requiring your immediate attention</p>
				</div>
				<a href="/instructor/requests" class="text-sm font-medium text-pink-600 hover:text-pink-700">
					View all →
				</a>
			</div>
		</div>
		<div class="divide-y divide-gray-200">
			{#each pendingApprovals as request}
				<div class="px-6 py-4 hover:bg-gray-50 {request.urgent ? 'bg-yellow-50' : ''}">
					<div class="flex items-start justify-between">
						<div class="flex-1">
							<div class="flex items-center gap-3">
								<div class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-pink-50 border-2 border-pink-200 text-pink-700 font-semibold text-sm">
									{request.student.avatar}
								</div>
								<div>
									<p class="text-sm font-medium text-gray-900">{request.student.name}</p>
									<p class="text-xs text-gray-500">{request.student.yearLevel} • Block {request.student.block}</p>
								</div>
								{#if request.urgent}
									<span class="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
										Urgent - {request.daysUntil} day{request.daysUntil !== 1 ? 's' : ''}
									</span>
								{/if}
							</div>
							<div class="mt-2 ml-13">
								<p class="text-sm text-gray-600">
									<span class="font-medium">{request.items.length} item{request.items.length !== 1 ? 's' : ''}:</span>
									{request.items.join(', ')}
								</p>
								<p class="mt-1 text-xs text-gray-500">
									{new Date(request.borrowDate).toLocaleDateString()} - {new Date(request.returnDate).toLocaleDateString()}
								</p>
							</div>
						</div>
						<div class="ml-4 flex flex-col gap-2">
							<button class="inline-flex items-center rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
								✓ Approve
							</button>
							<button class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
								✗ Reject
							</button>
							<button class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
								View Details
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
	
	<!-- Two Column Layout -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Upcoming Lab Sessions -->
		<div class="rounded-lg bg-white shadow">
			<div class="border-b border-gray-200 px-6 py-4">
				<h2 class="text-lg font-semibold text-gray-900">Upcoming Lab Sessions</h2>
			</div>
			<div class="divide-y divide-gray-200">
				{#each upcomingSessions as session}
					<div class="px-6 py-4 hover:bg-gray-50">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<p class="text-sm font-medium text-gray-900">{session.title}</p>
								<p class="mt-1 text-xs text-gray-500">{session.section} • {session.room}</p>
								<p class="mt-1 text-xs text-gray-600">
									{new Date(session.date).toLocaleDateString()} • {session.time}
								</p>
								<p class="mt-1 text-xs text-gray-500">{session.students} students enrolled</p>
							</div>
							<button class="ml-4 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
								Manage
							</button>
						</div>
					</div>
				{/each}
			</div>
			<div class="border-t border-gray-200 px-6 py-3">
				<a href="/instructor/sessions" class="text-sm font-medium text-pink-600 hover:text-pink-700">
					View all sessions →
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
								<p class="mt-1 text-sm text-gray-500">{activity.detail}</p>
							</div>
							<div class="ml-4 flex flex-col items-end">
								<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {
									activity.type === 'completed' ? 'bg-green-100 text-green-800' :
									activity.type === 'pending' ? 'bg-yellow-100 text-yellow-800' :
									activity.type === 'approved' ? 'bg-blue-100 text-blue-800' :
									'bg-red-100 text-red-800'
								}">
									{activity.type}
								</span>
								<span class="mt-1 text-xs text-gray-500">{activity.time}</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
	
	<!-- Class Overview -->
	<div class="rounded-lg bg-white shadow">
		<div class="border-b border-gray-200 px-6 py-4">
			<h2 class="text-lg font-semibold text-gray-900">Class Overview</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="min-w-full divide-y divide-gray-200">
				<thead class="bg-gray-50">
					<tr>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Class</th>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Students</th>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Active Borrowers</th>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Overdue</th>
						<th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each classes as cls}
						<tr class="hover:bg-gray-50">
							<td class="whitespace-nowrap px-6 py-4">
								<div class="text-sm font-medium text-gray-900">{cls.code}</div>
								<div class="text-sm text-gray-500">{cls.name}</div>
							</td>
							<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{cls.students}</td>
							<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{cls.activeBorrowers}</td>
							<td class="whitespace-nowrap px-6 py-4">
								{#if cls.overdue > 0}
									<span class="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
										{cls.overdue}
									</span>
								{:else}
									<span class="text-sm text-gray-500">0</span>
								{/if}
							</td>
							<td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
								<a href="/instructor/classes/{cls.code}" class="text-pink-600 hover:text-pink-900">View Details</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
