<script lang="ts">
	// Equipment Catalog page
	let viewMode = $state<'grid' | 'list'>('grid');
	let searchQuery = $state('');
	let selectedCategory = $state('all');
	let selectedAvailability = $state('all');
	let selectedCondition = $state('all');
	let sortBy = $state('name');
	
	// Placeholder data - will be replaced with real API calls
	const categories = ['All', 'Cookware', 'Utensils', 'Appliances', 'Bakeware', 'Measuring Tools'];
	const availabilityOptions = ['All', 'Available', 'Borrowed', 'Maintenance'];
	const conditionOptions = ['All', 'Excellent', 'Good', 'Fair'];
	const sortOptions = [
		{ value: 'name', label: 'Name' },
		{ value: 'category', label: 'Category' },
		{ value: 'availability', label: 'Availability' }
	];
	
	const equipment = [
		{
			id: 1,
			name: 'Chef Knife Set',
			code: 'CK-001',
			category: 'Utensils',
			availability: 'Available',
			condition: 'Excellent',
			quantity: 5,
			image: '🔪',
			description: 'Professional chef knife set with 8 pieces'
		},
		{
			id: 2,
			name: 'Mixing Bowl Large',
			code: 'MB-002',
			category: 'Cookware',
			availability: 'Available',
			condition: 'Good',
			quantity: 12,
			image: '🥣',
			description: 'Stainless steel mixing bowl, 5L capacity'
		},
		{
			id: 3,
			name: 'Digital Scale',
			code: 'DS-003',
			category: 'Measuring Tools',
			availability: 'Borrowed',
			condition: 'Excellent',
			quantity: 0,
			image: '⚖️',
			description: 'Digital kitchen scale, 5kg capacity'
		},
		{
			id: 4,
			name: 'Stand Mixer',
			code: 'SM-004',
			category: 'Appliances',
			availability: 'Available',
			condition: 'Excellent',
			quantity: 3,
			image: '🎛️',
			description: 'Professional stand mixer with multiple attachments'
		},
		{
			id: 5,
			name: 'Baking Sheet Set',
			code: 'BS-005',
			category: 'Bakeware',
			availability: 'Available',
			condition: 'Good',
			quantity: 8,
			image: '🍪',
			description: 'Non-stick baking sheet set, 3 pieces'
		},
		{
			id: 6,
			name: 'Food Processor',
			code: 'FP-006',
			category: 'Appliances',
			availability: 'Maintenance',
			condition: 'Fair',
			quantity: 0,
			image: '🔧',
			description: 'Multi-function food processor'
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
</script>

<svelte:head>
	<title>Equipment Catalog - Student Portal</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Equipment Catalog</h1>
			<p class="mt-1 text-sm text-gray-500">Browse and search available lab equipment</p>
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
						placeholder="Search by name, description, or code..."
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
						<div class="mt-3 flex items-center justify-between">
							<div class="flex gap-2">
								<span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
									{item.category}
								</span>
								<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold {getConditionColor(item.condition)}">
									{item.condition}
								</span>
							</div>
							<span class="text-sm font-medium text-gray-700">Qty: {item.quantity}</span>
						</div>
						<div class="mt-4 flex gap-2">
							<button class="flex-1 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 disabled:opacity-50 disabled:cursor-not-allowed" disabled={item.availability !== 'Available'}>
								Request Item
							</button>
							<button class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500">
								Details
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
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Condition</th>
						<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Qty</th>
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
							<td class="whitespace-nowrap px-6 py-4">
								<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getConditionColor(item.condition)}">
									{item.condition}
								</span>
							</td>
							<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{item.quantity}</td>
							<td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
								<button class="text-pink-600 hover:text-pink-900 mr-3" disabled={item.availability !== 'Available'}>Request</button>
								<button class="text-gray-600 hover:text-gray-900">Details</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
