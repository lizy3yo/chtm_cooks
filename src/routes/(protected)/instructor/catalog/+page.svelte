<script lang="ts">
	import { onMount } from 'svelte';
	import { catalogAPI, type CatalogResponse, type CatalogFilters, type CatalogItem } from '$lib/api/catalog';
	import { subscribeToInventoryChanges } from '$lib/api/inventory';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';

	// UI State
	let viewMode = $state<'grid' | 'list'>('grid');
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedItem = $state<CatalogItem | null>(null);
	let showFullImage = $state(false);

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
	let selectedItemStockHealth = $derived.by(() => {
		if (!selectedItem || selectedItem.minStock == null || selectedItem.minStock <= 0) {
			return null;
		}

		return getStockHealth(selectedItem.quantity, selectedItem.minStock);
	});

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

	function getAvailabilityColor(status: string): string {
		switch (status) {
			case 'In Stock': return 'bg-green-100 text-green-800';
			case 'Available': return 'bg-blue-100 text-blue-800';
			case 'Low Stock': return 'bg-yellow-100 text-yellow-800';
			case 'Out of Stock': return 'bg-red-100 text-red-800';
			case 'Maintenance': return 'bg-orange-100 text-orange-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	function getConditionColor(condition: string): string {
		switch (condition) {
			case 'Excellent': return 'bg-blue-100 text-blue-800';
			case 'Good': return 'bg-green-100 text-green-800';
			case 'Fair': return 'bg-yellow-100 text-yellow-800';
			case 'Poor': return 'bg-orange-100 text-orange-800';
			case 'Damaged': return 'bg-red-100 text-red-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	function getCategoryName(categoryId: string | undefined): string {
		if (!categoryId) return 'Uncategorized';
		const cat = categories.find((c) => c.id === categoryId);
		return cat?.name ?? 'Uncategorized';
	}

	function getStockHealth(quantity: number, minStock: number): {
		pct: number;
		barColor: string;
		label: string;
		labelColor: string;
	} {
		const stockRatio = quantity / minStock;
		return {
			pct: Math.min(Math.round((quantity / (minStock * 2)) * 100), 100),
			barColor: stockRatio >= 1.5 ? 'bg-green-500' : stockRatio >= 1 ? 'bg-yellow-500' : 'bg-red-500',
			label: stockRatio >= 1.5 ? 'Healthy' : stockRatio >= 1 ? 'Adequate' : 'Below Minimum',
			labelColor: stockRatio >= 1.5 ? 'text-green-600' : stockRatio >= 1 ? 'text-yellow-600' : 'text-red-600'
		};
	}

	async function fetchCatalog(options: { background?: boolean; forceRefresh?: boolean } = {}): Promise<void> {
		const background = options.background === true;
		try {
			if (!background) isLoading = true;
			error = null;

			const filters: CatalogFilters = {
				search: searchQuery || undefined,
				category: selectedCategory !== 'all' ? selectedCategory : undefined,
				availability: (selectedAvailability as CatalogFilters['availability']) || 'all',
				condition: (selectedCondition as CatalogFilters['condition']) || 'all',
				sortBy: (sortBy as CatalogFilters['sortBy']) || 'name',
				page: currentPage,
				limit: itemsPerPage
			};

			catalogData = await catalogAPI.getCatalog(filters, { forceRefresh: options.forceRefresh });
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to load catalog';
			if (!background) error = msg;
			console.error('Catalog fetch error:', err);
		} finally {
			if (!background) isLoading = false;
		}
	}

	function clearFilters(): void {
		searchQuery = '';
		selectedCategory = 'all';
		selectedAvailability = 'all';
		selectedCondition = 'all';
		sortBy = 'name';
		currentPage = 1;
		error = null;
		fetchCatalog();
	}

	let searchTimeout: ReturnType<typeof setTimeout>;
	function handleSearch(query: string): void {
		searchQuery = query;
		currentPage = 1;
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => fetchCatalog(), 300);
	}

	function handleFilterChange(): void {
		currentPage = 1;
		fetchCatalog();
	}

	function openDetailModal(item: CatalogItem): void {
		selectedItem = item;
	}

	function closeDetailModal(): void {
		showFullImage = false;
		selectedItem = null;
	}

	function openFullImage(): void {
		if (selectedItem?.picture) showFullImage = true;
	}

	function closeFullImage(): void {
		showFullImage = false;
	}

	onMount(() => {
		const initialFilters: CatalogFilters = {
			search: searchQuery || undefined,
			category: selectedCategory !== 'all' ? selectedCategory : undefined,
			availability: (selectedAvailability as CatalogFilters['availability']) || 'all',
			condition: (selectedCondition as CatalogFilters['condition']) || 'all',
			sortBy: (sortBy as CatalogFilters['sortBy']) || 'name',
			page: currentPage,
			limit: itemsPerPage
		};

		const cached = catalogAPI.peekCachedCatalog(initialFilters);
		if (cached) {
			catalogData = cached;
			isLoading = false;
			fetchCatalog({ background: true, forceRefresh: true });
		} else {
			fetchCatalog();
		}

		const refreshInterval = setInterval(() => {
			fetchCatalog({ background: true, forceRefresh: true });
		}, 5 * 60 * 1000);

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
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && showFullImage) { closeFullImage(); return; }
		if (e.key === 'Escape' && selectedItem) closeDetailModal();
	}}
/>

<svelte:head>
	<title>Equipment Catalog - Instructor Portal</title>
	<meta name="description" content="Monitor equipment inventory, usage, and condition." />
</svelte:head>

<!-- Detail Modal -->
{#if selectedItem}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div class="fixed inset-0 bg-black/40" aria-hidden="true" onclick={closeDetailModal}></div>
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="catalog-item-details-title"
			class="relative z-50 w-full max-w-4xl rounded-lg bg-white shadow-xl"
		>
			<div class="flex items-start justify-between border-b border-gray-200 bg-gray-50 px-6 py-4">
				<div>
					<h2 id="catalog-item-details-title" class="text-lg font-semibold text-gray-900">{selectedItem.name}</h2>
					<p class="mt-0.5 text-sm text-gray-500">{getCategoryName(selectedItem.categoryId)}</p>
				</div>
				<button
					onclick={closeDetailModal}
					class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
					aria-label="Close details modal"
					title="Close"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="max-h-[70vh] overflow-y-auto">
				<div class="grid grid-cols-1 gap-6 px-6 py-5 lg:grid-cols-2">
					<!-- Left Panel -->
					<div class="space-y-5">
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
								<div class="flex h-full w-full items-center justify-center text-6xl">📦</div>
							{/if}
						</div>

						<div>
							<h4 class="mb-3 text-sm font-medium text-gray-700">Specifications</h4>
							<div class="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
								<div class="flex justify-between text-sm">
									<span class="text-gray-600">Category</span>
									<span class="font-medium text-gray-900">{getCategoryName(selectedItem.categoryId)}</span>
								</div>
								<div class="flex items-center justify-between text-sm">
									<span class="text-gray-600">Status</span>
									<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold {getAvailabilityColor(selectedItem.status)}">{selectedItem.status}</span>
								</div>
								<div class="flex items-center justify-between text-sm">
									<span class="text-gray-600">Condition</span>
									<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold {getConditionColor(selectedItem.condition)}">{selectedItem.condition}</span>
								</div>
								{#if selectedItem.location}
									<div class="flex justify-between text-sm">
										<span class="text-gray-600">Location</span>
										<span class="font-medium text-gray-900">{selectedItem.location}</span>
									</div>
								{/if}
								{#if selectedItem.specification}
									<div class="flex flex-col gap-1 text-sm">
										<span class="text-gray-600">Specification</span>
										<span class="font-medium text-gray-900">{selectedItem.specification}</span>
									</div>
								{/if}
							</div>
						</div>

						{#if selectedItem.description}
							<div>
								<h4 class="mb-2 text-sm font-medium text-gray-700">Description</h4>
								<p class="text-sm text-gray-600">{selectedItem.description}</p>
							</div>
						{/if}
					</div>

					<!-- Right Panel — Inventory Monitoring -->
					<div class="space-y-5">
						<div>
							<h4 class="mb-3 text-sm font-medium text-gray-700">Inventory Overview</h4>
							<div class="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
								<div class="flex items-center justify-between">
									<span class="text-sm text-gray-600">Total Units</span>
									<span class="text-sm font-semibold text-gray-900">{selectedItem.quantity}</span>
								</div>
								{#if selectedItem.eomCount != null}
									<div class="flex items-center justify-between">
										<span class="text-sm text-gray-600">End-of-Month Count</span>
										<span class="text-sm font-semibold text-gray-900">{selectedItem.eomCount}</span>
									</div>
								{/if}
								{#if selectedItem.minStock != null}
									<div class="flex items-center justify-between">
										<span class="text-sm text-gray-600">Minimum Stock</span>
										<span class="text-sm font-semibold {selectedItem.quantity <= selectedItem.minStock ? 'text-red-600' : 'text-gray-900'}">{selectedItem.minStock}</span>
									</div>
								{/if}
								{#if selectedItem.variance != null}
									<div class="flex items-center justify-between">
										<span class="text-sm text-gray-600">Variance</span>
										<span class="text-sm font-semibold {selectedItem.variance < 0 ? 'text-red-600' : selectedItem.variance > 0 ? 'text-green-600' : 'text-gray-900'}">{selectedItem.variance > 0 ? '+' : ''}{selectedItem.variance}</span>
									</div>
								{/if}
							</div>
						</div>

						{#if selectedItem.minStock != null && selectedItem.minStock > 0}
							<div>
								<h4 class="mb-3 text-sm font-medium text-gray-700">Stock Health</h4>
								<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
									<div class="mb-2 flex items-center justify-between">
										<span class="text-sm text-gray-600">Stock vs Minimum</span>
										<span class="text-xs font-semibold {selectedItemStockHealth?.labelColor}">{selectedItemStockHealth?.label}</span>
									</div>
									<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
										<div class="h-2 rounded-full transition-all {selectedItemStockHealth?.barColor}" style="width: {selectedItemStockHealth?.pct ?? 0}%"></div>
									</div>
									<p class="mt-1.5 text-xs text-gray-500">{selectedItem.quantity} on hand · minimum {selectedItem.minStock}</p>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<div class="flex justify-end border-t border-gray-200 bg-gray-50 px-6 py-4">
				<button
					onclick={closeDetailModal}
					class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Full image lightbox -->
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

{#if isLoading}
	<div class="space-y-6">
		<!-- Header skeleton -->
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="space-y-2">
				<Skeleton class="h-8 w-64" />
				<Skeleton class="h-4 w-80" />
			</div>
			<div class="flex gap-2">
				<Skeleton class="h-9 w-9 rounded-lg" />
				<Skeleton class="h-9 w-9 rounded-lg" />
			</div>
		</div>
		<!-- Filter bar skeleton -->
		<div class="rounded-lg bg-white p-4 shadow">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
				<div class="lg:col-span-2"><Skeleton class="h-9 w-full rounded-lg" /></div>
				<Skeleton class="h-9 w-full rounded-lg" />
				<Skeleton class="h-9 w-full rounded-lg" />
				<Skeleton class="h-9 w-full rounded-lg" />
			</div>
		</div>
		<!-- Card skeletons -->
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each { length: 6 } as _}
				<div class="overflow-hidden rounded-lg bg-white shadow">
					<Skeleton class="aspect-square w-full" />
					<div class="space-y-3 p-4">
						<div class="flex items-start justify-between gap-2">
							<Skeleton class="h-5 w-40" />
							<Skeleton class="h-5 w-20 rounded-full" />
						</div>
						<Skeleton class="h-4 w-full" />
						<Skeleton class="h-4 w-3/4" />
						<Skeleton class="h-16 w-full rounded-lg" />
						<div class="flex gap-2">
							<Skeleton class="h-5 w-24 rounded-full" />
							<Skeleton class="h-5 w-16 rounded-full" />
						</div>
						<Skeleton class="h-9 w-full rounded-lg" />
					</div>
				</div>
			{/each}
		</div>
	</div>
{:else}
	<div class="space-y-6">
		<!-- Page Header -->
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<div class="flex items-center gap-3">
					<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Equipment Catalog</h1>
					<span class="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
						<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
						</svg>
						Monitoring
					</span>
				</div>
				<p class="mt-1 text-sm text-gray-500">Monitor equipment inventory, usage, and condition</p>
			</div>
			<div class="flex gap-2">
				<button
					onclick={() => (viewMode = 'grid')}
					aria-label="Switch to grid view"
					title="Grid view"
					class="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium transition-colors {viewMode === 'grid' ? 'bg-pink-100 text-pink-700' : 'bg-white text-gray-700 hover:bg-gray-50'}"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
					</svg>
				</button>
				<button
					onclick={() => (viewMode = 'list')}
					aria-label="Switch to list view"
					title="List view"
					class="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium transition-colors {viewMode === 'list' ? 'bg-pink-100 text-pink-700' : 'bg-white text-gray-700 hover:bg-gray-50'}"
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
					<label for="search" class="mb-1 block text-sm font-medium text-gray-700">Search</label>
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
							placeholder="Search by name, category, or specification..."
							class="block w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-pink-500 focus:ring-pink-500"
							aria-label="Search equipment"
						/>
					</div>
				</div>

				<!-- Category Filter -->
				<div>
					<label for="category" class="mb-1 block text-sm font-medium text-gray-700">Category</label>
					<select
						id="category"
						value={selectedCategory}
						onchange={(e) => { selectedCategory = (e.target as HTMLSelectElement).value; handleFilterChange(); }}
						class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
						aria-label="Filter by category"
					>
						<option value="all">All Categories</option>
						{#each categories as category}
							<option value={category.id}>{category.name}</option>
						{/each}
					</select>
				</div>

				<!-- Availability Filter -->
				<div>
					<label for="availability" class="mb-1 block text-sm font-medium text-gray-700">Status</label>
					<select
						id="availability"
						value={selectedAvailability}
						onchange={(e) => { selectedAvailability = (e.target as HTMLSelectElement).value; handleFilterChange(); }}
						class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
						aria-label="Filter by status"
					>
						{#each availabilityOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>

				<!-- Condition Filter -->
				<div>
					<label for="condition" class="mb-1 block text-sm font-medium text-gray-700">Condition</label>
					<select
						id="condition"
						value={selectedCondition}
						onchange={(e) => { selectedCondition = (e.target as HTMLSelectElement).value; handleFilterChange(); }}
						class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
						aria-label="Filter by condition"
					>
						{#each conditionOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Sort Row -->
			<div class="mt-4 flex items-center gap-2">
				<label for="sort" class="whitespace-nowrap text-sm font-medium text-gray-700">Sort by</label>
				<select
					id="sort"
					value={sortBy}
					onchange={(e) => { sortBy = (e.target as HTMLSelectElement).value; handleFilterChange(); }}
					class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-pink-500 focus:ring-pink-500"
					aria-label="Sort items"
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
					<svg class="mr-3 h-5 w-5 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<div>
						<p class="text-sm font-medium text-red-800">Failed to load catalog</p>
						<p class="mt-1 text-sm text-red-600">{error}</p>
						<button
							onclick={() => fetchCatalog()}
							class="mt-2 text-sm font-medium text-red-700 underline hover:text-red-900"
						>
							Try again
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Results Count -->
		<div class="flex items-center justify-between">
			<p class="text-sm text-gray-700">
				Showing <span class="font-medium">{filteredItems.length}</span>
				{#if totalItems > filteredItems.length}
					of <span class="font-medium">{totalItems}</span>
				{/if}
				items
			</p>
			{#if searchQuery || selectedCategory !== 'all' || selectedAvailability !== 'all' || selectedCondition !== 'all'}
				<button onclick={clearFilters} class="text-sm font-medium text-pink-600 hover:text-pink-700">
					Clear all filters
				</button>
			{/if}
		</div>

		<!-- Grid View -->
		{#if viewMode === 'grid'}
			{#if filteredItems.length === 0}
				<div class="rounded-lg bg-white py-16 text-center shadow">
					<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
					</svg>
					<h3 class="mt-4 text-sm font-medium text-gray-900">No equipment found</h3>
					<p class="mt-1 text-sm text-gray-500">Try adjusting your search or filter criteria.</p>
					<button onclick={clearFilters} class="mt-4 text-sm font-medium text-pink-600 hover:text-pink-700">Clear filters</button>
				</div>
			{:else}
				<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{#each filteredItems as item}
						<div class="group overflow-hidden rounded-lg bg-white shadow transition-all hover:shadow-lg">
							<div class="aspect-square overflow-hidden bg-gray-100">
								{#if item.picture}
									<img src={item.picture} alt={item.name} class="h-full w-full object-cover" loading="lazy" />
								{:else}
									<div class="flex h-full w-full items-center justify-center text-6xl">📦</div>
								{/if}
							</div>
							<div class="p-4">
								<div class="flex items-start justify-between gap-2">
									<h3 class="text-sm font-semibold leading-tight text-gray-900">{item.name}</h3>
									<span class="inline-flex shrink-0 rounded-full px-2 py-1 text-xs font-semibold {getAvailabilityColor(item.status)}">
										{item.status}
									</span>
								</div>
								{#if item.description || item.specification}
									<p class="mt-2 line-clamp-2 text-sm text-gray-600">{item.description || item.specification}</p>
								{/if}

								<!-- Stock Indicator -->
								<div class="mt-3 rounded-lg bg-gray-50 p-3">
									<p class="text-xs font-medium text-gray-700">Inventory</p>
									<div class="mt-1 flex items-baseline gap-1">
										<span class="text-sm font-semibold text-gray-900">{item.quantity}</span>
										<span class="text-xs text-gray-500">units total</span>
										{#if item.minStock != null && item.quantity <= item.minStock}
											<span class="ml-auto inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">Below Min</span>
										{/if}
									</div>
								</div>

								<div class="mt-3 flex flex-wrap items-center gap-2">
									<span class="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
										{getCategoryName(item.categoryId)}
									</span>
									<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getConditionColor(item.condition)}">
										{item.condition}
									</span>
								</div>

								<div class="mt-4">
									<button
										onclick={() => openDetailModal(item)}
										class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1"
									>
										View Details
									</button>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}

		<!-- List View -->
		{#if viewMode === 'list'}
			{#if filteredItems.length === 0}
				<div class="rounded-lg bg-white py-16 text-center shadow">
					<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
					</svg>
					<h3 class="mt-4 text-sm font-medium text-gray-900">No equipment found</h3>
					<p class="mt-1 text-sm text-gray-500">Try adjusting your search or filter criteria.</p>
					<button onclick={clearFilters} class="mt-4 text-sm font-medium text-pink-600 hover:text-pink-700">Clear filters</button>
				</div>
			{:else}
				<div class="overflow-hidden rounded-lg bg-white shadow">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Category</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Quantity</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Condition</th>
								<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Location</th>
								<th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each filteredItems as item}
								<tr class="hover:bg-gray-50">
									<td class="px-6 py-4">
										<div class="flex items-center gap-3">
											<div class="h-10 w-10 shrink-0 overflow-hidden rounded bg-gray-100">
												{#if item.picture}
													<img src={item.picture} alt={item.name} class="h-full w-full object-cover" loading="lazy" />
												{:else}
													<div class="flex h-full w-full items-center justify-center text-xl">📦</div>
												{/if}
											</div>
											<div class="min-w-0">
												<p class="text-sm font-medium text-gray-900">{item.name}</p>
												{#if item.specification}
													<p class="truncate text-xs text-gray-500">{item.specification}</p>
												{/if}
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
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
										<span class="font-medium">{item.quantity}</span>
										{#if item.minStock != null && item.quantity <= item.minStock}
											<span class="ml-1 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">Low</span>
										{/if}
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {getConditionColor(item.condition)}">
											{item.condition}
										</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
										{item.location || '—'}
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
		{/if}

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="flex items-center justify-between rounded-lg bg-white px-4 py-3 shadow">
				<p class="text-sm text-gray-700">
					Page <span class="font-medium">{currentPage}</span> of <span class="font-medium">{totalPages}</span>
					· <span class="font-medium">{totalItems}</span> total items
				</p>
				<div class="flex gap-2">
					<button
						onclick={() => { currentPage = Math.max(1, currentPage - 1); fetchCatalog(); }}
						disabled={currentPage <= 1}
						class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Previous
					</button>
					<button
						onclick={() => { currentPage = Math.min(totalPages, currentPage + 1); fetchCatalog(); }}
						disabled={currentPage >= totalPages}
						class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Next
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
