<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { catalogAPI, type CatalogResponse, type CatalogFilters, type CatalogItem } from '$lib/api/catalog';
	import { subscribeToInventoryChanges } from '$lib/api/inventory';
	import { requestCartCount, requestCartStore, requestCartItems } from '$lib/stores/requestCart';
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
	let sortBy = $state('name');
	let currentPage = $state(1);
	
	// Data State
	let catalogData = $state<CatalogResponse | null>(null);
	let allItems = $derived.by(() => catalogData?.items ?? []);
	let categories = $derived.by(() => catalogData?.categories ?? []);
	
	// Client-side pagination
	const itemsPerPageGrid = 20;
	const itemsPerPageList = 10;
	const itemsPerPage = $derived(viewMode === 'grid' ? itemsPerPageGrid : itemsPerPageList);
	const totalPages = $derived(Math.max(1, Math.ceil(allItems.length / itemsPerPage)));
	const filteredItems = $derived(allItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage));
	const totalItems = $derived(allItems.length);
	
	// UI Constants
	const availabilityOptions = [
		{ value: 'all', label: 'All Statuses' },
		{ value: 'available', label: 'Available' },
		{ value: 'borrowed', label: 'Borrowed' },
		{ value: 'maintenance', label: 'In Maintenance' },
		{ value: 'outofstock', label: 'Out of Stock' }
	];
	
	const sortOptions = [
		{ value: 'name', label: 'Name (A-Z)' },
		{ value: 'category', label: 'Category' },
		{ value: 'availability', label: 'Availability' },
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
				sortBy: (sortBy as any) || 'name',
				page: 1,
				limit: 1000 // Get all items for client-side pagination
			};
			
			catalogData = await catalogAPI.getCatalog(filters, { forceRefresh: options.forceRefresh });
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Failed to load catalog';
			const isUnauthorized = /(^|\s)(unauthorized|401|session expired)(\s|$)/i.test(errorMsg);

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
	async function requestItem(item: CatalogItem): Promise<void> {
		if (item.status === 'Out of Stock') {
			toastStore.error('This item is currently out of stock', 'Cannot Request Item');
			return;
		}

		try {
			const result = await requestCartStore.addItem({
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
		} catch (error) {
			console.error('Failed to add item to cart:', error);
			toastStore.error('Failed to add item to request list. Please try again.', 'Error');
		}
	}


	
	/**
	 * Load catalog on component mount
	 */
	onMount(() => {
		// Initialize cart from database
		requestCartStore.init().catch((error) => {
			console.error('Failed to initialize cart:', error);
		});

		const currentFilters: CatalogFilters = {
			search: searchQuery || undefined,
			category: selectedCategory !== 'all' ? selectedCategory : undefined,
			availability: (selectedAvailability as any) || 'all',
			sortBy: (sortBy as any) || 'name',
			page: 1,
			limit: 1000 // Get all items for client-side pagination
		};

		const cached = catalogAPI.peekCachedCatalog(currentFilters);
		if (cached) {
			catalogData = cached;
			isLoading = false;
			// Load constant items into cart after catalog is loaded
			loadConstantItemsToCart();
			// Revalidate in background to keep data fresh.
			fetchCatalog({ background: true, forceRefresh: true });
		} else {
			fetchCatalog().then(() => {
				// Load constant items into cart after initial fetch
				loadConstantItemsToCart();
			});
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

	/**
	 * Load constant items into the request cart
	 * This ensures constant items are always available in the cart dropdown
	 */
	async function loadConstantItemsToCart(): Promise<void> {
		if (!catalogData) return;

		// Filter constant items from catalog
		const constantItems = catalogData.items.filter(item => item.isConstant === true);

		if (constantItems.length === 0) return;

		// Get current cart items
		const currentCartItems = $requestCartItems;

		// Add constant items that aren't already in the cart
		for (const item of constantItems) {
			const alreadyInCart = currentCartItems.some(cartItem => cartItem.itemId === item.id);

			if (!alreadyInCart) {
				try {
					await requestCartStore.addItem({
						itemId: item.id,
						name: item.name,
						maxQuantity: Math.max(1, item.quantity),
						categoryId: item.categoryId,
						picture: item.picture
					});
				} catch (error) {
					console.error('Failed to add constant item to cart:', error);
				}
			}
		}
	}

	// Real-time inventory updates via SSE
	onMount(() => {
		console.log('[STUDENT-CATALOG-SSE] Setting up inventory SSE subscription');
		const unsub = subscribeToInventoryChanges((event) => {
			console.log('[STUDENT-CATALOG-SSE] ✓ Inventory change received:', event);
			console.log('[STUDENT-CATALOG-SSE] Fetching catalog with forceRefresh=true...');
			fetchCatalog({ background: true, forceRefresh: true }).then(() => {
				console.log('[STUDENT-CATALOG-SSE] Catalog refreshed successfully');
				// Reload constant items after inventory update
				loadConstantItemsToCart();
			}).catch((err) => {
				console.error('[STUDENT-CATALOG-SSE] Failed to refresh catalog:', err);
			});
		}, {
			onConnect: () => console.log('[STUDENT-CATALOG-SSE] ✓ Connected to inventory stream'),
			onError: (err) => console.error('[STUDENT-CATALOG-SSE] ✗ Connection error:', err)
		});
		console.log('[STUDENT-CATALOG-SSE] Subscription created');
		return () => {
			console.log('[STUDENT-CATALOG-SSE] Unsubscribing from inventory stream');
			unsub();
		};
	});
	
	// Reset to page 1 when filters or view mode changes
	$effect(() => {
		searchQuery;
		selectedCategory;
		selectedAvailability;
		sortBy;
		viewMode;
		currentPage = 1;
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
	<div class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
		<div class="fixed inset-0 bg-black/45 backdrop-blur-sm" aria-hidden="true" onclick={closeDetailsModal}></div>
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="catalog-item-details-title"
			aria-describedby="catalog-item-details-description"
			class="relative z-50 w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-5xl sm:rounded-3xl"
		>
			<div class="border-b border-gray-200 px-5 py-4 sm:px-8 sm:py-6">
				<div class="flex items-start justify-between gap-4">
					<div class="flex min-w-0 items-start gap-3 sm:gap-4">
						<div class="mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full border border-pink-100 bg-gray-100 shadow-lg shadow-pink-100 sm:h-12 sm:w-12">
							{#if selectedItem.picture}
								<img src={selectedItem.picture} alt={selectedItem.name} class="h-full w-full object-cover" loading="lazy" />
							{:else}
								<ItemImagePlaceholder size="sm" />
							{/if}
						</div>
						<div class="min-w-0">
							<h2 id="catalog-item-details-title" class="truncate text-xl font-bold text-gray-900 sm:text-2xl">Item Details</h2>
							<p class="mt-1 truncate text-sm font-semibold tracking-wide text-pink-600">CAT-{selectedItem.id.slice(0, 8).toUpperCase()}</p>
							<div class="mt-3 flex flex-wrap items-center gap-2">
								<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {getAvailabilityColor(selectedItem.status)}">{selectedItem.status}</span>
								<span class="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">Qty: {selectedItem.currentCount ?? (selectedItem.quantity + (selectedItem.donations ?? 0))}</span>
							</div>
						</div>
					</div>

					<div class="flex items-center gap-2">
						{#if selectedItem.picture}
							<button
								type="button"
								onclick={openFullImage}
								class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-pink-200 text-pink-600 transition-colors hover:bg-pink-50"
								aria-label="View full image"
								title="View full image"
							>
								<svg class="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
								</svg>
							</button>
						{/if}
						<button
							onclick={closeDetailsModal}
							class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
							aria-label="Close details modal"
							title="Close"
						>
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				</div>
			</div>

			<div class="px-4 py-4 sm:px-8 sm:py-6" id="catalog-item-details-description">
				<div class="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/70 p-3 sm:p-4">
					<div class="relative aspect-21/8 overflow-hidden rounded-xl bg-gray-100">
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
							<div class="flex h-full w-full items-center justify-center">
								<ItemImagePlaceholder size="lg" />
							</div>
						{/if}
						<div class="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 via-black/20 to-transparent p-3">
							<p class="truncate text-sm font-semibold text-white sm:text-base">{selectedItem.name}</p>
							<p class="truncate text-xs text-white/85">{getCategoryName(selectedItem.categoryId)}</p>
						</div>
					</div>
				</div>

				<div class="mt-5 grid grid-cols-2 gap-3">
					<div class="rounded-2xl border border-gray-200 bg-white p-4">
						<p class="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Item Name</p>
						<p class="mt-1.5 wrap-break-word text-sm font-semibold text-gray-900 sm:text-base">{selectedItem.name}</p>
					</div>
					<div class="rounded-2xl border border-gray-200 bg-white p-4">
						<p class="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Category</p>
						<p class="mt-1.5 wrap-break-word text-sm font-semibold text-gray-900 sm:text-base">{getCategoryName(selectedItem.categoryId)}</p>
					</div>
					<div class="rounded-2xl border border-gray-200 bg-white p-4">
						<p class="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Specification</p>
						<p class="mt-1.5 wrap-break-word text-sm font-medium text-gray-900">{selectedItem.specification || 'No specification provided'}</p>
					</div>
				</div>

				<div class="mt-3 rounded-2xl border border-gray-200 bg-white p-4">
					<p class="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Description</p>
					<p class="mt-2 text-sm leading-relaxed text-gray-700">{selectedItem.description || 'No description available.'}</p>
				</div>


			</div>

			<div class="sticky bottom-0 z-10 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-8">
				<div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
					<p class="text-xs text-gray-500">Review details carefully before adding this item to your request list.</p>
					<div class="flex w-full items-center gap-2 sm:w-auto">
						<button
							onclick={closeDetailsModal}
							class="shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
						>
							Close
						</button>
						<button
							onclick={() => selectedItem && requestItem(selectedItem)}
							disabled={selectedItem.status === 'Out of Stock'}
							class="min-w-0 flex-1 rounded-lg bg-pink-600 px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
						>
							{selectedItem.status === 'Out of Stock' ? 'Out of Stock' : 'Add to Request List'}
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if showFullImage && selectedItem?.picture}
	<div class="fixed inset-0 z-60 flex items-center justify-center p-4">
		<div class="fixed inset-0 bg-black/90" aria-hidden="true" onclick={closeFullImage}></div>
		<div class="relative z-61 max-h-[90vh] max-w-[90vw]">
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
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Equipment Catalog</h1>
			<p class="mt-1 text-sm text-gray-500">Browse and request available cooking equipment</p>
		</div>
		<div class="flex items-center gap-2">
			<!-- View Mode Toggle -->
			<div class="flex rounded-lg border border-gray-300 overflow-hidden">
				<button
					onclick={() => (viewMode = 'grid')}
					aria-label="Grid view"
					class="flex items-center px-2.5 py-2 text-sm transition-colors {viewMode === 'grid' ? 'bg-pink-100 text-pink-700' : 'bg-white text-gray-600 hover:bg-gray-50'}"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
					</svg>
				</button>
				<button
					onclick={() => (viewMode = 'list')}
					aria-label="List view"
					class="flex items-center px-2.5 py-2 text-sm transition-colors border-l border-gray-300 {viewMode === 'list' ? 'bg-pink-100 text-pink-700' : 'bg-white text-gray-600 hover:bg-gray-50'}"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
					</svg>
				</button>
			</div>
		</div>
	</div>

	<!-- Search and Filters -->
	<div class="rounded-lg bg-white p-3 shadow sm:p-4">
		<!-- Search — always full width -->
		<div class="relative mb-3">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
				</svg>
			</div>
			<input
				type="text"
				id="search"
				value={searchQuery}
				onchange={(e) => handleSearch((e.target as HTMLInputElement).value)}
				oninput={(e) => handleSearch((e.target as HTMLInputElement).value)}
				placeholder="Search by name, description, or code…"
				class="block w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-pink-500 focus:ring-pink-500"
				aria-label="Search equipment"
				disabled={isLoading}
			/>
		</div>

		<!-- Filters — 2 cols on mobile, 3 on sm+ -->
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
			<select
				id="category"
				value={selectedCategory}
				onchange={(e) => { selectedCategory = (e.target as HTMLSelectElement).value; handleFilterChange(); }}
				class="block w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
				aria-label="Filter by category"
				disabled={isLoading}
			>
				<option value="all">All Categories</option>
				{#each categories as category}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>

			<select
				id="availability"
				value={selectedAvailability}
				onchange={(e) => { selectedAvailability = (e.target as HTMLSelectElement).value; handleFilterChange(); }}
				class="block w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
				aria-label="Filter by availability"
				disabled={isLoading}
			>
				{#each availabilityOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>

			<select
				id="sort"
				value={sortBy}
				onchange={(e) => { sortBy = (e.target as HTMLSelectElement).value; handleFilterChange(); }}
				class="block w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
				aria-label="Sort items"
				disabled={isLoading}
			>
				{#each sortOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Error State -->
	{#if error}
		<div class="rounded-lg bg-red-50 border border-red-200 p-4">
			<div class="flex">
				<div class="shrink-0">
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
				Showing <span class="font-medium">{allItems.length}</span>
				{allItems.length === 1 ? 'item' : 'items'}
			</p>
			{#if searchQuery || selectedCategory !== 'all' || selectedAvailability !== 'all'}
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
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 lg:gap-3">
					{#each Array(8) as _}
						<div class="overflow-hidden rounded-lg bg-white shadow-sm">
							<div class="aspect-4/3 bg-gray-200"></div>
							<div class="p-2 space-y-1.5">
								<div class="h-3 w-full rounded bg-gray-200"></div>
								<div class="h-3 w-3/4 rounded bg-gray-200"></div>
								<div class="flex gap-1 pt-0.5">
									<div class="h-4 w-16 rounded bg-gray-200"></div>
									<div class="h-4 w-12 rounded bg-gray-200"></div>
								</div>
								<div class="flex gap-1 pt-1">
									<div class="h-7 flex-1 rounded-md bg-gray-200"></div>
									<div class="h-7 w-14 rounded-md bg-gray-200"></div>
								</div>
							</div>
						</div>
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
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 lg:gap-3">
			{#each filteredItems as item (item.id)}
				<div class="group flex flex-col overflow-hidden rounded-lg bg-white shadow-sm transition-all hover:shadow-md">

					<!-- Image — 4:3 ratio like Shopee product cards -->
					<div class="relative aspect-4/3 overflow-hidden bg-gray-100">
						{#if item.picture}
							<img
								src={item.picture}
								alt={item.name}
								class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
								loading="lazy"
							/>
						{:else}
							<ItemImagePlaceholder size="lg" />
						{/if}
						<!-- Status badge overlaid on image -->
						<span class="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight {getAvailabilityColor(item.status)}">
							{item.status === 'In Stock' ? 'In Stock' : item.status === 'Out of Stock' ? 'Out' : item.status}
						</span>
					</div>

					<!-- Content -->
					<div class="flex flex-1 flex-col p-2">
						<!-- Name — 2 lines max, never truncates mid-word -->
						<h3 class="line-clamp-2 text-xs font-semibold leading-snug text-gray-900 sm:text-sm">
							{item.name}
						</h3>

						<!-- Category row -->
						<div class="mt-1.5 flex flex-wrap items-center gap-1">
							<span class="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-600">
								{getCategoryName(item.categoryId)}
							</span>
						</div>

						<!-- Qty -->
						<p class="mt-1 text-[10px] text-gray-400">Qty: {item.currentCount ?? (item.quantity + (item.donations ?? 0))}</p>

						<!-- Actions — pushed to bottom -->
						<div class="mt-auto flex gap-1 pt-2">
							<button
								onclick={() => requestItem(item)}
								disabled={item.status === 'Out of Stock'}
								class="flex-1 rounded-md bg-pink-600 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
							>
								Request
							</button>
							<button
								onclick={() => openDetailsModal(item)}
								class="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 sm:text-xs"
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
		<div class="overflow-hidden rounded-lg bg-white shadow divide-y divide-gray-100">
			{#each filteredItems as item (item.id)}
				<div class="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 transition-colors sm:px-4 sm:py-3.5">
					<!-- Thumbnail -->
					<div class="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-gray-100 sm:h-14 sm:w-14">
						{#if item.picture}
							<img src={item.picture} alt={item.name} class="h-full w-full object-cover" loading="lazy" />
						{:else}
							<ItemImagePlaceholder size="sm" />
						{/if}
					</div>

					<!-- Info -->
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-semibold text-gray-900">{item.name}</p>
						<p class="truncate text-xs text-gray-500">{item.specification || getCategoryName(item.categoryId)}</p>
						<div class="mt-1 flex flex-wrap items-center gap-1">
							<span class="rounded px-1.5 py-0.5 text-[10px] font-semibold {getAvailabilityColor(item.status)}">{item.status}</span>
							<span class="text-[10px] text-gray-400">Qty: {item.currentCount ?? (item.quantity + (item.donations ?? 0))}</span>
						</div>
					</div>

					<!-- Actions -->
					<div class="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
						<button
							onclick={() => requestItem(item)}
							disabled={item.status === 'Out of Stock'}
							class="rounded-md bg-pink-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
						>
							Request
						</button>
						<button
							onclick={() => openDetailsModal(item)}
							class="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 sm:text-xs"
						>
							Details
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Empty State -->
	{#if !isLoading && allItems.length === 0}
		<div class="rounded-lg bg-gray-50 border border-gray-200 p-8 text-center sm:p-12">
			<svg class="mx-auto h-10 w-10 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
			</svg>
			<h3 class="mt-3 text-sm font-medium text-gray-900">No items found</h3>
			<p class="mt-1 text-xs text-gray-500">Try adjusting your filters or search terms.</p>
			<div class="mt-4">
				<button
					onclick={clearFilters}
					class="inline-flex items-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700"
				>
					Clear filters
				</button>
			</div>
		</div>
	{/if}

	<!-- Pagination -->
	{#if !isLoading && allItems.length > itemsPerPage}
		<div class="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-6">
			<div class="text-sm text-gray-500">
				Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, allItems.length)} of {allItems.length} items
			</div>
			<nav class="flex items-center gap-1" aria-label="Pagination">
				<button
					onclick={() => goToPage(currentPage - 1)}
					disabled={currentPage === 1}
					class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-sm text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
					aria-label="Previous page"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
					</svg>
				</button>

				{#each Array.from({ length: totalPages }, (_, i) => i + 1) as page}
					{#if totalPages <= 7 || page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1}
						<button
							onclick={() => goToPage(page)}
							class="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors {currentPage === page ? 'bg-pink-600 text-white shadow-sm' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
							aria-label="Page {page}"
							aria-current={currentPage === page ? 'page' : undefined}
						>
							{page}
						</button>
					{:else if (page === currentPage - 2 || page === currentPage + 2) && totalPages > 7}
						<span class="inline-flex h-8 w-8 items-center justify-center text-sm text-gray-400">…</span>
					{/if}
				{/each}

				<button
					onclick={() => goToPage(currentPage + 1)}
					disabled={currentPage === totalPages}
					class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-sm text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
					aria-label="Next page"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
					</svg>
				</button>
			</nav>
		</div>
	{/if}
</div>
