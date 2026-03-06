<script lang="ts">
	// My Borrowed Items page
	
	// Placeholder data - will be replaced with real API calls
	const borrowedItems = [
		{
			id: 1,
			item: 'Chef Knife Set',
			code: 'CK-001',
			image: '🔪',
			borrowedDate: '2026-03-01',
			dueDate: '2026-03-06',
			daysRemaining: 1,
			condition: 'Excellent',
			status: 'warning'
		},
		{
			id: 2,
			item: 'Mixing Bowl Large',
			code: 'MB-002',
			image: '🥣',
			borrowedDate: '2026-03-02',
			dueDate: '2026-03-09',
			daysRemaining: 4,
			condition: 'Good',
			status: 'good'
		},
		{
			id: 3,
			item: 'Digital Scale',
			code: 'DS-003',
			image: '⚖️',
			borrowedDate: '2026-02-28',
			dueDate: '2026-03-07',
			daysRemaining: 2,
			condition: 'Excellent',
			status: 'good'
		}
	];
	
	const overdueItems = [
		{
			id: 4,
			item: 'Baking Sheet Set',
			code: 'BS-005',
			image: '🍪',
			borrowedDate: '2026-02-20',
			dueDate: '2026-02-27',
			daysOverdue: 6,
			condition: 'Good',
			penalty: '$5.00'
		}
	];
	
	function getDaysRemainingColor(days: number) {
		if (days >= 3) return 'bg-green-100 text-green-800';
		if (days >= 1) return 'bg-yellow-100 text-yellow-800';
		return 'bg-red-100 text-red-800';
	}
</script>

<svelte:head>
	<title>My Borrowed Items - Student Portal</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">My Borrowed Items</h1>
			<p class="mt-1 text-sm text-gray-500">View and manage your currently borrowed equipment</p>
		</div>
		<div class="flex items-center gap-2">
			<span class="text-sm text-gray-600">Total Active:</span>
			<span class="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800">
				{borrowedItems.length} items
			</span>
		</div>
	</div>
	
	<!-- Overdue Items Alert -->
	{#if overdueItems.length > 0}
		<div class="rounded-lg border-l-4 border-red-500 bg-red-50 p-4">
			<div class="flex items-start">
				<div class="flex-shrink-0">
					<svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
					</svg>
				</div>
				<div class="ml-3 flex-1">
					<h3 class="text-sm font-medium text-red-800">Overdue Items - Immediate Action Required</h3>
					<p class="mt-1 text-sm text-red-700">
						You have {overdueItems.length} overdue {overdueItems.length === 1 ? 'item' : 'items'}. Please return them immediately to avoid additional penalties.
					</p>
					<button class="mt-3 inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
						<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
						</svg>
						Contact Custodian
					</button>
				</div>
			</div>
		</div>
		
		<!-- Overdue Items List -->
		<div class="space-y-4">
			<h2 class="text-lg font-semibold text-gray-900">Overdue Items</h2>
			{#each overdueItems as item}
				<div class="overflow-hidden rounded-lg border-2 border-red-200 bg-white shadow">
					<div class="bg-red-50 px-6 py-3">
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold text-red-800">OVERDUE - {item.daysOverdue} days</span>
							<span class="text-sm font-semibold text-red-800">Penalty: {item.penalty}</span>
						</div>
					</div>
					<div class="p-6">
						<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<!-- Item Info -->
							<div class="flex flex-1 items-start gap-4">
								<div class="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-3xl">
									{item.image}
								</div>
								<div class="flex-1">
									<h3 class="text-lg font-semibold text-gray-900">{item.item}</h3>
									<p class="text-sm text-gray-500">{item.code}</p>
									<div class="mt-3 grid grid-cols-2 gap-4">
										<div>
											<p class="text-xs font-medium text-gray-500">Borrowed Date</p>
											<p class="mt-1 text-sm text-gray-900">{new Date(item.borrowedDate).toLocaleDateString()}</p>
										</div>
										<div>
											<p class="text-xs font-medium text-gray-500">Was Due</p>
											<p class="mt-1 text-sm font-semibold text-red-600">{new Date(item.dueDate).toLocaleDateString()}</p>
										</div>
									</div>
								</div>
							</div>
							
							<!-- Actions -->
							<div class="flex flex-col gap-2 lg:ml-6">
								<button class="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500">
									Return Now
								</button>
								<button class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500">
									Report Issue
								</button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
	
	<!-- Active Borrowed Items -->
	<div class="space-y-4">
		<h2 class="text-lg font-semibold text-gray-900">Active Loans</h2>
		{#each borrowedItems as item}
			<div class="overflow-hidden rounded-lg bg-white shadow transition-all hover:shadow-md">
				<div class="p-6">
					<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
						<!-- Item Info -->
						<div class="flex flex-1 items-start gap-4">
							<div class="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-3xl">
								{item.image}
							</div>
							<div class="flex-1">
								<div class="flex items-start justify-between">
									<div>
										<h3 class="text-lg font-semibold text-gray-900">{item.item}</h3>
										<p class="text-sm text-gray-500">{item.code}</p>
									</div>
									<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {getDaysRemainingColor(item.daysRemaining)}">
										{item.daysRemaining} {item.daysRemaining === 1 ? 'day' : 'days'} left
									</span>
								</div>
								
								<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
									<div>
										<p class="text-xs font-medium text-gray-500">Borrowed Date</p>
										<p class="mt-1 text-sm text-gray-900">{new Date(item.borrowedDate).toLocaleDateString()}</p>
									</div>
									<div>
										<p class="text-xs font-medium text-gray-500">Due Date</p>
										<p class="mt-1 text-sm font-semibold text-gray-900">{new Date(item.dueDate).toLocaleDateString()}</p>
									</div>
									<div>
										<p class="text-xs font-medium text-gray-500">Condition</p>
										<p class="mt-1 text-sm text-gray-900">
											<span class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
												{item.condition}
											</span>
										</p>
									</div>
								</div>
								
								<!-- Progress Bar -->
								<div class="mt-4">
									<div class="flex items-center justify-between text-xs text-gray-600">
										<span>Time remaining</span>
										<span>{item.daysRemaining} of 7 days</span>
									</div>
									<div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
										<div 
											class="h-full rounded-full transition-all {item.daysRemaining >= 3 ? 'bg-green-500' : item.daysRemaining >= 1 ? 'bg-yellow-500' : 'bg-red-500'}"
											style="width: {(item.daysRemaining / 7) * 100}%"
										></div>
									</div>
								</div>
							</div>
						</div>
						
						<!-- Actions -->
						<div class="flex flex-col gap-2 lg:ml-6">
							<button class="inline-flex items-center justify-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500">
								Return Item
							</button>
							<button class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500">
								Request Extension
							</button>
							<button class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500">
								Report Issue
							</button>
						</div>
					</div>
				</div>
			</div>
		{/each}
		
		{#if borrowedItems.length === 0 && overdueItems.length === 0}
			<div class="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
				<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
				</svg>
				<h3 class="mt-2 text-sm font-medium text-gray-900">No borrowed items</h3>
				<p class="mt-1 text-sm text-gray-500">You don't have any items currently borrowed.</p>
				<div class="mt-6">
					<a href="/student/catalog" class="inline-flex items-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700">
						Browse Equipment
					</a>
				</div>
			</div>
		{/if}
	</div>
</div>
