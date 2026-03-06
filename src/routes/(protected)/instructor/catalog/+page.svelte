<script lang="ts">
	// Equipment Catalog page (View-Only for Instructors)
	let viewMode = $state<'grid' | 'list'>('grid');
	let searchQuery = $state('');
	let selectedCategory = $state('all');
	let selectedAvailability = $state('all');
	let selectedCondition = $state('all');
	let sortBy = $state('name');
	let showDetailModal = $state(false);
	let selectedItem = $state<any>(null);
	
	// Placeholder data - will be replaced with real API calls
	const categories = ['All', 'Cookware', 'Utensils', 'Appliances', 'Bakeware', 'Measuring Tools'];
	const availabilityOptions = ['All', 'Available', 'Borrowed', 'Maintenance'];
	const conditionOptions = ['All', 'Excellent', 'Good', 'Fair'];
	const sortOptions = [
		{ value: 'name', label: 'Name' },
		{ value: 'category', label: 'Category' },
		{ value: 'stock', label: 'Stock Level' }
	];
	
	const equipment = [
		{
			id: 1,
			name: 'Chef Knife Set',
			code: 'CK-001',
			category: 'Utensils',
			availability: 'Available',
			condition: 'Excellent',
			quantityAvailable: 5,
			quantityTotal: 8,
			image: '🔪',
			description: 'Professional chef knife set with 8 pieces',
			borrowedBy: ['John Doe (3rd Year A)', 'Jane Smith (2nd Year B)', 'Mike Johnson (3rd Year A)']
		},
		{
			id: 2,
			name: 'Mixing Bowl Large',
			code: 'MB-002',
			category: 'Cookware',
			availability: 'Available',
			condition: 'Good',
			quantityAvailable: 12,
			quantityTotal: 15,
			image: '🥣',
			description: 'Stainless steel mixing bowl, 5L capacity',
			borrowedBy: ['Sarah Wilson (2nd Year A)', 'Tom Brown (1st Year C)', 'Emma Davis (3rd Year B)']
		},
		{
			id: 3,
			name: 'Digital Scale',
			code: 'DS-003',
			category: 'Measuring Tools',
			availability: 'Borrowed',
			condition: 'Excellent',
			quantityAvailable: 0,
			quantityTotal: 8,
			image: '⚖️',
			description: 'Digital kitchen scale, 5kg capacity',
			borrowedBy: ['All units borrowed', 'Return dates: Mar 10-15'],
			returnDate: '2026-03-10'
		},
		{
			id: 4,
			name: 'Stand Mixer',
			code: 'SM-004',
			category: 'Appliances',
			availability: 'Available',
			condition: 'Excellent',
			quantityAvailable: 3,
			quantityTotal: 5,
			image: '🎛️',
			description: 'Professional stand mixer with multiple attachments',
			borrowedBy: ['Lisa Anderson (3rd Year A)', 'David Lee (2nd Year B)']
		},
		{
			id: 5,
			name: 'Baking Sheet Set',
			code: 'BS-005',
			category: 'Bakeware',
			availability: 'Available',
			condition: 'Good',
			quantityAvailable: 8,
			quantityTotal: 10,
			image: '🍪',
			description: 'Non-stick baking sheet set, 3 pieces',
			borrowedBy: ['Robert Chen (1st Year A)', 'Maria Garcia (2nd Year C)']
		},
		{
			id: 6,
			name: 'Food Processor',
			code: 'FP-006',
			category: 'Appliances',
			availability: 'Maintenance',
			condition: 'Fair',
			quantityAvailable: 0,
			quantityTotal: 3,
			image: '🔧',
			description: 'Multi-function food processor',
			borrowedBy: [],
			maintenanceDate: '2026-03-15'
		}
	];
	
	function getAvailabilityColor(availability: string) {
		switch (availability) {
			case 'Available': return 'bg-green-100 text-green-800';
			case 'Borrowed': return 'bg-yellow-100 text-yellow-800';
			case 'Maintenance': return 'bg-red-100 text-red-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}
	
	function getConditionColor(condition: string) {
		switch (condition) {
			case 'Excellent': return 'bg-blue-100 text-blue-800';
			case 'Good': return 'bg-green-100 text-green-800';
			case 'Fair': return 'bg-yellow-100 text-yellow-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}
	
	function openDetailModal(item: any) {
		selectedItem = item;
		showDetailModal = true;
	}
	
	function closeDetailModal() {
		showDetailModal = false;
		selectedItem = null;
	}
</script>

<svelte:head>
	<title>Equipment Catalog - Instructor Portal</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Equipment Catalog</h1>
				<span class="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
					<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
					</svg>
					Monitoring
				</span>
			</div>
			<p class="mt-1 text-sm text-gray-500">Monitor equipment inventory, usage, and condition</p>
		</div>
		<div class="flex gap-2">
			<button
				onclick={() => viewMode = 'grid'}
				class="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors {viewMode === 'grid' ? 'bg-pink-100 text-pink-700' : 'bg-white text-gray-700 hover:bg-gray-50'} border border-gray-300"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
				</svg>
			</button>
			<button
				onclick={() => viewMode = 'list'}
				class="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors {viewMode === 'list' ? 'bg-pink-100 text-pink-700' : 'bg-white text-gray-700 hover:bg-gray-50'} border border-gray-300"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
				</svg>
			</button>
		</div>
	</div>
	
	<!-- Search and Filters -->
	<div class="rounded-lg bg-white p-4 shadow">
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
			<!-- Search -->
			<div class="lg:col-span-2">
				<label for="search" class="block text-sm font-medium text-gray-700 mb-1">Search</label>
				<div class="relative">
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
						<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
						</svg>
					</div>
					<input
						type="text"
						id="search"
						bind:value={searchQuery}
						placeholder="Search by name, code, or category..."
						class="block w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
					/>
				</div>
			</div>
			
			<!-- Category Filter -->
			<div>
				<label for="category" class="block text-sm font-medium text-gray-700 mb-1">Category</label>
				<select
					id="category"
					bind:value={selectedCategory}
					class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
				>
					{#each categories as category}
						<option value={category.toLowerCase()}>{category}</option>
					{/each}
				</select>
			</div>
			
			<!-- Availability Filter -->
			<div>
				<label for="availability" class="block text-sm font-medium text-gray-700 mb-1">Availability</label>
				<select
					id="availability"
					bind:value={selectedAvailability}
					class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
				>
					{#each availabilityOptions as option}
						<option value={option.toLowerCase()}>{option}</option>
					{/each}
				</select>
			</div>
			
			<!-- Sort By -->
			<div>
				<label for="sort" class="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
				<select
					id="sort"
					bind:value={sortBy}
					class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
				>
					{#each sortOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>
	
	<!-- Results Count -->
	<div class="flex items-center justify-between">
		<p class="text-sm text-gray-700">
			Showing <span class="font-medium">{equipment.length}</span> items
		</p>
		<button class="text-sm font-medium text-pink-600 hover:text-pink-700">
			Clear all filters
		</button>
	</div>
	
	<!-- Equipment Grid View -->
	{#if viewMode === 'grid'}
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each equipment as item}
				<div class="group relative overflow-hidden rounded-lg bg-white shadow transition-all hover:shadow-lg">
					<div class="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center text-6xl">
						{item.image}
					</div>
					<div class="p-4">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<h3 class="text-lg font-semibold text-gray-900">{item.name}</h3>
								<p class="text-sm text-gray-500">{item.code}</p>
							</div>
							<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getAvailabilityColor(item.availability)}">
								{item.availability}
							</span>
						</div>
						<p class="mt-2 text-sm text-gray-600 line-clamp-2">{item.description}</p>
						
						<!-- Availability Info -->
						<div class="mt-3 rounded-lg bg-gray-50 p-3">
							<p class="text-xs font-medium text-gray-700">Current Availability:</p>
							{#if item.availability === 'Available'}
								<p class="mt-1 text-sm font-semibold text-green-600">
									{item.quantityAvailable} available / {item.quantityTotal} total
								</p>
							{:else if item.availability === 'Borrowed'}
								<p class="mt-1 text-sm font-semibold text-yellow-600">
									All units borrowed
								</p>
								{#if item.returnDate}
									<p class="text-xs text-gray-500">Return: {new Date(item.returnDate).toLocaleDateString()}</p>
								{/if}
							{:else if item.availability === 'Maintenance'}
								<p class="mt-1 text-sm font-semibold text-red-600">
									Under maintenance
								</p>
								{#if item.maintenanceDate}
									<p class="text-xs text-gray-500">Available: {new Date(item.maintenanceDate).toLocaleDateString()}</p>
								{/if}
							{/if}
						</div>
						
						<div class="mt-3 flex items-center justify-between">
							<div class="flex gap-2">
								<span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
									{item.category}
								</span>
								<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold {getConditionColor(item.condition)}">
									{item.condition}
								</span>
							</div>
						</div>
						<div class="mt-4">
							<button
								onclick={() => openDetailModal(item)}
								class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500"
							>
								View Details & Usage
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
	
	<!-- Equipment List View -->
	{#if viewMode === 'list'}
		<div class="overflow-hidden rounded-lg bg-white shadow">
			<table class="min-w-full divide-y divide-gray-200">
				<thead class="bg-gray-50">
					<tr>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Code</th>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Category</th>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Availability</th>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Stock</th>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Condition</th>
						<th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-white">
					{#each equipment as item}
						<tr class="hover:bg-gray-50">
							<td class="whitespace-nowrap px-6 py-4">
								<div class="flex items-center">
									<div class="h-10 w-10 flex-shrink-0 text-2xl flex items-center justify-center bg-gray-100 rounded">
										{item.image}
									</div>
									<div class="ml-4">
										<div class="text-sm font-medium text-gray-900">{item.name}</div>
										<div class="text-sm text-gray-500">{item.description}</div>
									</div>
								</div>
							</td>
							<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{item.code}</td>
							<td class="whitespace-nowrap px-6 py-4">
								<span class="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
									{item.category}
								</span>
							</td>
							<td class="whitespace-nowrap px-6 py-4">
								<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getAvailabilityColor(item.availability)}">
									{item.availability}
								</span>
							</td>
							<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
								{item.quantityAvailable} / {item.quantityTotal}
							</td>
							<td class="whitespace-nowrap px-6 py-4">
								<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getConditionColor(item.condition)}">
									{item.condition}
								</span>
							</td>
							<td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
								<button
									onclick={() => openDetailModal(item)}
									class="text-pink-600 hover:text-pink-900"
								>
									View Details
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- Detail Modal -->
{#if showDetailModal && selectedItem}
	<div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
		<!-- Backdrop -->
		<div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onclick={closeDetailModal}></div>
		
		<!-- Modal -->
		<div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
			<div class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl">
				<!-- Header -->
				<div class="border-b border-gray-200 bg-gray-50 px-6 py-4">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="text-lg font-semibold text-gray-900">{selectedItem.name}</h3>
							<p class="mt-1 text-sm text-gray-500">{selectedItem.code}</p>
						</div>
						<button
							onclick={closeDetailModal}
							class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
						>
							<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
							</svg>
						</button>
					</div>
				</div>
				
				<!-- Content -->
				<div class="max-h-[70vh] overflow-y-auto px-6 py-6">
					<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
						<!-- Left Panel -->
						<div class="space-y-6">
							<!-- Item Image -->
							<div class="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center text-8xl rounded-lg">
								{selectedItem.image}
							</div>
							
							<!-- Specifications -->
							<div>
								<h4 class="text-sm font-medium text-gray-700 mb-3">Specifications</h4>
								<div class="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
									<div class="flex justify-between text-sm">
										<span class="text-gray-600">Category:</span>
										<span class="font-medium text-gray-900">{selectedItem.category}</span>
									</div>
									<div class="flex justify-between text-sm">
										<span class="text-gray-600">Condition:</span>
										<span class="font-medium text-gray-900">{selectedItem.condition}</span>
									</div>
									<div class="flex justify-between text-sm">
										<span class="text-gray-600">Total Units:</span>
										<span class="font-medium text-gray-900">{selectedItem.quantityTotal}</span>
									</div>
									<div class="flex justify-between text-sm">
										<span class="text-gray-600">Available:</span>
										<span class="font-medium text-gray-900">{selectedItem.quantityAvailable}</span>
									</div>
								</div>
							</div>
							
							<!-- Description -->
							<div>
								<h4 class="text-sm font-medium text-gray-700 mb-2">Description</h4>
								<p class="text-sm text-gray-600">{selectedItem.description}</p>
							</div>
						</div>
						
						<!-- Right Panel - Instructor Monitoring -->
						<div class="space-y-6">
							<!-- Current Borrowers -->
							<div>
								<h4 class="text-sm font-medium text-gray-700 mb-3">Current Borrowers</h4>
								<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
									{#if selectedItem.borrowedBy.length > 0}
										<ul class="space-y-3">
											{#each selectedItem.borrowedBy as borrower}
												<li class="flex items-start gap-2">
													<div class="flex h-8 w-8 items-center justify-center rounded-full bg-pink-100 text-pink-700 text-xs font-semibold flex-shrink-0">
														{borrower.split(' ').map(n => n[0]).join('')}
													</div>
													<div class="flex-1 min-w-0">
														<p class="text-sm font-medium text-gray-900">{borrower}</p>
														<p class="text-xs text-gray-500">Return due: Mar 15, 2026</p>
													</div>
												</li>
											{/each}
										</ul>
									{:else}
										<p class="text-sm text-gray-500">No students currently borrowing this item</p>
									{/if}
								</div>
							</div>
							
							<!-- Usage Statistics -->
							<div>
								<h4 class="text-sm font-medium text-gray-700 mb-3">Usage Statistics</h4>
								<div class="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
									<div class="flex justify-between items-center">
										<span class="text-sm text-gray-600">Total Requests (30 days)</span>
										<span class="text-sm font-semibold text-gray-900">12</span>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm text-gray-600">Approved</span>
										<span class="text-sm font-semibold text-green-600">10</span>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm text-gray-600">Rejected</span>
										<span class="text-sm font-semibold text-red-600">2</span>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm text-gray-600">Utilization Rate</span>
										<span class="text-sm font-semibold text-blue-600">75%</span>
									</div>
								</div>
							</div>
							
							<!-- Maintenance History -->
							<div>
								<h4 class="text-sm font-medium text-gray-700 mb-3">Maintenance History</h4>
								<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
									<div class="space-y-2">
										<div class="flex items-center gap-2 text-xs">
											<span class="text-green-600">✓</span>
											<span class="text-gray-600">Last inspection: Feb 28, 2026</span>
										</div>
										<div class="flex items-center gap-2 text-xs">
											<span class="text-green-600">✓</span>
											<span class="text-gray-600">Last cleaning: Mar 1, 2026</span>
										</div>
										<div class="flex items-center gap-2 text-xs">
											<span class="text-blue-600">📅</span>
											<span class="text-gray-600">Next maintenance: Mar 30, 2026</span>
										</div>
									</div>
								</div>
							</div>
							
							<!-- Upcoming Returns -->
							<div>
								<h4 class="text-sm font-medium text-gray-700 mb-3">Upcoming Returns</h4>
								<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
									<div class="space-y-2">
										<div class="flex justify-between text-sm">
											<span class="text-gray-600">Today</span>
											<span class="font-medium text-gray-900">0 units</span>
										</div>
										<div class="flex justify-between text-sm">
											<span class="text-gray-600">This Week</span>
											<span class="font-medium text-gray-900">2 units</span>
										</div>
										<div class="flex justify-between text-sm">
											<span class="text-gray-600">Next Week</span>
											<span class="font-medium text-gray-900">1 unit</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
				
				<!-- Footer -->
				<div class="border-t border-gray-200 bg-gray-50 px-6 py-4">
					<div class="flex justify-end gap-3">
						<button
							onclick={closeDetailModal}
							class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>
							Close
						</button>
						<button class="rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700">
							View Related Requests
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
