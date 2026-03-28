<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { catalogAPI, type CatalogResponse, type CatalogFilters, type CatalogItem } from '$lib/api/catalog';
	import { subscribeToInventoryChanges } from '$lib/api/inventory';
	import { requestCartCount, requestCartStore } from '$lib/stores/requestCart';
	import { toastStore } from '$lib/stores/toast';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	
	// UI State Management
	let viewMode = $state<'grid' | 'list'>('grid');
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedItem = $state<CatalogItem | null>(null);
	let showFullImage = $state(false);
	let hasShownUnauthorizedToast = $state(false);
	
	// Filter State
	let searchQuery = $state('');
	let selectedCategory = $state('all');
	let selectedAvailability = $state('all');
	let selectedCondition = $state('all');
	let sortBy = $state('name');
	let currentPage = $state(1);
	const itemsPerPage = 50;
	
	// Data State
	let catalogData = $state<CatalogResponse | null>(null);
	let filteredItems = $derived.by(() => catalogData?.items ?? []);
	let categories = $derived.by(() => catalogData?.categories ?? []);
	let totalItems = $derived.by(() => catalogData?.total ?? 0);
	let totalPages = $derived.by(() => catalogData?.pages ?? 0);
	
	// UI Constants
	const availabilityOptions = [
		{ value: 'all', label: 'All Statuses' },
		{ value: 'available', label: 'Available' },
		{ value: 'borrowed', label: 'Borrowed' },
		{ value: 'maintenance', label: 'In Maintenance' },
		{ value: 'outofstock', label: 'Out of Stock' }
	];
	
	const conditionOptions = [
		{ value: 'all', label: 'All Conditions' },
		{ value: 'Excellent', label: 'Excellent' },
		{ value: 'Good', label: 'Good' },
		{ value: 'Fair', label: 'Fair' },
		{ value: 'Poor', label: 'Poor' },
		{ value: 'Damaged', label: 'Damaged' }
	];
	
	const sortOptions = [
		{ value: 'name', label: 'Name (A-Z)' },
		{ value: 'category', label: 'Category' },
		{ value: 'availability', label: 'Availability' },
		{ value: 'condition', label: 'Condition' },
		{ value: 'recent', label: 'Recently Added' },
		{ value: 'updated', label: 'Recently Updated' }
	];
	
	/**
	 * Get color utility classes based on availability status
	 */
	function getAvailabilityColor(status: string): string {
		switch (status) {
			case 'In Stock':
				return 'bg-green-100 text-green-800';
			case 'Available':
				return 'bg-blue-100 text-blue-800';
			case 'Low Stock':
				return 'bg-yellow-100 text-yellow-800';
			case 'Out of Stock':
				return 'bg-red-100 text-red-800';
			case 'Maintenance':
				return 'bg-orange-100 text-orange-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}
	
	/**
	 * Get color utility classes based on condition
	 */
	function getConditionColor(condition: string): string {
		switch (condition) {
			case 'Excellent':
				return 'bg-blue-100 text-blue-800';
			case 'Good':
				return 'bg-green-100 text-green-800';
			case 'Fair':
				return 'bg-yellow-100 text-yellow-800';
			case 'Poor':
				return 'bg-orange-100 text-orange-800';
			case 'Damaged':
				return 'bg-red-100 text-red-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}
	
	/**
	 * Get category name by ID
	 */
	function getCategoryName(categoryId: string | undefined): string {
		if (!categoryId) return 'Uncategorized';
		const cat = categories.find((c) => c.id === categoryId);
		return cat?.name ?? 'Uncategorized';
	}
	
	/**
	 * Fetch catalog data from API with current filters
	 */
	async function fetchCatalog(options: { background?: boolean; forceRefresh?: boolean } = {}): Promise<void> {
		const background = options.background === true;
		try {
			if (!background) {
				isLoading = true;
			}
			error = null;
			
			const filters: CatalogFilters = {
				search: searchQuery || undefined,
				category: selectedCategory !== 'all' ? selectedCategory : undefined,
				availability: (selectedAvailability as any) || 'all',
				condition: (selectedCondition as any) || 'all',
				sortBy: (sortBy as any) || 'name',
				page: currentPage,
				limit: itemsPerPage
			};
			
			catalogData = await catalogAPI.getCatalog(filters, { forceRefresh: options.forceRefresh });
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Failed to load catalog';
			const isUnauthorized = /(^|\s)(unauthorized|401)(\s|$)/i.test(errorMsg);

			if (isUnauthorized) {
				if (!hasShownUnauthorizedToast) {
					hasShownUnauthorizedToast = true;
					toastStore.error('Your session has expired. Please sign in again.', 'Authentication Required', 4500);
				}
				error = null;
				await goto('/auth/login');
				return;
			}

			if (!background) {
				error = errorMsg;
			}
			console.error('Catalog fetch error:', err);

			if (!background) {
				toastStore.error(`Error loading catalog: ${errorMsg}`, 'Catalog Error');
			}
		} finally {
			if (!background) {
				isLoading = false;
			}
		}
	}
	
	/**
	 * Clear all filters and reset to default state
	 */
	function clearFilters(): void {
		searchQuery = '';
		selectedCategory = 'all';
		selectedAvailability = 'all';
		selectedCondition = 'all';
		sortBy = 'name';
		currentPage = 1;
		error = null;
		toastStore.info('Filters cleared', 'Catalog Filters');
	}
	
	/**
	 * Handle page navigation
	 */
	function goToPage(pageNum: number): void {
		if (pageNum >= 1 && pageNum <= totalPages) {
			currentPage = pageNum;
		}
	}
	
	/**
	 * Handle search input (debounced)
	 */
	let searchTimeout: ReturnType<typeof setTimeout>;
	function handleSearch(query: string): void {
		searchQuery = query;
		currentPage = 1;
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			fetchCatalog();
		}, 300);
	}
	
	/**
	 * Handle filter changes
	 */
	function handleFilterChange(): void {
		currentPage = 1;
		fetchCatalog();
	}

	/**
	 * Open details modal for the selected item
	 */
	function openDetailsModal(item: CatalogItem): void {
		selectedItem = item;
	}

	/**
	 * Close details modal
	 */
	function closeDetailsModal(): void {
		showFullImage = false;
		selectedItem = null;
	}

	/**
	 * Open full image lightbox from details modal image
	 */
	function openFullImage(): void {
		if (selectedItem?.picture) {
			showFullImage = true;
		}
	}

	/**
	 * Close full image lightbox
	 */
	function closeFullImage(): void {
		showFullImage = false;
	}

	/**
	 * Add item to request cart (shop-style behavior without redirect).
	 */
	function requestItem(item: CatalogItem): void {
		if (item.status === 'Out of Stock') {
			toastStore.error('This item is currently out of stock', 'Cannot Request Item');
			return;
		}

		const result = requestCartStore.addItem({
			itemId: item.id,
			name: item.name,
			maxQuantity: item.quantity,
			categoryId: item.categoryId,
			picture: item.picture
		});

		if (result === 'added') {
			toastStore.success(`${item.name} was added to your request list.`, 'Item Added');
			return;
		}

		if (result === 'incremented') {
			toastStore.success(`${item.name} quantity updated in your request list.`, 'Request List Updated');
			return;
		}

		toastStore.info(`${item.name} is already at max available quantity in your request list.`, 'Max Quantity Reached');
	}
	
	/**
	 * Load catalog on component mount
	 */
	onMount(() => {
		const currentFilters: CatalogFilters = {
			search: searchQuery || undefined,
			category: selectedCategory !== 'all' ? selectedCategory : undefined,
			availability: (selectedAvailability as any) || 'all',
			condition: (selectedCondition as any) || 'all',
			sortBy: (sortBy as any) || 'name',
			page: currentPage,
			limit: itemsPerPage
		};

		const cached = catalogAPI.peekCachedCatalog(currentFilters);
		if (cached) {
			catalogData = cached;
			isLoading = false;
			// Revalidate in background to keep data fresh.
			fetchCatalog({ background: true, forceRefresh: true });
		} else {
			fetchCatalog();
		}
		
		// Set up refresh timer for periodic cache refresh (optional)
		const refreshInterval = setInterval(() => {
			// Refresh in background without showing loading state
			fetchCatalog({
				background: true,
				forceRefresh: true
			}).catch((err) => {
				console.warn('Background catalog refresh failed:', err);
			});
		}, 5 * 60 * 1000); // Refresh every 5 minutes
		
		return () => {
			clearInterval(refreshInterval);
			clearTimeout(searchTimeout);
		};
	});

	// Real-time inventory updates via SSE
	onMount(() => {
		const unsub = subscribeToInventoryChanges(() => {
			fetchCatalog({ background: true, forceRefresh: true });
		});
		return () => unsub();
	});
	
	$effect(() => {
		// Re-fetch when filters change
		if (!isLoading && (searchQuery || selectedCategory || selectedAvailability || selectedCondition || sortBy)) {
			// This will be handled by handleFilterChange and handleSearch
		}
	});
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && showFullImage) {
			closeFullImage();
			return;
		}
		if (event.key === 'Escape' && selectedItem) {
			closeDetailsModal();
		}
	}}
/>

<svelte:head>
	<title>Equipment Catalog - Student Portal</title>
	<meta name="description" content="Browse and request available cooking equipment and utensils." />
</svelte:head>

{#if selectedItem}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div class="fixed inset-0 bg-black/40" aria-hidden="true" onclick={closeDetailsModal}></div>
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="catalog-item-details-title"
			class="relative z-50 w-full max-w-4xl rounded-lg bg-white shadow-xl"
		>
			<div class="flex items-start justify-between border-b border-gray-200 px-6 py-4">
				<h2 id="catalog-item-details-title" class="text-lg font-semibold text-gray-900">{selectedItem.name}</h2>
				<button
					onclick={closeDetailsModal}
					class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
					aria-label="Close details modal"
					title="Close"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="grid grid-cols-1 gap-6 px-6 py-5 sm:grid-cols-3">
				<div class="sm:col-span-1">
					<div class="aspect-square overflow-hidden rounded-lg bg-gray-100">
						{#if selectedItem.picture}
							<button
								type="button"
								onclick={openFullImage}
								class="h-full w-full cursor-zoom-in"
								title="View full image"
							>
								<img src={selectedItem.picture} alt={selectedItem.name} class="h-full w-full object-cover" loading="lazy" />
							</button>
						{:else}
							<ItemImagePlaceholder size="lg" />
						{/if}
					</div>
				</div>

				<div class="space-y-4 sm:col-span-2">
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<p class="text-xs font-medium uppercase tracking-wide text-gray-500">Category</p>
							<p class="mt-1 text-sm font-medium text-gray-900">{getCategoryName(selectedItem.categoryId)}</p>
						</div>
						<div>
							<p class="text-xs font-medium uppercase tracking-wide text-gray-500">Status</p>
							<span class="mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold {getAvailabilityColor(selectedItem.status)}">
								{selectedItem.status}
							</span>
						</div>
						<div>
							<p class="text-xs font-medium uppercase tracking-wide text-gray-500">Condition</p>
							<span class="mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold {getConditionColor(selectedItem.condition)}">
								{selectedItem.condition}
							</span>
						</div>
						<div>
							<p class="text-xs font-medium uppercase tracking-wide text-gray-500">Quantity</p>
							<p class="mt-1 text-sm font-medium text-gray-900">{selectedItem.quantity}</p>
						</div>
						<div>
							<p class="text-xs font-medium uppercase tracking-wide text-gray-500">Specification</p>
							<p class="mt-1 text-sm text-gray-900">{selectedItem.specification || 'No specification provided'}</p>
						</div>
						<div>
							<p class="text-xs font-medium uppercase tracking-wide text-gray-500">Location</p>
							<p class="mt-1 text-sm text-gray-900">{selectedItem.location || 'Not specified'}</p>
						</div>
					</div>

					<div>
						<p class="text-xs font-medium uppercase tracking-wide text-gray-500">Description</p>
						<p class="mt-1 text-sm text-gray-700">{selectedItem.description || 'No description available'}</p>
					</div>
				</div>
			</div>

			<div class="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
				<button
					onclick={() => selectedItem && requestItem(selectedItem)}
					class="rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500"
				>
					Request Item
				</button>
			</div>
		</div>
	</div>
{/if}

{#if showFullImage && selectedItem?.picture}
	<div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
		<div class="fixed inset-0 bg-black/90" aria-hidden="true" onclick={closeFullImage}></div>
		<div class="relative z-[61] max-h-[90vh] max-w-[90vw]">
			<button
				type="button"
				onclick={closeFullImage}
				class="absolute -top-12 right-0 rounded-md p-2 text-white transition-colors hover:bg-white/10"
				aria-label="Close full image"
				title="Close"
			>
				<svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
			<img src={selectedItem.picture} alt={selectedItem.name} class="max-h-[90vh] max-w-full rounded-lg shadow-2xl" />
		</div>
	</div>
{/if}

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Equipment Catalog</h1>
			<p class="mt-1 text-sm text-gray-500">Browse and request available cooking equipment from our inventory</p>
		</div>
		<div class="flex gap-2">
			<button
				onclick={() => goto('/student/request')}
				class="inline-flex items-center rounded-lg border border-pink-300 bg-pink-50 px-3 py-2 text-sm font-medium text-pink-700 hover:bg-pink-100"
			>
				Request List
				<span class="ml-2 rounded-full bg-pink-600 px-2 py-0.5 text-xs font-semibold text-white">{$requestCartCount}</span>
			</button>
			<button
				onclick={() => (viewMode = 'grid')}
				aria-label="Switch to grid view"
				title="Grid view"
				class="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors {viewMode === 'grid'
					? 'bg-pink-100 text-pink-700'
					: 'bg-white text-gray-700 hover:bg-gray-50'} border border-gray-300"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
				</svg>
			</button>
			<button
				onclick={() => (viewMode = 'list')}
				aria-label="Switch to list view"
				title="List view"
				class="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors {viewMode === 'list'
					? 'bg-pink-100 text-pink-700'
					: 'bg-white text-gray-700 hover:bg-gray-50'} border border-gray-300"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
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
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
						</svg>
					</div>
					<input
						type="text"
						id="search"
						value={searchQuery}
						onchange={(e) => handleSearch((e.target as HTMLInputElement).value)}
						oninput={(e) => handleSearch((e.target as HTMLInputElement).value)}
						placeholder="Search by name, description, or code..."
						class="block w-full rounded-lg border border-gray-300 pl-10 pr-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
						aria-label="Search equipment"
						disabled={isLoading}
					/>
				</div>
			</div>

			<!-- Category Filter -->
			<div>
				<label for="category" class="block text-sm font-medium text-gray-700 mb-1">Category</label>
				<select
					id="category"
					value={selectedCategory}
					onchange={(e) => {
						selectedCategory = (e.target as HTMLSelectElement).value;
						handleFilterChange();
					}}
					class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
					aria-label="Filter by category"
					disabled={isLoading}
				>
					<option value="all">All Categories</option>
					{#each categories as category}
						<option value={category.id}>{category.name}</option>
					{/each}
				</select>
			</div>

			<!-- Availability Filter -->
			<div>
				<label for="availability" class="block text-sm font-medium text-gray-700 mb-1">Availability</label>
				<select
					id="availability"
					value={selectedAvailability}
					onchange={(e) => {
						selectedAvailability = (e.target as HTMLSelectElement).value;
						handleFilterChange();
					}}
					class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
					aria-label="Filter by availability"
					disabled={isLoading}
				>
					{#each availabilityOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>

			<!-- Condition Filter -->
			<div>
				<label for="condition" class="block text-sm font-medium text-gray-700 mb-1">Condition</label>
				<select
					id="condition"
					value={selectedCondition}
					onchange={(e) => {
						selectedCondition = (e.target as HTMLSelectElement).value;
						handleFilterChange();
					}}
					class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
					aria-label="Filter by condition"
					disabled={isLoading}
				>
					{#each conditionOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>

			<!-- Sort By -->
			<div>
				<label for="sort" class="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
				<select
					id="sort"
					value={sortBy}
					onchange={(e) => {
						sortBy = (e.target as HTMLSelectElement).value;
						handleFilterChange();
					}}
					class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
					aria-label="Sort items"
					disabled={isLoading}
				>
					{#each sortOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	<!-- Error State -->
	{#if error}
		<div class="rounded-lg bg-red-50 border border-red-200 p-4">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
				<div class="ml-3">
					<h3 class="text-sm font-medium text-red-800">Error Loading Catalog</h3>
					<p class="mt-1 text-sm text-red-700">{error}</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Results Info and Clear Filters -->
	{#if !isLoading}
		<div class="flex items-center justify-between">
			<p class="text-sm text-gray-700">
				Showing <span class="font-medium">{filteredItems.length}</span>
				{filteredItems.length === 1 ? 'item' : 'items'}
				{totalItems > filteredItems.length ? `of ${totalItems}` : ''}
			</p>
			{#if searchQuery || selectedCategory !== 'all' || selectedAvailability !== 'all' || selectedCondition !== 'all'}
				<button
					onclick={clearFilters}
					class="text-sm font-medium text-pink-600 hover:text-pink-700 transition-colors"
					title="Reset all filters"
				>
					Clear all filters
				</button>
			{/if}
		</div>
	{/if}

	<!-- Loading State -->
	{#if isLoading}
		<div class="animate-pulse">
			{#if viewMode === 'grid'}
				<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{#each Array(6) as _}
						<div class="rounded-lg bg-gray-200 h-80"></div>
					{/each}
				</div>
			{:else}
				<div class="space-y-2">
					{#each Array(5) as _}
						<div class="rounded-lg bg-gray-200 h-16"></div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Equipment Grid View -->
	{#if !isLoading && viewMode === 'grid' && filteredItems.length > 0}
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each filteredItems as item (item.id)}
				<div class="group relative overflow-hidden rounded-lg bg-white shadow transition-all hover:shadow-lg">
					<!-- Image Section -->
					<div class="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
						{#if item.picture}
							<img
								src={item.picture}
								alt={item.name}
								class="w-full h-full object-cover"
								loading="lazy"
							/>
						{:else}
							<ItemImagePlaceholder size="xl" />
						{/if}
					</div>

					<!-- Content Section -->
					<div class="p-4">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<h3 class="text-lg font-semibold text-gray-900">{item.name}</h3>
								<p class="text-sm text-gray-500">{item.specification || 'No specification'}</p>
							</div>
							<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getAvailabilityColor(item.status)}">
								{item.status}
							</span>
						</div>

						<p class="mt-2 text-sm text-gray-600 line-clamp-2">{item.description || 'No description available'}</p>

						<div class="mt-3 flex items-center justify-between">
							<div class="flex gap-2 flex-wrap">
								<span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
									{getCategoryName(item.categoryId)}
								</span>
								<span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold {getConditionColor(item.condition)}">
									{item.condition}
								</span>
							</div>
							<span class="text-sm font-medium text-gray-700">Q: {item.quantity}</span>
						</div>

						<!-- Additional Info -->
						{#if item.location}
							<p class="mt-2 text-xs text-gray-500">📍 {item.location}</p>
						{/if}

						<!-- Actions -->
						<div class="mt-4 flex gap-2">
							<button
								onclick={() => requestItem(item)}
								class="flex-1 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
								disabled={item.status === 'Out of Stock'}
								title={item.status === 'Out of Stock' ? 'Item is out of stock' : 'Request this item'}
							>
								Request Item
							</button>
							<button
								onclick={() => openDetailsModal(item)}
								class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 transition-colors"
								title="View item details"
							>
								Details
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Equipment List View -->
	{#if !isLoading && viewMode === 'list' && filteredItems.length > 0}
		<div class="overflow-hidden rounded-lg bg-white shadow">
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Category</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Condition</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Qty</th>
							<th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each filteredItems as item (item.id)}
							<tr class="hover:bg-gray-50 transition-colors">
								<td class="whitespace-nowrap px-6 py-4">
									<div class="flex items-center">
										<div class="h-10 w-10 flex-shrink-0 text-2xl flex items-center justify-center bg-gray-100 rounded">
											{#if item.picture}
												<img src={item.picture} alt="" class="w-full h-full object-cover rounded" />
											{:else}
												<ItemImagePlaceholder size="sm" />
											{/if}
										</div>
										<div class="ml-4">
											<div class="text-sm font-medium text-gray-900">{item.name}</div>
											<div class="text-xs text-gray-500">{item.specification || 'N/A'}</div>
										</div>
									</div>
								</td>
								<td class="whitespace-nowrap px-6 py-4">
									<span class="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
										{getCategoryName(item.categoryId)}
									</span>
								</td>
								<td class="whitespace-nowrap px-6 py-4">
									<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getAvailabilityColor(item.status)}">
										{item.status}
									</span>
								</td>
								<td class="whitespace-nowrap px-6 py-4">
									<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getConditionColor(item.condition)}">
										{item.condition}
									</span>
								</td>
								<td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{item.quantity}</td>
								<td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
									<button
										onclick={() => requestItem(item)}
										class="text-pink-600 hover:text-pink-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mr-3"
										disabled={item.status === 'Out of Stock'}
										title={item.status === 'Out of Stock' ? 'Item is out of stock' : 'Request this item'}
									>
										Request
									</button>
									<button
										onclick={() => openDetailsModal(item)}
										class="text-gray-600 hover:text-gray-900 transition-colors"
										title="View details"
									>
										Details
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Empty State -->
	{#if !isLoading && filteredItems.length === 0}
		<div class="rounded-lg bg-gray-50 border border-gray-200 p-12 text-center">
			<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
			</svg>
			<h3 class="mt-4 text-lg font-medium text-gray-900">No items found</h3>
			<p class="mt-1 text-sm text-gray-500">Try adjusting your filters or search terms to find what you're looking for.</p>
			<div class="mt-6">
				<button
					onclick={clearFilters}
					class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500"
				>
					Clear all filters
				</button>
			</div>
		</div>
	{/if}

	<!-- Pagination -->
	{#if !isLoading && totalPages > 1}
		<div class="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-lg">
			<div class="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
				<div>
					<p class="text-sm text-gray-700">
						Page <span class="font-medium">{currentPage}</span>
						of
						<span class="font-medium">{totalPages}</span>
					</p>
				</div>
				<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
					<button
						onclick={() => goToPage(currentPage - 1)}
						disabled={currentPage === 1}
						class="relative inline-flex items-center px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Previous page"
					>
						<span class="sr-only">Previous</span>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
						</svg>
					</button>

					{#each Array(totalPages) as _, i}
						{#if Math.abs(i + 1 - currentPage) <= 1 || i + 1 === 1 || i + 1 === totalPages}
							<button
								onclick={() => goToPage(i + 1)}
								class={`relative inline-flex items-center px-4 py-2 text-sm font-medium ring-1 ring-inset ring-gray-300 transition-colors ${
									i + 1 === currentPage
										? 'z-10 bg-pink-600 text-white ring-pink-600'
										: 'bg-white text-gray-900 hover:bg-gray-50'
								}`}
								aria-label={`Go to page ${i + 1}`}
								aria-current={i + 1 === currentPage ? 'page' : undefined}
							>
								{i + 1}
							</button>
						{:else if Math.abs(i + 1 - currentPage) === 2}
							<span class="relative inline-flex items-center px-4 py-2 text-gray-500">...</span>
						{/if}
					{/each}

					<button
						onclick={() => goToPage(currentPage + 1)}
						disabled={currentPage === totalPages}
						class="relative inline-flex items-center px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Next page"
					>
						<span class="sr-only">Next</span>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					</button>
				</nav>
			</div>
		</div>
	{/if}
</div>
