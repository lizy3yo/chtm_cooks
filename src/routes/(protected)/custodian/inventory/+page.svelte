<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	
	type Tab = 'all-items' | 'categories' | 'low-stock' | 'add-item';
	
	let activeTab = $state<Tab>('all-items');
	
	// Sample data - will be replaced with real API calls
	let items = $state([
		{ id: 1, name: 'Chef Knife Set', category: 'Utensils', quantity: 15, minStock: 5, condition: 'Good' },
		{ id: 2, name: 'Mixing Bowl Large', category: 'Cookware', quantity: 8, minStock: 10, condition: 'Good' },
		{ id: 3, name: 'Digital Scale', category: 'Appliances', quantity: 3, minStock: 5, condition: 'Good' },
		{ id: 4, name: 'Cutting Board', category: 'Utensils', quantity: 20, minStock: 8, condition: 'Fair' }
	]);
	
	let categories = $state([
		{ id: 1, name: 'Cookware', itemCount: 45, color: 'bg-blue-100 text-blue-800' },
		{ id: 2, name: 'Utensils', itemCount: 78, color: 'bg-green-100 text-green-800' },
		{ id: 3, name: 'Appliances', itemCount: 23, color: 'bg-purple-100 text-purple-800' },
		{ id: 4, name: 'Tools', itemCount: 34, color: 'bg-orange-100 text-orange-800' }
	]);
	
	// Form state for adding new item
	let newItem = $state({
		name: '',
		category: '',
		quantity: 0,
		minStock: 0,
		location: '',
		description: ''
	});
	
	const lowStockItems = $derived(items.filter(item => item.quantity <= item.minStock));
	
	function switchTab(tab: Tab) {
		activeTab = tab;
	}
	
	function handleAddItem(e: Event) {
		e.preventDefault();
		// Here you would call your API to add the item
		console.log('Adding item:', newItem);
		// Reset form
		newItem = { name: '', category: '', quantity: 0, minStock: 0, location: '', description: '' };
		switchTab('all-items');
	}
</script>

<svelte:head>
	<title>Inventory Management - CHTM Cooks</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Inventory Management</h1>
			<p class="mt-1 text-sm text-gray-500">Manage kitchen laboratory inventory and stock levels</p>
		</div>
		<button 
			onclick={() => switchTab('add-item')}
			class="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
		>
			<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
			</svg>
			Add New Item
		</button>
	</div>
	
	<!-- Stats Overview -->
	<div class="grid grid-cols-1 gap-5 sm:grid-cols-4">
		<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
			<dt class="truncate text-sm font-medium text-gray-500">Total Items</dt>
			<dd class="mt-1 text-3xl font-semibold text-gray-900">{items.length}</dd>
		</div>
		<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
			<dt class="truncate text-sm font-medium text-gray-500">Categories</dt>
			<dd class="mt-1 text-3xl font-semibold text-gray-900">{categories.length}</dd>
		</div>
		<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
			<dt class="truncate text-sm font-medium text-gray-500">Low Stock</dt>
			<dd class="mt-1 text-3xl font-semibold text-red-600">{lowStockItems.length}</dd>
		</div>
		<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
			<dt class="truncate text-sm font-medium text-gray-500">Total Quantity</dt>
			<dd class="mt-1 text-3xl font-semibold text-gray-900">{items.reduce((sum, item) => sum + item.quantity, 0)}</dd>
		</div>
	</div>
	
	<!-- Tabs Navigation -->
	<div class="border-b border-gray-200 bg-white shadow-sm">
		<nav class="-mb-px flex overflow-x-auto" aria-label="Tabs">
			<button
				onclick={() => switchTab('all-items')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'all-items'
					? 'border-emerald-500 text-emerald-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
					</svg>
					All Items
					<span class="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{items.length}</span>
				</div>
			</button>
			
			<button
				onclick={() => switchTab('categories')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'categories'
					? 'border-emerald-500 text-emerald-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
					</svg>
					Categories
					<span class="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{categories.length}</span>
				</div>
			</button>
			
			<button
				onclick={() => switchTab('low-stock')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'low-stock'
					? 'border-emerald-500 text-emerald-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
					</svg>
					Low Stock
					<span class="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">{lowStockItems.length}</span>
				</div>
			</button>
			
			<button
				onclick={() => switchTab('add-item')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'add-item'
					? 'border-emerald-500 text-emerald-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
					</svg>
					Add New Item
				</div>
			</button>
		</nav>
	</div>
	
	<!-- Tab Content -->
	<div class="rounded-lg bg-white shadow">
		{#if activeTab === 'all-items'}
			<!-- All Items View -->
			<div class="p-6">
				<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div class="relative flex-1">
						<input
							type="text"
							placeholder="Search items..."
							class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
						/>
						<svg class="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
						</svg>
					</div>
					<select class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500">
						<option value="">All Categories</option>
						{#each categories as category}
							<option value={category.name}>{category.name}</option>
						{/each}
					</select>
				</div>
				
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item Name</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Category</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Quantity</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Min Stock</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Condition</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
								<th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each items as item}
								<tr class="hover:bg-gray-50">
									<td class="whitespace-nowrap px-6 py-4">
										<div class="text-sm font-medium text-gray-900">{item.name}</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<span class="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
											{item.category}
										</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{item.quantity}</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{item.minStock}</td>
									<td class="whitespace-nowrap px-6 py-4">
										<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {item.condition === 'Good' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
											{item.condition}
										</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										{#if item.quantity <= item.minStock}
											<span class="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
												<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
													<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
												</svg>
												Low Stock
											</span>
										{:else}
											<span class="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
												<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
													<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
												</svg>
												In Stock
											</span>
										{/if}
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
										<button class="text-emerald-600 hover:text-emerald-900 mr-3">Edit</button>
										<button class="text-red-600 hover:text-red-900">Delete</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
			
		{:else if activeTab === 'categories'}
			<!-- Categories View -->
			<div class="p-6">
				<div class="mb-6 flex justify-between items-center">
					<h3 class="text-lg font-semibold text-gray-900">Item Categories</h3>
					<button class="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
						<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
						</svg>
						Add Category
					</button>
				</div>
				
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each categories as category}
						<div class="rounded-lg border-2 border-gray-200 p-6 transition-all hover:border-emerald-500 hover:shadow-md">
							<div class="flex items-center justify-between">
								<div class="flex-1">
									<h4 class="text-lg font-semibold text-gray-900">{category.name}</h4>
									<p class="mt-1 text-sm text-gray-500">{category.itemCount} items</p>
								</div>
								<div class="ml-4">
									<span class="inline-flex h-12 w-12 items-center justify-center rounded-full {category.color}">
										<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
										</svg>
									</span>
								</div>
							</div>
							<div class="mt-4 flex gap-2">
								<button class="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
									Edit
								</button>
								<button class="flex-1 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
									Delete
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
			
		{:else if activeTab === 'low-stock'}
			<!-- Low Stock View -->
			<div class="p-6">
				<div class="mb-6">
					<h3 class="text-lg font-semibold text-gray-900">Low Stock Alerts</h3>
					<p class="mt-1 text-sm text-gray-500">Items that need restocking</p>
				</div>
				
				{#if lowStockItems.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">All items are adequately stocked</h3>
						<p class="mt-2 text-sm text-gray-500">No items require immediate restocking.</p>
					</div>
				{:else}
					<div class="space-y-4">
						{#each lowStockItems as item}
							<div class="rounded-lg border-2 border-red-200 bg-red-50 p-4">
								<div class="flex items-center justify-between">
									<div class="flex items-center space-x-4">
										<div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
											<svg class="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
											</svg>
										</div>
										<div>
											<h4 class="font-semibold text-gray-900">{item.name}</h4>
											<p class="text-sm text-gray-600">Category: {item.category}</p>
										</div>
									</div>
									<div class="text-right">
										<div class="text-sm text-gray-600">Current: <span class="font-semibold text-red-600">{item.quantity}</span></div>
										<div class="text-sm text-gray-600">Min Required: <span class="font-semibold">{item.minStock}</span></div>
									</div>
									<button class="ml-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
										Restock
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			
		{:else if activeTab === 'add-item'}
			<!-- Add New Item Form -->
			<div class="p-6">
				<div class="mb-6">
					<h3 class="text-lg font-semibold text-gray-900">Add New Item</h3>
					<p class="mt-1 text-sm text-gray-500">Enter details for the new inventory item</p>
				</div>
				
				<form onsubmit={handleAddItem} class="space-y-6">
					<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
						<div>
							<label for="itemName" class="block text-sm font-medium text-gray-700">Item Name *</label>
							<input
								type="text"
								id="itemName"
								bind:value={newItem.name}
								required
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
								placeholder="e.g., Chef Knife Set"
							/>
						</div>
						
						<div>
							<label for="category" class="block text-sm font-medium text-gray-700">Category *</label>
							<select
								id="category"
								bind:value={newItem.category}
								required
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
							>
								<option value="">Select a category</option>
								{#each categories as category}
									<option value={category.name}>{category.name}</option>
								{/each}
							</select>
						</div>
						
						<div>
							<label for="quantity" class="block text-sm font-medium text-gray-700">Quantity *</label>
							<input
								type="number"
								id="quantity"
								bind:value={newItem.quantity}
								required
								min="0"
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
								placeholder="0"
							/>
						</div>
						
						<div>
							<label for="minStock" class="block text-sm font-medium text-gray-700">Minimum Stock Level *</label>
							<input
								type="number"
								id="minStock"
								bind:value={newItem.minStock}
								required
								min="0"
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
								placeholder="0"
							/>
						</div>
						
						<div>
							<label for="location" class="block text-sm font-medium text-gray-700">Storage Location</label>
							<input
								type="text"
								id="location"
								bind:value={newItem.location}
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
								placeholder="e.g., Cabinet A, Shelf 2"
							/>
						</div>
						
						<div>
							<label for="description" class="block text-sm font-medium text-gray-700">Description</label>
							<input
								type="text"
								id="description"
								bind:value={newItem.description}
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
								placeholder="Brief description"
							/>
						</div>
					</div>
					
					<div class="flex gap-3 border-t border-gray-200 pt-6">
						<button
							type="submit"
							class="inline-flex items-center rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
						>
							<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
							</svg>
							Add Item
						</button>
						<button
							type="button"
							onclick={() => switchTab('all-items')}
							class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		{/if}
	</div>
</div>
