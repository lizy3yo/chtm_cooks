<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		catalogAPI,
		type CatalogResponse,
		type CatalogFilters,
		type CatalogItem
	} from '$lib/api/catalog';
	import { subscribeToInventoryChanges } from '$lib/api/inventory';
	import { requestCartCount, requestCartStore, requestCartItems } from '$lib/stores/requestCart';
	import { toastStore } from '$lib/stores/toast';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	import CatalogItemModal from '$lib/components/ui/CatalogItemModal.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import { ClipboardList } from 'lucide-svelte';

	// UI State Management
	let viewMode = $state<'grid' | 'list'>('grid');
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedItem = $state<CatalogItem | null>(null);
	const selectedItemRequestEntry = $derived.by(() => {
		const itemId = selectedItem?.id;
		if (!itemId) return null;
		return $requestCartItems.find((entry) => entry.itemId === itemId) ?? null;
	});
	let hasShownUnauthorizedToast = $state(false);

	// Filter State
	let searchQuery = $state('');
	let selectedCategory = $state('all');
	let selectedAvailability = $state('all');
	let sortBy = $state('name');
	let currentPage = $state(1);

	// Data State & Progressive Loading Controls
	let catalogData = $state<CatalogResponse | null>(null);
	let allItems = $derived.by(() => {
		if (!catalogData) return [];
		const items = [...catalogData.items];
		const total = catalogData.total;
		while (items.length < total) {
			items.push({
				id: 'placeholder-' + items.length,
				isPlaceholder: true,
				name: '',
				category: '',
				status: 'Available',
				quantity: 0
			} as any);
		}
		return items;
	});
	let categories = $derived.by(() => catalogData?.categories ?? []);

	let inFlightLoadId = 0;
	const progressivePageSize = 20;

	// Client-side pagination
	const itemsPerPageGrid = 20;
	const itemsPerPageList = 10;
	const itemsPerPage = $derived(viewMode === 'grid' ? itemsPerPageGrid : itemsPerPageList);
	const totalPages = $derived(Math.max(1, Math.ceil(allItems.length / itemsPerPage)));
	const filteredItems = $derived(
		allItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
	);
	const totalItems = $derived(allItems.length);

	// UI requireds
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

	/** Solid opaque colors for badges rendered over images */
	function getOverlayStatusColor(status: string): string {
		switch (status) {
			case 'In Stock':
				return 'bg-emerald-600 text-white';
			case 'Available':
				return 'bg-blue-600 text-white';
			case 'Low Stock':
				return 'bg-amber-500 text-white';
			case 'Out of Stock':
				return 'bg-red-600 text-white';
			case 'Maintenance':
				return 'bg-orange-500 text-white';
			default:
				return 'bg-gray-700 text-white';
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
	 * Fetch catalog data from API with current filters using progressive offloading and Promise.allSettled
	 */
	async function fetchCatalog(
		options: { background?: boolean; forceRefresh?: boolean } = {}
	): Promise<void> {
		const background = options.background === true;
		const loadId = ++inFlightLoadId;

		try {
			if (!background) {
				isLoading = true;
			}
			error = null;

			const baseFilters: CatalogFilters = {
				search: searchQuery || undefined,
				category: selectedCategory !== 'all' ? selectedCategory : undefined,
				availability: (selectedAvailability as any) || 'all',
				sortBy: (sortBy as any) || 'name',
				limit: progressivePageSize
			};

			// Step 1: Fetch first page
			const firstPageRes = await catalogAPI.getCatalog(
				{ ...baseFilters, page: 1 },
				{ forceRefresh: options.forceRefresh }
			);

			if (loadId !== inFlightLoadId) return;
			catalogData = firstPageRes;

			if (!background) {
				isLoading = false;
			}

			// Load required items into cart as soon as page 1 resolves
			loadrequiredItemsToCart();

			// Step 2: Fetch remaining pages concurrently using Promise.allSettled
			const totalPagesCount = firstPageRes.pages;
			if (totalPagesCount > 1) {
				const remainingPromises = [];
				for (let p = 2; p <= totalPagesCount; p++) {
					const pageNum = p;
					const promise = catalogAPI
						.getCatalog({ ...baseFilters, page: pageNum }, { forceRefresh: options.forceRefresh })
						.then((nextRes) => {
							if (loadId === inFlightLoadId && nextRes && nextRes.items && catalogData) {
								const existingIds = new Set(catalogData.items.map((i) => i.id));
								const newItems = nextRes.items.filter((i) => !existingIds.has(i.id));
								catalogData.items = [...catalogData.items, ...newItems];
								loadrequiredItemsToCart();
							}
							return nextRes;
						});
					remainingPromises.push(promise);
				}
				await Promise.allSettled(remainingPromises);
			}
		} catch (err) {
			if (loadId !== inFlightLoadId) return;
			const errorMsg = err instanceof Error ? err.message : 'Failed to load catalog';
			const isUnauthorized = /(^|\s)(unauthorized|401|session expired)(\s|$)/i.test(errorMsg);

			if (isUnauthorized) {
				if (!hasShownUnauthorizedToast) {
					hasShownUnauthorizedToast = true;
					toastStore.error(
						'Your session has expired. Please sign in again.',
						'Authentication Required',
						4500
					);
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
			if (loadId === inFlightLoadId && !background) {
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
		selectedItem = null;
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
				maxQuantity: availableQuantityForItem(item),
				categoryId: item.categoryId,
				picture: item.picture
			});

			if (result === 'added') {
				toastStore.success(`${item.name} was added to your request list.`, 'Item Added');
				return;
			}

			if (result === 'incremented') {
				toastStore.success(
					`${item.name} quantity updated in your request list.`,
					'Request List Updated'
				);
				return;
			}

			toastStore.info(
				`${item.name} is already at max available quantity in your request list.`,
				'Max Quantity Reached'
			);
		} catch (error) {
			console.error('Failed to add item to cart:', error);
			toastStore.error('Failed to add item to request list. Please try again.', 'Error');
		}
	}

	async function updateSelectedItemQuantity(
		quantity: number,
		element?: HTMLInputElement
	): Promise<void> {
		if (!selectedItem || !selectedItemRequestEntry) return;

		const maxQty = selectedItemRequestEntry.maxQuantity;
		let finalQty = quantity;
		if (isNaN(finalQty) || finalQty < 1) {
			finalQty = 1;
		} else if (finalQty > maxQty) {
			finalQty = maxQty;
		}

		if (element) {
			element.value = String(finalQty);
		}

		try {
			await requestCartStore.setQuantity(selectedItem.id, finalQty);
		} catch (error) {
			console.error('Failed to update request quantity:', error);
			toastStore.error('Unable to update the request quantity. Please try again.', 'Error');
		}
	}

	// Helper: find cart entry for an item
	function cartEntryFor(itemId: string) {
		return $requestCartItems.find((i) => i.itemId === itemId);
	}

	function availableQuantityForItem(item: CatalogItem): number {
		return item.currentCount ?? item.quantity + (item.donations ?? 0);
	}

	function displayedQuantityForItem(item: CatalogItem): number {
		return availableQuantityForItem(item);
	}

	async function incrementItem(item: CatalogItem) {
		const entry = cartEntryFor(item.id);
		if (!entry) {
			await requestItem(item);
			return;
		}
		if (entry.quantity >= maxQuantityForItem(item)) {
			toastStore.info(
				`${item.name} is already at max available quantity in your request list.`,
				'Max Quantity Reached'
			);
			return;
		}
		try {
			await requestCartStore.setQuantity(item.id, entry.quantity + 1);
		} catch (err) {
			console.error('Failed to increment quantity', err);
			toastStore.error('Unable to update quantity', 'Error');
		}
	}

	async function decrementItem(item: CatalogItem) {
		const entry = cartEntryFor(item.id);
		if (!entry) return;
		try {
			if (entry.quantity <= 1) {
				await requestCartStore.removeItem(item.id);
			} else {
				await requestCartStore.setQuantity(item.id, entry.quantity - 1);
			}
		} catch (err) {
			console.error('Failed to decrement quantity', err);
			toastStore.error('Unable to update quantity', 'Error');
		}
	}

	function maxQuantityForItem(item: CatalogItem): number {
		const availableQuantity = availableQuantityForItem(item);
		return item.maxQuantityPerRequest
			? Math.min(item.maxQuantityPerRequest, availableQuantity)
			: availableQuantity;
	}

	async function removeItemFromRequest(item: CatalogItem): Promise<void> {
		if (!cartEntryFor(item.id)) return;
	}

	async function handleQuantityInput(
		item: CatalogItem,
		valueStr: string,
		element?: HTMLInputElement
	) {
		let quantity = parseInt(valueStr, 10);
		const maxQty = maxQuantityForItem(item);

		if (isNaN(quantity) || quantity < 1) {
			quantity = 1;
		} else if (quantity > maxQty) {
			quantity = maxQty;
			toastStore.info(`Clamped to maximum available quantity of ${maxQty}.`, 'Quantity Adjusted');
		}

		if (element) {
			element.value = String(quantity);
		}

		try {
			await requestCartStore.setQuantity(item.id, quantity);
		} catch (err) {
			console.error('Failed to update quantity', err);
			toastStore.error('Unable to update quantity', 'Error');
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
			limit: progressivePageSize
		};

		const cached = catalogAPI.peekCachedCatalog(currentFilters);
		if (cached) {
			catalogData = cached;
			isLoading = false;
			// Load required items into cart after catalog is loaded
			loadrequiredItemsToCart();
			// Revalidate in background to keep data fresh.
			fetchCatalog({ background: true, forceRefresh: true });
		} else {
			fetchCatalog();
		}

		// Set up refresh timer for periodic cache refresh (optional)
		const refreshInterval = setInterval(
			() => {
				// Refresh in background without showing loading state
				fetchCatalog({
					background: true,
					forceRefresh: true
				}).catch((err) => {
					console.warn('Background catalog refresh failed:', err);
				});
			},
			5 * 60 * 1000
		); // Refresh every 5 minutes

		return () => {
			clearInterval(refreshInterval);
			clearTimeout(searchTimeout);
		};
	});

	/**
	 * Load required items into the request cart
	 * This ensures required items are always available in the cart dropdown
	 */
	async function loadrequiredItemsToCart(): Promise<void> {
		if (!catalogData) return;

		// Filter required items from catalog
		const requiredItems = catalogData.items.filter((item) => item.isrequired === true);

		if (requiredItems.length === 0) return;

		// Get current cart items
		const currentCartItems = $requestCartItems;

		// Add required items that aren't already in the cart
		for (const item of requiredItems) {
			const alreadyInCart = currentCartItems.some((cartItem) => cartItem.itemId === item.id);

			if (!alreadyInCart) {
				try {
					await requestCartStore.addItem({
						itemId: item.id,
						name: item.name,
						maxQuantity: availableQuantityForItem(item),
						categoryId: item.categoryId,
						picture: item.picture
					});
				} catch (error) {
					console.error('Failed to add required item to cart:', error);
				}
			}
		}
	}

	// Real-time inventory updates via SSE
	onMount(() => {
		console.log('[STUDENT-CATALOG-SSE] Setting up inventory SSE subscription');
		const unsub = subscribeToInventoryChanges(
			(event) => {
				console.log('[STUDENT-CATALOG-SSE] ✓ Inventory change received:', event);
				console.log('[STUDENT-CATALOG-SSE] Fetching catalog with forceRefresh=true...');
				fetchCatalog({ background: true, forceRefresh: true })
					.then(() => {
						console.log('[STUDENT-CATALOG-SSE] Catalog refreshed successfully');
						// Reload required items after inventory update
						loadrequiredItemsToCart();
					})
					.catch((err) => {
						console.error('[STUDENT-CATALOG-SSE] Failed to refresh catalog:', err);
					});
			},
			{
				onConnect: () => console.log('[STUDENT-CATALOG-SSE] ✓ Connected to inventory stream'),
				onError: (err) => console.error('[STUDENT-CATALOG-SSE] ✗ Connection error:', err)
			}
		);
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
	<CatalogItemModal
		item={selectedItem}
		{categories}
		onClose={closeDetailsModal}
		hideInventoryFields={true}
		footerHint="Review details carefully before adding this item to your request list."
	>
		{#snippet footerAction()}
			{#if selectedItemRequestEntry}
				<div class="flex min-w-0 flex-1 items-center justify-center gap-2 sm:flex-none">
					{#if !selectedItem?.isrequired}
						<button
							type="button"
							onclick={() => selectedItem && removeItemFromRequest(selectedItem)}
							class="inline-flex h-10 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 transition-colors hover:border-red-300 hover:bg-red-100"
							aria-label="Remove from request list"
							title="Remove from request list"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2.2"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
							Remove
						</button>
					{/if}

					<div
						class="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm"
					>
						<button
							type="button"
							onclick={() =>
								updateSelectedItemQuantity(Math.max(1, selectedItemRequestEntry.quantity - 1))}
							disabled={selectedItemRequestEntry.quantity <= 1}
							class="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-all hover:border-pink-500 hover:bg-pink-50 hover:text-pink-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:bg-white disabled:hover:text-gray-700"
							aria-label="Decrease requested quantity"
							title="Decrease quantity"
						>
							<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2.5"
									d="M20 12H4"
								/>
							</svg>
						</button>

						<div class="relative">
							<input
								type="number"
								min="1"
								max={selectedItemRequestEntry.maxQuantity}
								value={selectedItemRequestEntry.quantity}
								onchange={(e) =>
									updateSelectedItemQuantity(
										parseInt((e.target as HTMLInputElement).value, 10) || 1,
										e.target as HTMLInputElement
									)}
								class="w-14 rounded-md border {selectedItem?.isrequired
									? 'border-emerald-300 bg-emerald-50 text-emerald-900'
									: 'border-gray-300 bg-white text-gray-900'} px-1.5 py-1 text-center text-sm font-bold focus:border-pink-500 focus:ring-1 focus:ring-pink-500/20"
								title="Enter desired quantity"
							/>
						</div>

						<button
							type="button"
							onclick={() =>
								updateSelectedItemQuantity(
									Math.min(
										selectedItemRequestEntry.maxQuantity,
										selectedItemRequestEntry.quantity + 1
									)
								)}
							disabled={selectedItemRequestEntry.quantity >= selectedItemRequestEntry.maxQuantity}
							class="flex h-8 w-8 items-center justify-center rounded-md bg-pink-600 text-white transition-all hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
							aria-label="Increase requested quantity"
							title="Increase quantity"
						>
							<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2.5"
									d="M12 4v16m8-8H4"
								/>
							</svg>
						</button>
					</div>
				</div>
			{:else}
				<button
					type="button"
					onclick={() => selectedItem && requestItem(selectedItem)}
					disabled={selectedItem!.status === 'Out of Stock'}
					class="min-w-0 flex-1 rounded-lg bg-pink-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
				>
					{selectedItem!.status === 'Out of Stock' ? 'Out of Stock' : 'Add to Request List'}
				</button>
			{/if}
		{/snippet}
	</CatalogItemModal>
{/if}

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Equipment Catalog</h1>
			<p class="mt-1 text-sm text-gray-500">Browse and request available cooking equipment</p>
		</div>
		<div class="flex items-center gap-2">
			<a
				href="/student/request"
				class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-pink-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-pink-700 sm:px-4 sm:text-sm"
				aria-label="Go to request equipment"
				title="Go to request equipment"
			>
				<ClipboardList size={13} />
				Request Equipment
			</a>

			<!-- View Mode Toggle -->
			<div class="flex overflow-hidden rounded-lg border border-gray-300">
				<button
					onclick={() => (viewMode = 'grid')}
					aria-label="Grid view"
					class="flex items-center px-2.5 py-2 text-sm transition-colors {viewMode === 'grid'
						? 'bg-pink-100 text-pink-700'
						: 'bg-white text-gray-600 hover:bg-gray-50'}"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
						/>
					</svg>
				</button>
				<button
					onclick={() => (viewMode = 'list')}
					aria-label="List view"
					class="flex items-center border-l border-gray-300 px-2.5 py-2 text-sm transition-colors {viewMode ===
					'list'
						? 'bg-pink-100 text-pink-700'
						: 'bg-white text-gray-600 hover:bg-gray-50'}"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 6h16M4 12h16M4 18h16"
						/>
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
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
			</div>
			<input
				type="text"
				id="search"
				value={searchQuery}
				onchange={(e) => handleSearch((e.target as HTMLInputElement).value)}
				oninput={(e) => handleSearch((e.target as HTMLInputElement).value)}
				placeholder="Search by name, description, or code…"
				class="block w-full rounded-lg border border-gray-300 py-2 pr-3 pl-9 text-sm focus:border-pink-500 focus:ring-pink-500"
				aria-label="Search equipment"
				disabled={isLoading}
			/>
		</div>

		<!-- Filters — 2 cols on mobile, 3 on sm+ -->
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
			<select
				id="category"
				value={selectedCategory}
				onchange={(e) => {
					selectedCategory = (e.target as HTMLSelectElement).value;
					handleFilterChange();
				}}
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
				onchange={(e) => {
					selectedAvailability = (e.target as HTMLSelectElement).value;
					handleFilterChange();
				}}
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
				onchange={(e) => {
					sortBy = (e.target as HTMLSelectElement).value;
					handleFilterChange();
				}}
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
		<div class="rounded-lg border border-red-200 bg-red-50 p-4">
			<div class="flex">
				<div class="shrink-0">
					<svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
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
					class="text-sm font-medium text-pink-600 transition-colors hover:text-pink-700"
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
							<div class="space-y-1.5 p-2">
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
						<div class="h-16 rounded-lg bg-gray-200"></div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Equipment Grid View -->
	{#if !isLoading && viewMode === 'grid' && filteredItems.length > 0}
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 lg:gap-3">
			{#each filteredItems as item (item.id)}
				{#if item.isPlaceholder}
					<div class="animate-pulse overflow-hidden rounded-lg bg-white shadow-sm">
						<div class="aspect-4/3 bg-gray-200"></div>
						<div class="space-y-1.5 p-2">
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
				{:else}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="group flex cursor-pointer flex-col overflow-hidden rounded-lg bg-white shadow-sm transition-all hover:shadow-md"
						onclick={() => openDetailsModal(item)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && openDetailsModal(item)}
						aria-label="View details for {item.name}"
					>
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
							<!-- required badge — top left -->
							{#if item.isrequired}
								<span
									class="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-full bg-purple-600 px-1.5 py-0.5 text-[10px] leading-tight font-bold text-white shadow-sm"
								>
									<svg class="h-2 w-2 shrink-0" fill="currentColor" viewBox="0 0 20 20"
										><path
											d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
										/></svg
									>
									REQUIRED
								</span>
							{/if}
							<!-- Status badge — top right -->
							<span
								class="absolute top-1.5 right-1.5 rounded-full px-1.5 py-0.5 text-[10px] leading-tight font-semibold shadow-sm {getOverlayStatusColor(
									item.status
								)}"
							>
								{item.status === 'In Stock'
									? 'In Stock'
									: item.status === 'Out of Stock'
										? 'Out'
										: item.status}
							</span>
						</div>

						<!-- Content -->
						<div class="flex flex-1 flex-col p-2">
							<!-- Name — 2 lines max, never truncates mid-word -->
							<h3 class="line-clamp-2 text-xs leading-snug font-semibold text-gray-900 sm:text-sm">
								{item.name}
							</h3>

							<!-- Category row -->
							<div class="mt-1.5 flex flex-wrap items-center gap-1">
								<span
									class="inline-flex items-center gap-1 rounded bg-pink-100 px-2 py-0.5 text-xs font-semibold text-pink-800 dark:bg-pink-600 dark:text-white"
								>
									{getCategoryName(item.categoryId)}
								</span>
							</div>

							{#if item.specification}
								<p
									class="mt-1 line-clamp-2 text-sm leading-tight wrap-break-word text-gray-800"
									title={item.specification}
									aria-label="Specification"
								>
									{item.specification}
								</p>
							{/if}

							<!-- Qty -->
							<p class="mt-1 text-[10px] text-gray-600">Qty: {displayedQuantityForItem(item)}</p>

							<!-- Actions — stop propagation so they don't open the modal -->
							<div class="mt-auto flex items-center justify-center gap-1 pt-2">
								{#if cartEntryFor(item.id)}
									{@const entryQuantity = cartEntryFor(item.id)?.quantity ?? 0}
									{#if !item.isrequired}
										<button
											onclick={(e) => {
												e.stopPropagation();
												removeItemFromRequest(item);
											}}
											title="Remove from request list"
											class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition-all hover:border-red-300 hover:bg-red-100 hover:text-red-700"
											aria-label="Remove from request list"
										>
											<svg
												class="h-3.5 w-3.5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2.2"
													d="M6 18L18 6M6 6l12 12"
												/>
											</svg>
										</button>
									{/if}

									<button
										onclick={(e) => {
											e.stopPropagation();
											decrementItem(item);
										}}
										title="Decrease quantity"
										class="rounded-md bg-gray-100 px-3 py-1.5 text-[13px] font-semibold text-gray-800 hover:bg-gray-200"
									>
										−
									</button>

									<div class="relative" onclick={(e) => e.stopPropagation()} role="none">
										<input
											type="number"
											min="1"
											max={maxQuantityForItem(item)}
											value={cartEntryFor(item.id)?.quantity ?? 1}
											onchange={(e) =>
												handleQuantityInput(
													item,
													(e.target as HTMLInputElement).value,
													e.target as HTMLInputElement
												)}
											class="w-12 rounded-md border {item.isrequired
												? 'border-emerald-300 bg-emerald-50 text-emerald-900'
												: 'border-gray-300 bg-white text-gray-900'} px-1 py-1 text-center text-xs font-bold focus:border-pink-500 focus:ring-1 focus:ring-pink-500/20"
											title="Enter desired quantity"
										/>
									</div>

									<button
										onclick={(e) => {
											e.stopPropagation();
											incrementItem(item);
										}}
										disabled={entryQuantity >= maxQuantityForItem(item)}
										title="Increase quantity"
										class="rounded-md bg-pink-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-40"
									>
										+
									</button>
								{:else}
									<button
										onclick={(e) => {
											e.stopPropagation();
											requestItem(item);
										}}
										disabled={item.status === 'Out of Stock'}
										class="flex-1 rounded-md bg-pink-600 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
									>
										Request
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Equipment List View -->
	{#if !isLoading && viewMode === 'list' && filteredItems.length > 0}
		<div class="divide-y divide-gray-100 overflow-hidden rounded-lg bg-white shadow">
			{#each filteredItems as item, i (item.id)}
				{#if item.isPlaceholder}
					<div class="flex animate-pulse items-center gap-3 px-3 py-3 sm:px-4 sm:py-3.5">
						<span class="hidden h-5 w-5 shrink-0 rounded-full bg-gray-200 sm:inline-flex"></span>
						<div class="h-12 w-12 shrink-0 rounded-md bg-gray-200 sm:h-14 sm:w-14"></div>
						<div class="min-w-0 flex-1 space-y-2">
							<div class="h-4 w-1/3 rounded bg-gray-200"></div>
							<div class="h-3 w-1/2 rounded bg-gray-200"></div>
							<div class="flex gap-2">
								<div class="h-4 w-14 rounded bg-gray-200"></div>
								<div class="h-4 w-10 rounded bg-gray-200"></div>
							</div>
						</div>
						<div class="h-8 w-20 rounded bg-gray-200"></div>
					</div>
				{:else}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors hover:bg-gray-50 sm:px-4 sm:py-3.5"
						onclick={() => openDetailsModal(item)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && openDetailsModal(item)}
						aria-label="View details for {item.name}"
					>
						<!-- Row number -->
						<span
							class="hidden h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 sm:inline-flex"
							>{(currentPage - 1) * itemsPerPage + i + 1}</span
						>

						<!-- Thumbnail -->
						<div class="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-gray-100 sm:h-14 sm:w-14">
							{#if item.picture}
								<img
									src={item.picture}
									alt={item.name}
									class="h-full w-full object-cover"
									loading="lazy"
								/>
							{:else}
								<ItemImagePlaceholder size="md" />
							{/if}
						</div>

						<!-- Info -->
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold text-gray-900">{item.name}</p>
							<p
								class="truncate text-sm text-gray-800"
								title={item.specification || getCategoryName(item.categoryId)}
							>
								{item.specification || getCategoryName(item.categoryId)}
							</p>
							<div class="mt-1 flex flex-wrap items-center gap-1">
								{#if item.isrequired}
									<span
										class="inline-flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-800 ring-1 ring-purple-200"
									>
										<svg class="h-2 w-2 shrink-0" fill="currentColor" viewBox="0 0 20 20"
											><path
												d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
											/></svg
										>
										REQUIRED
									</span>
								{/if}
								<span
									class="rounded px-1.5 py-0.5 text-[10px] font-semibold {getAvailabilityColor(
										item.status
									)}">{item.status}</span
								>
								<span class="text-[10px] text-gray-600">Qty: {displayedQuantityForItem(item)}</span>
							</div>
						</div>

						<!-- Actions — stop propagation so they don't open the modal -->
						<div
							class="flex shrink-0 flex-col justify-center gap-1.5 sm:flex-row sm:items-center sm:gap-2"
						>
							{#if cartEntryFor(item.id)}
								{@const entryQuantity = cartEntryFor(item.id)?.quantity ?? 0}
								<div class="inline-flex items-center gap-2">
									{#if !item.isrequired}
										<button
											onclick={(e) => {
												e.stopPropagation();
												removeItemFromRequest(item);
											}}
											class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition-all hover:border-red-300 hover:bg-red-100 hover:text-red-700"
											aria-label="Remove from request list"
											title="Remove from request list"
										>
											<svg
												class="h-3.5 w-3.5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2.2"
													d="M6 18L18 6M6 6l12 12"
												/>
											</svg>
										</button>
									{/if}

									<button
										onclick={(e) => {
											e.stopPropagation();
											decrementItem(item);
										}}
										class="rounded-md bg-gray-100 px-2 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-200"
									>
										−
									</button>
									<div class="relative" onclick={(e) => e.stopPropagation()} role="none">
										<input
											type="number"
											min="1"
											max={maxQuantityForItem(item)}
											value={cartEntryFor(item.id)?.quantity ?? 1}
											onchange={(e) =>
												handleQuantityInput(
													item,
													(e.target as HTMLInputElement).value,
													e.target as HTMLInputElement
												)}
											class="w-12 rounded-md border {item.isrequired
												? 'border-emerald-300 bg-emerald-50 text-emerald-900'
												: 'border-gray-300 bg-white text-gray-900'} px-1 py-1 text-center text-xs font-bold focus:border-pink-500 focus:ring-1 focus:ring-pink-500/20"
											title="Enter desired quantity"
										/>
									</div>
									<button
										onclick={(e) => {
											e.stopPropagation();
											incrementItem(item);
										}}
										disabled={entryQuantity >= maxQuantityForItem(item)}
										class="rounded-md bg-pink-600 px-2 py-1 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-40"
									>
										+
									</button>
								</div>
							{:else}
								<button
									onclick={(e) => {
										e.stopPropagation();
										requestItem(item);
									}}
									disabled={item.status === 'Out of Stock'}
									class="rounded-md bg-pink-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
								>
									Request
								</button>
							{/if}
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Empty State -->
	{#if !isLoading && allItems.length === 0}
		<div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center sm:p-12">
			<svg
				class="mx-auto h-10 w-10 text-pink-600"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
				/>
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
		<Pagination
			{currentPage}
			{totalPages}
			totalItems={allItems.length}
			{itemsPerPage}
			onPageChange={goToPage}
		/>
	{/if}
</div>
