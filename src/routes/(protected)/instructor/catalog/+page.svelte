<script lang="ts">
	import { onMount } from 'svelte';
	import { catalogAPI, type CatalogResponse, type CatalogFilters, type CatalogItem } from '$lib/api/catalog';
	import { inventoryHistoryAPI } from '$lib/api/inventoryHistory';
	import { subscribeToInventoryChanges } from '$lib/api/inventory';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	import CatalogItemModal from '$lib/components/ui/CatalogItemModal.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';

	// UI State
	let viewMode = $state<'grid' | 'list'>('grid');
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedItem = $state<CatalogItem | null>(null);
	let showFullImage = $state(false);
	let isEditMode = $state(false);
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);
	let saveSuccess = $state(false);

	// Filter State
	let searchQuery = $state('');
	let selectedCategory = $state('all');
	let selectedAvailability = $state('all');
	let selectedCondition = $state('all');
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
				categoryId: '',
				status: 'In Stock',
				quantity: 0
			} as any);
		}
		return items;
	});
	let categories = $derived.by(() => catalogData?.categories ?? []);
	let inFlightLoadId = 0;
	const progressivePageSize = 20;
	
	// Edit form state
	let editForm = $state({
		name: '',
		categoryId: '',
		specification: '',
		description: '',
		quantity: 0,
		eomCount: 0
	});
	
	/**
	 * Condition → status mapping.
	 * The data model stores availability as `status` (In Stock / Low Stock / Out of Stock).
	 * We map the UI condition labels to those status values so the filter has real effect.
	 */
	const conditionStatusMap: Record<string, string[]> = {
		Excellent: ['In Stock'],
		Good:      ['In Stock', 'Low Stock'],
		Fair:      ['Low Stock'],
		Poor:      ['Out of Stock'],
		Damaged:   ['Out of Stock']
	};

	// Client-side condition filter applied before pagination
	const conditionFilteredItems = $derived.by(() => {
		if (selectedCondition === 'all') return allItems;
		const allowedStatuses = conditionStatusMap[selectedCondition];
		if (!allowedStatuses) return allItems;
		return allItems.filter((item) => item.isPlaceholder || allowedStatuses.includes(item.status));
	});

	// Client-side pagination
	const itemsPerPageGrid = 20;
	const itemsPerPageList = 10;
	const itemsPerPage = $derived(viewMode === 'grid' ? itemsPerPageGrid : itemsPerPageList);
	const totalPages = $derived(Math.max(1, Math.ceil(conditionFilteredItems.length / itemsPerPage)));
	const filteredItems = $derived(conditionFilteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage));
	const totalItems = $derived(conditionFilteredItems.length);
	let selectedItemStockHealth = $derived.by(() => {
		// minStock property not available on CatalogItem
		return null;
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

	function getStockHealth(quantity: number, minStock: number) {
		const ratio = quantity / minStock;
		return {
			pct: Math.min(Math.round((quantity / (minStock * 2)) * 100), 100),
			barColor: ratio >= 1.5 ? 'bg-green-500' : ratio >= 1 ? 'bg-yellow-500' : 'bg-red-500',
			label: ratio >= 1.5 ? 'Healthy' : ratio >= 1 ? 'Adequate' : 'Below Minimum',
			labelColor: ratio >= 1.5 ? 'text-green-600' : ratio >= 1 ? 'text-yellow-600' : 'text-red-600'
		};
	}

	async function fetchCatalog(options: { background?: boolean; forceRefresh?: boolean } = {}): Promise<void> {
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
				availability: (selectedAvailability as CatalogFilters['availability']) || 'all',
				sortBy: (sortBy as CatalogFilters['sortBy']) || 'name',
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

			// Step 2: Offload remaining pages in the background
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
							}
							return nextRes;
						});
					remainingPromises.push(promise);
				}
				await Promise.allSettled(remainingPromises);
			}
		} catch (err) {
			if (loadId === inFlightLoadId && !background) {
				error = err instanceof Error ? err.message : 'Failed to load catalog';
			}
		} finally {
			if (loadId === inFlightLoadId && !background) {
				isLoading = false;
			}
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

	function goToPage(pageNum: number): void {
		if (pageNum >= 1 && pageNum <= totalPages) {
			currentPage = pageNum;
		}
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

	function openDetailModal(item: CatalogItem): void { selectedItem = item; }
	function closeDetailModal(): void { 
		showFullImage = false; 
		selectedItem = null; 
		isEditMode = false;
		saveError = null;
		saveSuccess = false;
	}
	function openFullImage(): void { if (selectedItem?.picture) showFullImage = true; }
	function closeFullImage(): void { showFullImage = false; }

	function enterEditMode(): void {
		if (!selectedItem) return;
		isEditMode = true;
		saveError = null;
		saveSuccess = false;
		// Populate form with current values
		editForm = {
			name: selectedItem.name,
			categoryId: selectedItem.categoryId || '',
			specification: selectedItem.specification || '',
			description: selectedItem.description || '',
			quantity: selectedItem.quantity || 0,
			eomCount: selectedItem.eomCount ?? 0
		};
	}

	function cancelEdit(): void {
		isEditMode = false;
		saveError = null;
		saveSuccess = false;
	}

	async function saveChanges(): Promise<void> {
		if (!selectedItem) return;
		
		// Validation
		if (!editForm.name.trim()) {
			saveError = 'Item name is required';
			return;
		}
		if (!editForm.categoryId) {
			saveError = 'Category is required';
			return;
		}
		if (editForm.quantity < 0) {
			saveError = 'Quantity cannot be negative';
			return;
		}

		try {
			isSaving = true;
			saveError = null;
			
			const updatePayload = {
				name: editForm.name.trim(),
				categoryId: editForm.categoryId,
				specification: editForm.specification.trim(),
				description: editForm.description.trim(),
				quantity: editForm.quantity,
				eomCount: editForm.eomCount
			};
			
			// Call API to update item
			const response = await fetch(`/api/inventory/items/${selectedItem.id}`, {
				method: 'PATCH',
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(updatePayload)
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				
				// Provide user-friendly error messages
				if (response.status === 401) {
					throw new Error('Your session has expired. Please log in again.');
				} else if (response.status === 403) {
					throw new Error('You do not have permission to edit equipment items.');
				} else if (response.status === 404) {
					throw new Error('Item not found. It may have been deleted.');
				} else if (response.status === 429) {
					throw new Error('Too many requests. Please wait a moment and try again.');
				} else {
					throw new Error(errorData.error || `Failed to update item (${response.status})`);
				}
			}

			// Parse the updated item directly from the API response — no need to
			// wait for a full catalog refetch before updating the UI.
			const updatedData = await response.json();

			// Patch the local catalog state immediately so the modal reflects
			// the new values without any visible delay.
			if (catalogData) {
				catalogData = {
					...catalogData,
					items: catalogData.items.map(i => i.id === selectedItem?.id ? { ...i, ...updatedData } : i)
				};
			}
			if (selectedItem) {
				selectedItem = { ...selectedItem, ...updatedData };
			}

			// Show success state and exit edit mode right away.
			saveSuccess = true;
			isEditMode = false;

			// Refresh the full catalog in the background so subsequent views
			// are up-to-date, but don't block the current interaction.
			catalogAPI.invalidateCatalogCache();
			inventoryHistoryAPI.invalidateCache();
			fetchCatalog({ background: true, forceRefresh: true }).catch(() => {/* non-fatal */});

			setTimeout(() => {
				saveSuccess = false;
			}, 1500);
			
		} catch (err) {
			console.error('[CATALOG-EDIT] Save operation failed:', err);
			saveError = err instanceof Error ? err.message : 'Failed to save changes';
		} finally {
			isSaving = false;
		}
	}

	onMount(() => {
		const filters: CatalogFilters = {
			search: searchQuery || undefined,
			category: selectedCategory !== 'all' ? selectedCategory : undefined,
			availability: (selectedAvailability as CatalogFilters['availability']) || 'all',
			sortBy: (sortBy as CatalogFilters['sortBy']) || 'name',
			page: 1,
			limit: progressivePageSize
		};
		const cached = catalogAPI.peekCachedCatalog(filters);
		if (cached) {
			catalogData = cached;
			isLoading = false;
			fetchCatalog({ background: true, forceRefresh: true });
		} else {
			fetchCatalog();
		}
		const interval = setInterval(() => fetchCatalog({ background: true, forceRefresh: true }), 5 * 60 * 1000);
		return () => { clearInterval(interval); clearTimeout(searchTimeout); };
	});

	onMount(() => {
		console.log('[INSTRUCTOR-CATALOG-SSE] Setting up inventory SSE subscription');
		const unsub = subscribeToInventoryChanges((event) => {
			console.log('[INSTRUCTOR-CATALOG-SSE] ✓ Inventory change received:', event);
			console.log('[INSTRUCTOR-CATALOG-SSE] Fetching catalog with forceRefresh=true...');
			fetchCatalog({ background: true, forceRefresh: true }).then(() => {
				console.log('[INSTRUCTOR-CATALOG-SSE] Catalog refreshed successfully');
			}).catch((err) => {
				console.error('[INSTRUCTOR-CATALOG-SSE] Failed to refresh catalog:', err);
			});
		}, {
			onConnect: () => console.log('[INSTRUCTOR-CATALOG-SSE] ✓ Connected to inventory stream'),
			onError: (err) => console.error('[INSTRUCTOR-CATALOG-SSE] ✗ Connection error:', err)
		});
		console.log('[INSTRUCTOR-CATALOG-SSE] Subscription created');
		return () => {
			console.log('[INSTRUCTOR-CATALOG-SSE] Unsubscribing from inventory stream');
			unsub();
		};
	});
	
	// Reset to page 1 when filters or view mode changes
	$effect(() => {
		searchQuery;
		selectedCategory;
		selectedAvailability;
		selectedCondition;
		sortBy;
		viewMode;
		currentPage = 1;
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
	<CatalogItemModal
		item={selectedItem}
		{categories}
		{isEditMode}
		{saveError}
		{saveSuccess}
		onClose={closeDetailModal}
		footerHint={isEditMode
			? '* Required fields. Changes will be saved immediately.'
			: 'Review details before continuing with instruction planning.'}
	>
		{#snippet footerAction()}
			{#if !isEditMode}
				<button
					type="button"
					onclick={enterEditMode}
					class="flex-1 sm:flex-none rounded-lg bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-700 active:scale-[0.98]"
				>
					Edit Item
				</button>
			{:else}
				<button
					type="button"
					onclick={cancelEdit}
					disabled={isSaving}
					class="flex-1 sm:flex-none rounded-lg border-2 border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={saveChanges}
					disabled={!editForm.name.trim() || !editForm.categoryId || editForm.quantity < 0 || isSaving}
					class="flex-1 sm:flex-none rounded-lg bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none active:scale-[0.98]"
				>
					{#if isSaving}
						<span class="flex items-center justify-center gap-2">
							<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Saving...
						</span>
					{:else}
						Save Changes
					{/if}
				</button>
			{/if}
		{/snippet}

		{#snippet editContent()}
			<div class="space-y-4">
				<div>
					<label for="edit-name" class="block text-sm font-bold text-gray-900 mb-2">
						Item Name <span class="text-pink-500">*</span>
					</label>
					<input
						id="edit-name"
						type="text"
						bind:value={editForm.name}
						class="block w-full rounded-lg border-2 border-gray-200 px-4 py-3 text-sm font-semibold shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
						placeholder="Enter item name"
						required
						disabled={isSaving}
					/>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div>
						<label for="edit-category" class="block text-sm font-bold text-gray-900 mb-2">
							Category <span class="text-pink-500">*</span>
						</label>
						<select
							id="edit-category"
							bind:value={editForm.categoryId}
							class="block w-full rounded-lg border-2 border-gray-200 px-4 py-3 text-sm font-semibold shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
							required
							disabled={isSaving}
						>
							<option value="">Select category</option>
							{#each categories as category}
								<option value={category.id}>{category.name}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="edit-specification" class="block text-sm font-bold text-gray-900 mb-2">
							Specification
						</label>
						<input
							id="edit-specification"
							type="text"
							bind:value={editForm.specification}
							class="block w-full rounded-lg border-2 border-gray-200 px-4 py-3 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
							placeholder="Enter specification"
							disabled={isSaving}
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div>
						<label for="edit-quantity" class="block text-sm font-bold text-gray-900 mb-2">
							Quantity
						</label>
						<input
							id="edit-quantity"
							type="number"
							bind:value={editForm.quantity}
							min="0"
							class="block w-full rounded-lg border-2 border-gray-200 px-4 py-3 text-sm font-semibold shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
							disabled={isSaving}
						/>
					</div>

					<div>
						<label for="edit-eom-count" class="block text-sm font-bold text-gray-900 mb-2">
							EOM Count
						</label>
						<input
							id="edit-eom-count"
							type="number"
							bind:value={editForm.eomCount}
							min="0"
							class="block w-full rounded-lg border-2 border-gray-200 px-4 py-3 text-sm font-semibold shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
							disabled={isSaving}
						/>
					</div>
				</div>

				<div>
					<label for="edit-description" class="block text-sm font-bold text-gray-900 mb-2">
						Description
					</label>
					<textarea
						id="edit-description"
						bind:value={editForm.description}
						rows="4"
						class="block w-full rounded-lg border-2 border-gray-200 px-4 py-3 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
						placeholder="Enter item description"
						disabled={isSaving}
					></textarea>
					<p class="mt-2 text-xs text-gray-500">Provide additional details about this equipment item.</p>
				</div>
			</div>
		{/snippet}
	</CatalogItemModal>
{/if}

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Equipment Catalog</h1>
			<p class="mt-1 text-sm text-gray-500">Monitor equipment inventory, usage, and condition</p>
		</div>
		<div class="flex shrink-0 rounded-lg border border-gray-300 overflow-hidden self-start sm:self-auto">
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

	<!-- Search and Filters -->
	<div class="rounded-lg bg-white p-3 shadow sm:p-4">
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
				placeholder="Search by name, category, or specification…"
				class="block w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-pink-500 focus:ring-pink-500"
				aria-label="Search equipment"
				disabled={isLoading}
			/>
		</div>
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
			<select
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
				value={selectedAvailability}
				onchange={(e) => { selectedAvailability = (e.target as HTMLSelectElement).value; handleFilterChange(); }}
				class="block w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
				aria-label="Filter by status"
				disabled={isLoading}
			>
				{#each availabilityOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
			<select
				value={selectedCondition}
				onchange={(e) => { selectedCondition = (e.target as HTMLSelectElement).value; handleFilterChange(); }}
				class="block w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
				aria-label="Filter by condition"
				disabled={isLoading}
			>
				{#each conditionOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
			<select
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
		<div class="rounded-lg border border-red-200 bg-red-50 p-4">
			<div class="flex">
				<svg class="mr-3 h-5 w-5 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<div>
					<p class="text-sm font-medium text-red-800">Failed to load catalog</p>
					<p class="mt-1 text-sm text-red-600">{error}</p>
					<button onclick={() => fetchCatalog()} class="mt-2 text-sm font-medium text-red-700 underline hover:text-red-900">Try again</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Results count + clear -->
	{#if !isLoading}
		<div class="flex items-center justify-between">
			<p class="text-sm text-gray-700">
				Showing <span class="font-medium">{conditionFilteredItems.length}</span>
				{conditionFilteredItems.length === 1 ? 'item' : 'items'}
			</p>
			{#if searchQuery || selectedCategory !== 'all' || selectedAvailability !== 'all' || selectedCondition !== 'all'}
				<button onclick={clearFilters} class="text-sm font-medium text-pink-600 hover:text-pink-700 transition-colors">
					Clear all filters
				</button>
			{/if}
		</div>
	{/if}

	<!-- Loading skeleton -->
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
								<div class="h-7 w-full rounded-md bg-gray-200 mt-2"></div>
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

	<!-- Grid View -->
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
								<div class="h-4 w-14 rounded bg-gray-200"></div>
							</div>
							<div class="h-3 w-12 rounded bg-gray-200 mt-1"></div>
						</div>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => openDetailModal(item)}
						class="group flex flex-col overflow-hidden rounded-lg bg-white shadow-sm transition-all hover:shadow-md text-left focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1"
					>
						<div class="relative aspect-4/3 overflow-hidden bg-gray-100 flex items-center justify-center w-full">
							{#if item.picture}
								<img src={item.picture} alt={item.name} class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
							{:else}
								<svg class="h-10 w-10 sm:h-12 sm:w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
								</svg>
							{/if}
							<!-- required badge — top left -->
							{#if item.isrequired}
								<span class="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-purple-800 ring-1 ring-purple-200">
									<svg class="h-2 w-2 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
									required
								</span>
							{/if}
							<!-- Status badge — top right -->
							<span class="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight {getAvailabilityColor(item.status)}">
								{item.status === 'In Stock' ? 'In Stock' : item.status === 'Out of Stock' ? 'Out' : item.status}
							</span>
						</div>
						<div class="flex flex-1 flex-col p-2">
							<h3 class="line-clamp-2 text-xs font-semibold leading-snug text-gray-900 sm:text-sm">{item.name}</h3>
							<div class="mt-1.5 flex flex-wrap items-center gap-1">
								<span class="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-600">{getCategoryName(item.categoryId)}</span>
							</div>
							<p class="mt-1 text-[10px] text-gray-400">Qty: {item.currentCount ?? (item.quantity + (item.donations ?? 0))}</p>
						</div>
					</button>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- List View -->
	{#if !isLoading && viewMode === 'list' && filteredItems.length > 0}
		<div class="overflow-hidden rounded-lg bg-white shadow divide-y divide-gray-100">
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
						<div class="h-4 w-4 shrink-0 rounded bg-gray-200"></div>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => openDetailModal(item)}
						class="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-pink-500 sm:px-4 sm:py-3.5"
					>
						<!-- Row number -->
						<span class="hidden sm:inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500">{(currentPage - 1) * itemsPerPage + i + 1}</span>

						<div class="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-gray-100 sm:h-14 sm:w-14 flex items-center justify-center">
							{#if item.picture}
								<img src={item.picture} alt={item.name} class="h-full w-full object-cover" loading="lazy" />
							{:else}
								<svg class="h-6 w-6 sm:h-7 sm:w-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
								</svg>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold text-gray-900">{item.name}</p>
							<p class="truncate text-xs text-gray-500">{item.specification || getCategoryName(item.categoryId)}</p>
							<div class="mt-1 flex flex-wrap items-center gap-1">
								{#if item.isrequired}
									<span class="inline-flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-800 ring-1 ring-purple-200">
										<svg class="h-2 w-2 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
										required
									</span>
								{/if}
								<span class="rounded px-1.5 py-0.5 text-[10px] font-semibold {getAvailabilityColor(item.status)}">{item.status}</span>
								<span class="text-[10px] text-gray-400">Qty: {item.currentCount ?? (item.quantity + (item.donations ?? 0))}</span>
							</div>
						</div>
						<svg class="h-4 w-4 shrink-0 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
						</svg>
					</button>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Empty State -->
	{#if !isLoading && conditionFilteredItems.length === 0}
		<div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center sm:p-12">
			<svg class="mx-auto h-10 w-10 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
			</svg>
			<h3 class="mt-3 text-sm font-medium text-gray-900">No equipment found</h3>
			<p class="mt-1 text-xs text-gray-500">Try adjusting your filters or search terms.</p>
			<button onclick={clearFilters} class="mt-4 inline-flex items-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700">
				Clear filters
			</button>
		</div>
	{/if}

	<!-- Pagination -->
	{#if !isLoading && conditionFilteredItems.length > itemsPerPage}
		<Pagination
			{currentPage}
			{totalPages}
			totalItems={allItems.length}
			{itemsPerPage}
			onPageChange={goToPage}
		/>
	{/if}
</div>




