<script lang="ts">
	// My Requests page
	let activeTab = $state<'all' | 'pending' | 'approved' | 'rejected' | 'ready'>('all');
	let searchQuery = $state('');
	let selectedStatus = $state('all');
	let sortBy = $state('newest');
	
	// Placeholder data - will be replaced with real API calls
	const requests = [
		{
			id: 'REQ-001',
			items: [{ name: 'Chef Knife Set', image: '🔪' }],
			status: 'pending',
			requestDate: '2026-03-04',
			borrowDate: '2026-03-06',
			returnDate: '2026-03-13',
			purpose: 'Lab Exercise',
			instructor: 'Prof. Smith'
		},
		{
			id: 'REQ-002',
			items: [{ name: 'Mixing Bowl Large', image: '🥣' }, { name: 'Digital Scale', image: '⚖️' }],
			status: 'approved',
			requestDate: '2026-03-03',
			borrowDate: '2026-03-05',
			returnDate: '2026-03-12',
			purpose: 'Project',
			instructor: 'Prof. Johnson'
		},
		{
			id: 'REQ-003',
			items: [{ name: 'Food Processor', image: '🔧' }],
			status: 'rejected',
			requestDate: '2026-03-02',
			borrowDate: '2026-03-04',
			returnDate: '2026-03-11',
			purpose: 'Demonstration',
			instructor: 'Prof. Davis',
			rejectionReason: 'Item currently under maintenance'
		},
		{
			id: 'REQ-004',
			items: [{ name: 'Stand Mixer', image: '🎛️' }],
			status: 'ready',
			requestDate: '2026-03-01',
			borrowDate: '2026-03-05',
			returnDate: '2026-03-12',
			purpose: 'Lab Exercise',
			instructor: 'Prof. Wilson'
		}
	];
	
	function getStatusColor(status: string) {
		switch (status) {
			case 'pending': return 'bg-yellow-100 text-yellow-800';
			case 'approved': return 'bg-green-100 text-green-800';
			case 'rejected': return 'bg-red-100 text-red-800';
			case 'ready': return 'bg-blue-100 text-blue-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}
	
	function getStatusIcon(status: string) {
		switch (status) {
			case 'pending': return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z';
			case 'approved': return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
			case 'rejected': return 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z';
			case 'ready': return 'M5 13l4 4L19 7';
			default: return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z';
		}
	}
	
	const filteredRequests = $derived(() => {
		return requests.filter(req => {
			if (activeTab !== 'all' && req.status !== activeTab) return false;
			return true;
		});
	});
	
	const tabCounts = $derived(() => ({
		all: requests.length,
		pending: requests.filter(r => r.status === 'pending').length,
		approved: requests.filter(r => r.status === 'approved').length,
		rejected: requests.filter(r => r.status === 'rejected').length,
		ready: requests.filter(r => r.status === 'ready').length
	}));
</script>

<svelte:head>
	<title>My Requests - Student Portal</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">My Requests</h1>
			<p class="mt-1 text-sm text-gray-500">Track your equipment borrow requests</p>
		</div>
		<a href="/student/request" class="inline-flex items-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500">
			<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
			</svg>
			New Request
		</a>
	</div>
	
	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-8 overflow-x-auto">
			<button
				onclick={() => activeTab = 'all'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'all' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				All Requests
				<span class="ml-2 rounded-full {activeTab === 'all' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs font-medium">
					{tabCounts.all}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'pending'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'pending' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Pending
				<span class="ml-2 rounded-full {activeTab === 'pending' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs font-medium">
					{tabCounts.pending}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'approved'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'approved' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Approved
				<span class="ml-2 rounded-full {activeTab === 'approved' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs font-medium">
					{tabCounts.approved}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'ready'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'ready' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Ready for Pickup
				<span class="ml-2 rounded-full {activeTab === 'ready' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs font-medium">
					{tabCounts.ready}
				</span>
			</button>
			<button
				onclick={() => activeTab = 'rejected'}
				class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors {activeTab === 'rejected' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Rejected
				<span class="ml-2 rounded-full {activeTab === 'rejected' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 text-xs font-medium">
					{tabCounts.rejected}
				</span>
			</button>
		</nav>
	</div>
	
	<!-- Requests List -->
	<div class="space-y-4">
		{#each filteredRequests as request}
			<div class="overflow-hidden rounded-lg bg-white shadow transition-all hover:shadow-md">
				<div class="p-6">
					<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
						<!-- Request Info -->
						<div class="flex-1">
							<div class="flex items-start justify-between">
								<div>
									<div class="flex items-center gap-3">
										<h3 class="text-lg font-semibold text-gray-900">{request.id}</h3>
										<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {getStatusColor(request.status)}">
											<svg class="mr-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getStatusIcon(request.status)}/>
											</svg>
											{request.status.charAt(0).toUpperCase() + request.status.slice(1)}
										</span>
									</div>
									<p class="mt-1 text-sm text-gray-500">Requested on {new Date(request.requestDate).toLocaleDateString()}</p>
								</div>
							</div>
							
							<!-- Items -->
							<div class="mt-4">
								<p class="text-sm font-medium text-gray-700">Items:</p>
								<div class="mt-2 flex flex-wrap gap-2">
									{#each request.items as item}
										<div class="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
											<span class="mr-2 text-lg">{item.image}</span>
											<span class="text-sm font-medium text-gray-900">{item.name}</span>
										</div>
									{/each}
								</div>
							</div>
							
							<!-- Details -->
							<div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
								<div>
									<p class="text-xs font-medium text-gray-500">Borrow Period</p>
									<p class="mt-1 text-sm text-gray-900">
										{new Date(request.borrowDate).toLocaleDateString()} - {new Date(request.returnDate).toLocaleDateString()}
									</p>
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500">Purpose</p>
									<p class="mt-1 text-sm text-gray-900">{request.purpose}</p>
								</div>
								<div>
									<p class="text-xs font-medium text-gray-500">Instructor</p>
									<p class="mt-1 text-sm text-gray-900">{request.instructor}</p>
								</div>
							</div>
							
							<!-- Rejection Reason -->
							{#if request.status === 'rejected' && request.rejectionReason}
								<div class="mt-4 rounded-lg bg-red-50 p-3">
									<div class="flex">
										<svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
										</svg>
										<div class="ml-3">
											<p class="text-sm font-medium text-red-800">Rejection Reason</p>
											<p class="mt-1 text-sm text-red-700">{request.rejectionReason}</p>
										</div>
									</div>
								</div>
							{/if}
						</div>
						
						<!-- Actions -->
						<div class="flex flex-col gap-2 lg:ml-6">
							<button class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500">
								View Details
							</button>
							{#if request.status === 'pending'}
								<button class="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500">
									Cancel Request
								</button>
							{/if}
							{#if request.status === 'ready'}
								<button class="inline-flex items-center justify-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500">
									Pick Up Now
								</button>
							{/if}
							{#if request.status === 'rejected'}
								<button class="inline-flex items-center justify-center rounded-lg border border-pink-300 bg-white px-4 py-2 text-sm font-medium text-pink-700 hover:bg-pink-50 focus:outline-none focus:ring-2 focus:ring-pink-500">
									Appeal Request
								</button>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/each}
		
		{#if filteredRequests.length === 0}
			<div class="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
				<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
				</svg>
				<h3 class="mt-2 text-sm font-medium text-gray-900">No requests found</h3>
				<p class="mt-1 text-sm text-gray-500">Get started by creating a new request.</p>
				<div class="mt-6">
					<a href="/student/request" class="inline-flex items-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700">
						<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
						</svg>
						New Request
					</a>
				</div>
			</div>
		{/if}
	</div>
</div>
