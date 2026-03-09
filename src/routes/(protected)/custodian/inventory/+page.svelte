<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import type { InventoryItem, InventoryCategory } from '$lib/api/inventory';
	import { 
		inventoryItemsAPI, 
		inventoryCategoriesAPI, 
		uploadInventoryImage 
	} from '$lib/api/inventory';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import { inventoryStore } from '$lib/stores/inventory';
	import InventorySkeletonLoader from '$lib/components/ui/InventorySkeletonLoader.svelte';
	
	type Tab = 'all-items' | 'categories' | 'low-stock' | 'add-item';
	
	let activeTab = $state<Tab>('all-items');
	
	// Data from store with client-side caching
	let items = $state<InventoryItem[]>([]);
	let categories = $state<InventoryCategory[]>([]);
	let loading = $state(false);
	let uploadingImage = $state(false);
	
	// Form state for adding new item
	let newItem = $state({
		name: '',
		category: '',
		categoryId: '',
		specification: '',
		toolsOrEquipment: '',
		picture: '',
		pictureFile: null as File | null,
		quantity: 0,
		eomCount: 0,
		minStock: 0,
		condition: 'Good',
		location: ''
	});

	// Editing mode
	let editingItemId = $state<string | null>(null);

	// Load data on component mount
	onMount(async () => {
		await loadCategories();
		await loadItems();

		// Keyboard event handler for Escape key
		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && showFullImage) {
				closeFullImage();
			}
			if (e.key === 'Escape' && openDropdownId) {
				closeDropdown();
			}
		};
		
		// Click handler to close dropdown when clicking outside
		const handleClickOutside = (e: MouseEvent) => {
			if (openDropdownId) {
				const target = e.target as HTMLElement;
				if (!target.closest('.relative')) {
					closeDropdown();
				}
			}
		};
		
		window.addEventListener('keydown', handleKeydown);
		document.addEventListener('click', handleClickOutside);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
			document.removeEventListener('click', handleClickOutside);
		};
	});

	/**
	 * Load all items from API (with client-side caching)
	 */
	async function loadItems() {
		try {
			// Check if cache is still valid
			if (inventoryStore.isItemsCacheValid()) {
				// Use cached data
				const storeData = get(inventoryStore);
				items = storeData.items;
				return;
			}

			loading = true;
			inventoryStore.setLoading(true);

			const response = await inventoryItemsAPI.getAll({ limit: 1000, includeArchived: true });
			items = response.items;

			// Update cache
			inventoryStore.setItems(response.items);
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to load items');
			console.error('Error loading items:', err);
		} finally {
			loading = false;
			inventoryStore.setLoading(false);
		}
	}

	/**
	 * Load all categories from API (with client-side caching)
	 */
	async function loadCategories() {
		try {
			// Check if cache is still valid
			if (inventoryStore.isCategoriesCacheValid()) {
				// Use cached data
				const storeData = get(inventoryStore);
				categories = storeData.categories;
				return;
			}

			loading = true;

			const response = await inventoryCategoriesAPI.getAll({ limit: 1000, includeArchived: true });
			categories = response.categories;

			// Update cache
			inventoryStore.setCategories(response.categories);
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to load categories');
			console.error('Error loading categories:', err);
		} finally {
			loading = false;
		}
	}

	async function handlePictureChange(e: Event) {
		const target = e?.target as HTMLInputElement;
		const file = target?.files?.[0];
		if (!file) return;
		
		if (!file.type.startsWith('image/')) {
			toastStore.error('Please select an image file');
			return;
		}

		// Validate file size (5MB max)
		if (file.size > 5 * 1024 * 1024) {
			toastStore.error('Image file size must be less than 5MB');
			return;
		}

		// Revoke previous preview if any
		if (newItem.picture && newItem.picture.startsWith('blob:')) {
			try { URL.revokeObjectURL(newItem.picture); } catch (err) {}
		}
		
		newItem.pictureFile = file;
		newItem.picture = URL.createObjectURL(file);
	}

	async function handleCategoryPictureChange(e: Event) {
		const target = e?.target as HTMLInputElement;
		const file = target?.files?.[0];
		if (!file) return;
		
		if (!file.type.startsWith('image/')) {
			toastStore.error('Please select an image file');
			return;
		}

		// Validate file size (10MB max)
		if (file.size > 10 * 1024 * 1024) {
			toastStore.error('Image file size must be less than 10MB');
			return;
		}

		// Revoke previous preview if any
		if (newCategoryPicture && newCategoryPicture.startsWith('blob:')) {
			try { URL.revokeObjectURL(newCategoryPicture); } catch (err) {}
		}
		
		newCategoryPictureFile = file;
		newCategoryPicture = URL.createObjectURL(file);
	}
	
	const activeItems = $derived(items.filter(item => !item.archived));
	const lowStockItems = $derived(activeItems.filter(item => item.status === 'Low Stock' || item.status === 'Out of Stock'));
	
	function switchTab(tab: Tab) {
		activeTab = tab;
		if (tab !== 'add-item') {
			resetForm();
		}
	}
	
	// Modal state for item details
	let selectedItem = $state<InventoryItem | null>(null);
	let showMenu = $state(false);
	let showFullImage = $state(false);
    let pictureInput: HTMLInputElement;

// Selected category filter for viewing category-specific items
let selectedCategory = $state<InventoryCategory | null>(null);
// sort order for items list: 'az' or 'za'
let sortOrder = $state('az');
// search query
let query = $state('');

// reactive filtered + sorted items for display (use rune-style $derived)
const filteredItems = $derived(items.filter(item => {
	const isActive = !item.archived;
	const matchesCategory = !selectedCategory || item.category === selectedCategory.name;
	const q = (query || '').toLowerCase();
	const matchesQuery = !q || (item.name || '').toLowerCase().includes(q);
	return isActive && matchesCategory && matchesQuery;
}));
const displayItems = $derived([...filteredItems].sort((a, b) => sortOrder === 'az' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));

	function openModal(item: InventoryItem) {
		selectedItem = item;
	}

	function closeModal() {
		selectedItem = null;
		showMenu = false;
	}

	function openFullImage() {
		showFullImage = true;
	}

	function closeFullImage() {
		showFullImage = false;
	}

	function toggleMenu(e: Event) {
		e?.stopPropagation?.();
		showMenu = !showMenu;
	}

	async function archiveItem(item: InventoryItem) {
		const confirmed = await confirmStore.warning(
			`Are you sure you want to archive "${item.name}"? It will be moved to the History page.`,
			'Archive Item',
			'Archive',
			'Cancel'
		);

		if (!confirmed) return;

		try {
			loading = true;
			await inventoryItemsAPI.update(item.id, { archived: true });

			// Invalidate cache after mutation
			inventoryStore.invalidateItems();

			await loadItems();
			closeModal();
			toastStore.success('Item archived successfully');
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to archive item');
			console.error('Error archiving item:', err);
		} finally {
			loading = false;
		}
	}

	async function handleAddItem(e: Event) {
		e.preventDefault();
		
		try {
			loading = true;

			// Upload image if provided
			let imageUrl = newItem.picture;
			if (newItem.pictureFile && !newItem.picture.startsWith('blob:')) {
				// Already uploaded
			} else if (newItem.pictureFile) {
				uploadingImage = true;
				const uploadResult = await uploadInventoryImage(newItem.pictureFile);
				imageUrl = uploadResult.url;
				uploadingImage = false;
			}

			// Prepare item data
			const itemData = {
				name: newItem.name,
				category: newItem.category,
				categoryId: newItem.categoryId || undefined,
				specification: newItem.specification || '',
				toolsOrEquipment: newItem.toolsOrEquipment || '',
				picture: imageUrl,
				quantity: newItem.quantity,
				eomCount: newItem.eomCount,
				minStock: newItem.minStock,
				condition: newItem.condition,
				location: newItem.location
			};

			if (editingItemId) {
				// Update existing item
				await inventoryItemsAPI.update(editingItemId, itemData);
			} else {
				// Create new item
				await inventoryItemsAPI.create(itemData);
			}

		// Invalidate cache after mutation
		inventoryStore.invalidateItems();

			resetForm();
			switchTab('all-items');
			toastStore.success(wasEditing ? 'Item updated successfully' : 'Item created successfully');
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to save item');
			console.error('Error saving item:', err);
		} finally {
			loading = false;
			uploadingImage = false;
		}
	}

	function resetForm() {
		// Revoke object URL if exists
		if (newItem.picture && newItem.picture.startsWith('blob:')) {
			try { URL.revokeObjectURL(newItem.picture); } catch (err) {}
		}

		newItem = {
			name: '',
			category: '',
			categoryId: '',
			specification: '',
			toolsOrEquipment: '',
			picture: '',
			pictureFile: null,
			quantity: 0,
			eomCount: 0,
			minStock: 0,
			condition: 'Good',
			location: ''
		};
		editingItemId = null;
	}

	function editItem(item: InventoryItem) {
		// prefill form and switch to Add/Edit tab
		newItem = {
			name: item.name,
			category: item.category,
			categoryId: item.categoryId || '',
			specification: item.specification,
			toolsOrEquipment: item.toolsOrEquipment,
			picture: item.picture || '',
			pictureFile: null,
			quantity: item.quantity,
			eomCount: item.eomCount,
			minStock: item.minStock,
			condition: item.condition,
			location: item.location || ''
		};
		editingItemId = item.id;
		switchTab('add-item');
		selectedItem = null;
	}

	function openCategory(category: InventoryCategory) {
		selectedCategory = category;
		switchTab('all-items');
		// small UX improvement: close any open item modal
		selectedItem = null;
	}

	function clearCategoryFilter() {
		selectedCategory = null;
	}

	async function deleteItem(item: InventoryItem) {
		const confirmed = await confirmStore.danger(
			`Are you sure you want to delete "${item.name}"? This action cannot be undone.`,
			'Delete Item',
			'Delete',
			'Cancel'
		);

		if (!confirmed) return;

		try {
			loading = true;
			await inventoryItemsAPI.delete(item.id);

			// Invalidate cache after mutation
			inventoryStore.invalidateItems();

			await loadItems();
			await loadCategories();
			selectedItem = null;
			toastStore.success('Item deleted successfully');
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to delete item');
			console.error('Error deleting item:', err);
		} finally {
			loading = false;
		}
	}

	// Category management functions
	let showCategoryModal = $state(false);
	let showEditCategoryModal = $state(false);
	let editingCategory = $state<InventoryCategory | null>(null);
	let newCategoryName = $state('');
	let newCategoryDescription = $state('');
	let newCategoryPicture = $state('');
	let newCategoryPictureFile = $state<File | null>(null);
	let categoryPictureInput: HTMLInputElement;
	let editCategoryPictureInput: HTMLInputElement;
	let uploadingCategoryImage = $state(false);
	let openDropdownId = $state<string | null>(null);

	function toggleDropdown(categoryId: string, e: Event) {
		e.stopPropagation();
		openDropdownId = openDropdownId === categoryId ? null : categoryId;
	}

	function closeDropdown() {
		openDropdownId = null;
	}

	async function handleCreateCategory(e: Event) {
		e.preventDefault();

		if (!newCategoryName.trim()) {
			toastStore.error('Category name is required');
			return;
		}

		try {
			loading = true;

			// Upload image if provided
			let imageUrl = newCategoryPicture;
			if (newCategoryPictureFile && newCategoryPicture.startsWith('blob:')) {
				uploadingCategoryImage = true;
				const uploadResult = await uploadInventoryImage(newCategoryPictureFile);
				imageUrl = uploadResult.url;
				uploadingCategoryImage = false;
			}

			await inventoryCategoriesAPI.create({
				name: newCategoryName,
				description: newCategoryDescription,
				picture: imageUrl
			});

			// Invalidate cache after mutation
			inventoryStore.invalidateCategories();

			await loadCategories();
			showCategoryModal = false;
			newCategoryName = '';
			newCategoryDescription = '';
			newCategoryPicture = '';
			newCategoryPictureFile = null;
			toastStore.success('Category created successfully');
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to create category');
			console.error('Error creating category:', err);
		} finally {
			loading = false;
			uploadingCategoryImage = false;
		}
	}

	function openEditCategory(category: InventoryCategory, e: Event) {
		e.stopPropagation();
		closeDropdown();
		editingCategory = category;
		newCategoryName = category.name;
		newCategoryDescription = category.description || '';
		newCategoryPicture = category.picture || '';
		newCategoryPictureFile = null;
		showEditCategoryModal = true;
	}

	async function handleEditCategory(e: Event) {
		e.preventDefault();

		if (!editingCategory) return;

		if (!newCategoryName.trim()) {
			toastStore.error('Category name is required');
			return;
		}

		try {
			loading = true;

			// Upload new image if provided
			let imageUrl = newCategoryPicture;
			if (newCategoryPictureFile && newCategoryPicture.startsWith('blob:')) {
				uploadingCategoryImage = true;
				const uploadResult = await uploadInventoryImage(newCategoryPictureFile);
				imageUrl = uploadResult.url;
				uploadingCategoryImage = false;
			}

			await inventoryCategoriesAPI.update(editingCategory.id, {
				name: newCategoryName,
				description: newCategoryDescription,
				picture: imageUrl
			});

			// Invalidate cache after mutation
			inventoryStore.invalidateCategories();

			await loadCategories();
			showEditCategoryModal = false;
			editingCategory = null;
			newCategoryName = '';
			newCategoryDescription = '';
			newCategoryPicture = '';
			newCategoryPictureFile = null;
			toastStore.success('Category updated successfully');
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to update category');
			console.error('Error updating category:', err);
		} finally {
			loading = false;
			uploadingCategoryImage = false;
		}
	}

	async function deleteCategory(category: InventoryCategory, e: Event) {
		e.stopPropagation();
		closeDropdown();

		if (category.itemCount > 0) {
			toastStore.error(`Cannot delete "${category.name}" - it contains ${category.itemCount} item(s). Please reassign or delete items first.`);
			return;
		}

		const confirmed = await confirmStore.danger(
			`Are you sure you want to delete category "${category.name}"?`,
			'Delete Category',
			'Delete',
			'Cancel'
		);

		if (!confirmed) return;

		try {
			loading = true;
			await inventoryCategoriesAPI.delete(category.id);

			// Invalidate cache after mutation
			inventoryStore.invalidateCategories();

			await loadCategories();
			toastStore.success('Category deleted successfully. Recoverable for 30 days from History page.');
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to delete category');
			console.error('Error deleting category:', err);
		} finally {
			loading = false;
		}
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

		<!-- Item Details Modal -->
		{#if selectedItem}
			<div class="fixed inset-0 z-50 flex items-center justify-center">
				<div class="fixed inset-0 bg-black/40" aria-hidden="true" onclick={closeModal}></div>
				<div class="relative z-50 w-full max-w-3xl rounded-lg bg-white p-6 shadow-lg">
					<div class="flex items-start justify-between">
						<h2 class="text-lg font-semibold text-gray-900">{selectedItem.name}</h2>
						<div class="relative">
							<button aria-haspopup="true" aria-expanded={showMenu} title="Menu" class="text-gray-500 hover:text-gray-700 p-2 rounded-full" onclick={(e) => toggleMenu(e)}>
								<!-- vertical ellipsis -->
								<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"/></svg>
							</button>

							{#if showMenu}
								<div class="absolute right-0 mt-2 w-40 rounded-md bg-white border shadow-lg z-50" role="menu" aria-label="Item menu">
									<button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" role="menuitem" onclick={() => { editItem(selectedItem); toggleMenu(); }}>Edit</button>
									<button class="w-full text-left px-4 py-2 text-sm text-yellow-700 hover:bg-yellow-50" role="menuitem" onclick={() => { archiveItem(selectedItem); toggleMenu(); }}>Archive</button>
									<button class="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50" role="menuitem" onclick={() => { deleteItem(selectedItem); toggleMenu(); }}>Delete</button>
									<button class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" role="menuitem" onclick={() => { closeModal(); toggleMenu(); }}>Close</button>
								</div>
							{/if}
						</div>
					</div>
					<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
						<div class="sm:col-span-1 flex items-center justify-center">
							{#if selectedItem.picture}
								<button
									type="button"
									onclick={openFullImage}
									class="cursor-zoom-in hover:opacity-90 transition-opacity"
									title="Click to view full size"
								>
									<img src={selectedItem.picture} alt={selectedItem.name} class="w-44 rounded object-cover" loading="lazy" />
								</button>
							{:else}
								<div class="h-44 w-44 rounded bg-gray-100"></div>
							{/if}
						</div>
						<div class="sm:col-span-2">
							<div class="grid gap-2 md:grid-cols-2">
								<div>
									<p class="text-sm text-gray-500">Category</p>
									<p class="font-medium">{selectedItem.category}</p>
								</div>
								<div>
									<p class="text-sm text-gray-500">Specification</p>
									<p class="font-medium">{selectedItem.specification}</p>
								</div>
								<div>
									<p class="text-sm text-gray-500">Tools / Equipment</p>
									<p class="font-medium">{selectedItem.toolsOrEquipment}</p>
								</div>
								<div>
									<p class="text-sm text-gray-500">Location</p>
									<p class="font-medium">{selectedItem.location ?? '—'}</p>
								</div>
								<div>
									<p class="text-sm text-gray-500">Current Count</p>
									<p class="font-medium">{selectedItem.quantity}</p>
								</div>
								<div>
									<p class="text-sm text-gray-500">EOM Count</p>
									<p class="font-medium">{selectedItem.eomCount}</p>
								</div>
								<div>
									<p class="text-sm text-gray-500">Variance</p>
									<p class="font-medium">{selectedItem.variance}</p>
								</div>
								<div>
									<p class="text-sm text-gray-500">Status</p>
									<p class="font-medium">{selectedItem.status}</p>
								</div>
							</div>
							<div class="mt-4">
								<p class="text-sm text-gray-500">Condition</p>
								<p class="font-medium">{selectedItem.condition}</p>
							</div>
						</div>
					</div>

				</div>
			</div>
		{/if}

		<!-- Full Screen Image Modal -->
		{#if showFullImage && selectedItem?.picture}
			<div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
				<div class="fixed inset-0 bg-black/90" onclick={closeFullImage}></div>
				<div class="relative z-[61] max-h-[90vh] max-w-[90vw]">
					<button
						onclick={closeFullImage}
						class="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
						title="Close (Esc)"
					>
						<svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
					<img
						src={selectedItem.picture}
						alt={selectedItem.name}
						class="max-h-[90vh] max-w-full rounded-lg shadow-2xl"
					/>
				</div>
			</div>
		{/if}

		<button 
			onclick={() => switchTab('add-item')}
			class="inline-flex items-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500"
			disabled={loading}
		>
			<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
			</svg>
			Add New Item
		</button>
	</div>

	<!-- Global Skeleton Loading State -->
	{#if loading}
		<InventorySkeletonLoader view={activeTab === 'categories' ? 'categories' : activeTab === 'low-stock' ? 'low-stock' : 'all-items'} />
	{:else}
	
	<!-- Stats Overview -->
	<div class="grid grid-cols-1 gap-5 sm:grid-cols-4">
		<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
			<dt class="truncate text-sm font-medium text-gray-500">Active Items</dt>
			<dd class="mt-1 text-3xl font-semibold text-gray-900">{activeItems.length}</dd>
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
			<dd class="mt-1 text-3xl font-semibold text-gray-900">{activeItems.reduce((sum, item) => sum + item.quantity, 0)}</dd>
		</div>
	</div>
	
	<!-- Tabs Navigation -->
	<div class="border-b border-gray-200 bg-white shadow-sm">
		<nav class="-mb-px flex overflow-x-auto" aria-label="Tabs">
			<button
				onclick={() => switchTab('all-items')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'all-items'
					? 'border-pink-500 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center">
					<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
					</svg>
						All Items
						<span class="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{selectedCategory ? filteredItems.length : activeItems.length}</span>
				</div>
			</button>
			
			<button
				onclick={() => switchTab('categories')}
				class="whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors {activeTab === 'categories'
					? 'border-pink-500 text-pink-600'
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
					? 'border-pink-500 text-pink-600'
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
					{#if selectedCategory}
						<div class="mb-2 flex items-center gap-3">
							<span class="inline-flex items-center rounded-full bg-pink-100 px-3 py-1 text-sm font-medium text-pink-800">Showing: {selectedCategory.name}</span>
							<button onclick={clearCategoryFilter} class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">Clear</button>
						</div>
					{/if}
					<div class="relative flex-1">
						<input
							type="text"
							placeholder="Search items..."
							bind:value={query}
							class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
						/>
						<svg class="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
						</svg>
					</div>
					<select bind:value={sortOrder} class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500">
						<option value="az">A - Z</option>
						<option value="za">Z - A</option>
					</select>
				</div>
				
				{#if displayItems.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No items found</h3>
						<p class="mt-2 text-sm text-gray-500">
							{#if selectedCategory}
								No items in this category. Try selecting a different category or clear the filter.
							{:else if query}
								No items match your search. Try different keywords.
							{:else}
								Get started by adding your first inventory item.
							{/if}
						</p>
						{#if !selectedCategory && !query}
							<button 
								onclick={() => switchTab('add-item')}
								class="mt-4 inline-flex items-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-pink-700"
							>
								<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
								</svg>
								Add Your First Item
							</button>
						{/if}
					</div>
				{:else}
					<div class="overflow-x-auto max-h-[48rem]">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Specification</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tools / Equipment</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Count</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">EOM Count</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variance</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
									<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Condition</th>

								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each displayItems as item, i}
									<tr class="hover:bg-gray-50 cursor-pointer" onclick={() => openModal(item)}>
										<td class="whitespace-nowrap px-6 py-4">
											<div class="flex items-center gap-3">
												<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">{i + 1}</span>
												<div class="text-sm font-medium text-gray-900">{item.name}</div>
											</div>
										</td>
										<td class="whitespace-nowrap px-6 py-4">
											<span class="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">{item.category}</span>
										</td>
										<td class="px-6 py-4 text-sm text-gray-700">{item.specification}</td>
										<td class="px-6 py-4 text-sm text-gray-700">{item.toolsOrEquipment}</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{item.quantity}</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{item.eomCount}</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{item.variance}</td>
										<td class="whitespace-nowrap px-6 py-4">
											{#if item.status === 'Low Stock' || item.status === 'Out of Stock'}
												<span class="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
													<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
														<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
													</svg>
													{item.status}
												</span>
											{:else}
												<span class="inline-flex items-center rounded-full bg-pink-100 px-2 py-1 text-xs font-semibold text-pink-800">
													<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
														<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
													</svg>
													{item.status}
												</span>
											{/if}
										</td>
										<td class="whitespace-nowrap px-6 py-4">
											<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {item.condition === 'Good' ? 'bg-pink-100 text-pink-800' : 'bg-yellow-100 text-yellow-800'}">{item.condition}</span>
										</td>

									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
			
		{:else if activeTab === 'categories'}
			<!-- Categories View -->
			<div class="p-6">
				<div class="mb-6 flex justify-between items-center">
					<h3 class="text-lg font-semibold text-gray-900">Item Categories</h3>
					<button 
						onclick={() => showCategoryModal = true}
						class="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
						disabled={loading}
					>
						<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
						</svg>
						Add Category
					</button>
				</div>
				
				{#if categories.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No categories yet</h3>
						<p class="mt-2 text-sm text-gray-500">Get started by creating your first category to organize your inventory items.</p>
						<button 
							onclick={() => showCategoryModal = true}
							class="mt-4 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
						>
							<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
							</svg>
							Add Your First Category
						</button>
					</div>
				{:else}
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{#each categories as category}
						<div onclick={() => openCategory(category)} class="relative rounded-lg border-2 border-gray-200 p-6 transition-all hover:border-emerald-500 hover:shadow-md cursor-pointer">
							<div class="flex items-center justify-between">
								<div class="flex-1">
									<h4 class="text-lg font-semibold text-gray-900">{category.name}</h4>
									<p class="mt-1 text-sm text-gray-500">{category.itemCount} items</p>
									{#if category.description}
										<p class="mt-1 text-xs text-gray-400">{category.description}</p>
									{/if}
								</div>
								<div class="ml-4 flex items-center gap-3">
									{#if category.picture}
										<img src={category.picture} alt={category.name} class="h-12 w-12 rounded-full object-cover" />
									{:else}
										<span class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-600">
											<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
											</svg>
										</span>
									{/if}
									<!-- Ellipsis Menu -->
									<div class="relative">
										<button
											onclick={(e) => toggleDropdown(category.id, e)}
											class="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
											aria-label="Category options"
										>
											<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
												<path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
											</svg>
										</button>
										{#if openDropdownId === category.id}
											<div class="absolute right-0 mt-2 w-48 rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 z-10">
												<div class="py-1">
													<button
														onclick={(e) => openEditCategory(category, e)}
														class="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors text-left"
													>
														<svg class="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
														</svg>
														Edit Category
													</button>
													<button
														onclick={(e) => deleteCategory(category, e)}
														class="w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left {category.itemCount > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-red-600 hover:bg-red-50'}"
														disabled={category.itemCount > 0}
													>
														<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
														</svg>
														Delete Category
														{#if category.itemCount > 0}
															<span class="ml-auto text-xs">(has items)</span>
														{/if}
													</button>
												</div>
											</div>
										{/if}
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
				{/if}
			</div>

		<!-- Category Creation Modal -->
		{#if showCategoryModal}
			<div class="fixed inset-0 z-50 flex items-center justify-center">
				<div class="fixed inset-0 bg-black/40" aria-hidden="true" onclick={() => showCategoryModal = false}></div>
				<div class="relative z-50 w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
					<h3 class="text-lg font-semibold text-gray-900 mb-4">Add New Category</h3>
					<form onsubmit={handleCreateCategory} class="space-y-4">
						<div>
							<label for="categoryName" class="block text-sm font-medium text-gray-700">Category Name *</label>
							<input
								type="text"
								id="categoryName"
								bind:value={newCategoryName}
								required
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
								placeholder="e.g., Cookware"
							/>
						</div>
						<div>
							<label for="categoryDescription" class="block text-sm font-medium text-gray-700">Description</label>
							<input
								type="text"
								id="categoryDescription"
								bind:value={newCategoryDescription}
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
								placeholder="Optional description"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-2">Category Image</label>
							<div class="flex items-center gap-3">
								<button
									type="button"
									onclick={() => categoryPictureInput?.click()}
									class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
									disabled={uploadingCategoryImage || loading}
								>
									{#if uploadingCategoryImage}
										<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
									{:else}
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M16 3l-4 4-4-4"/></svg>
									{/if}
									Upload Image
								</button>
								<span class="text-sm text-gray-600">{newCategoryPictureFile ? newCategoryPictureFile.name : 'No file chosen'}</span>
								{#if newCategoryPicture}
									<img src={newCategoryPicture} alt="preview" class="h-16 w-auto rounded ml-2" />
									<button type="button" onclick={() => { try { URL.revokeObjectURL(newCategoryPicture) } catch(e){}; newCategoryPicture=''; newCategoryPictureFile=null }} class="ml-2 text-sm text-red-500">Remove</button>
								{/if}
								<input type="file" accept="image/*" onchange={handleCategoryPictureChange} bind:this={categoryPictureInput} class="hidden" />
							</div>
						</div>
						<div class="flex gap-3 pt-4">
							<button
								type="submit"
								class="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
								disabled={loading}
							>
								Create Category
							</button>
							<button
								type="button"
								onclick={() => {
									showCategoryModal = false;
									newCategoryName = '';
									newCategoryDescription = '';
									if (newCategoryPicture && newCategoryPicture.startsWith('blob:')) {
										try { URL.revokeObjectURL(newCategoryPicture); } catch(e){}
									}
									newCategoryPicture = '';
									newCategoryPictureFile = null;
								}}
								class="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>
								Cancel
							</button>
						</div>
					</form>
				</div>
			</div>
		{/if}
			
		<!-- Category Edit Modal -->
		{#if showEditCategoryModal && editingCategory}
			<div class="fixed inset-0 z-50 flex items-center justify-center">
				<div class="fixed inset-0 bg-black/40" aria-hidden="true" onclick={() => showEditCategoryModal = false}></div>
				<div class="relative z-50 w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
					<h3 class="text-lg font-semibold text-gray-900 mb-4">Edit Category</h3>
					<form onsubmit={handleEditCategory} class="space-y-4">
						<div>
							<label for="editCategoryName" class="block text-sm font-medium text-gray-700">Category Name *</label>
							<input
								type="text"
								id="editCategoryName"
								bind:value={newCategoryName}
								required
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
								placeholder="e.g., Cookware"
							/>
						</div>
						<div>
							<label for="editCategoryDescription" class="block text-sm font-medium text-gray-700">Description</label>
							<input
								type="text"
								id="editCategoryDescription"
								bind:value={newCategoryDescription}
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
								placeholder="Optional description"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-2">Category Image</label>
							<div class="flex items-center gap-3">
								<button
									type="button"
									onclick={() => editCategoryPictureInput?.click()}
									class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
									disabled={uploadingCategoryImage || loading}
								>
									{#if uploadingCategoryImage}
										<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
									{:else}
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M16 3l-4 4-4-4"/></svg>
									{/if}
									Upload Image
								</button>
								<span class="text-sm text-gray-600">{newCategoryPictureFile ? newCategoryPictureFile.name : 'No file chosen'}</span>
								{#if newCategoryPicture}
									<img src={newCategoryPicture} alt="preview" class="h-16 w-auto rounded ml-2" />
									<button type="button" onclick={() => { try { if(newCategoryPicture.startsWith('blob:')) URL.revokeObjectURL(newCategoryPicture) } catch(e){}; newCategoryPicture=editingCategory?.picture || ''; newCategoryPictureFile=null }} class="ml-2 text-sm text-red-500">Remove</button>
								{/if}
								<input type="file" accept="image/*" onchange={handleCategoryPictureChange} bind:this={editCategoryPictureInput} class="hidden" />
							</div>
						</div>
						<div class="flex gap-3 pt-4">
							<button
								type="submit"
								class="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
								disabled={loading}
							>
								Update Category
							</button>
							<button
								type="button"
								onclick={() => {
									showEditCategoryModal = false;
									editingCategory = null;
									newCategoryName = '';
									newCategoryDescription = '';
									if (newCategoryPicture && newCategoryPicture.startsWith('blob:')) {
										try { URL.revokeObjectURL(newCategoryPicture); } catch(e){}
									}
									newCategoryPicture = '';
									newCategoryPictureFile = null;
								}}
								class="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>
								Cancel
							</button>
						</div>
					</form>
				</div>
			</div>
		{/if}

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
									<button 
										onclick={() => editItem(item)}
										class="ml-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
									>
										Update Stock
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
					<h3 class="text-lg font-semibold text-gray-900">{editingItemId ? 'Edit Item' : 'Add New Item'}</h3>
					<p class="mt-1 text-sm text-gray-500">Enter details for the {editingItemId ? 'updated' : 'new'} inventory item</p>
				</div>
				
				<form onsubmit={handleAddItem} class="space-y-6 relative">
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
								bind:value={newItem.categoryId}
								onchange={(e) => {
									const target = e.target as HTMLSelectElement;
									const selectedCat = categories.find(c => c.id === target.value);
									if (selectedCat) {
										newItem.category = selectedCat.name;
									}
								}}
								required
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
							>
								<option value="">Select a category</option>
								{#each categories as category}
									<option value={category.id}>{category.name}</option>
								{/each}
							</select>
						</div>
					
						<div>
							<label for="specification" class="block text-sm font-medium text-gray-700">Specification</label>
							<input type="text" id="specification" bind:value={newItem.specification} class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="e.g., Stainless steel, 8-piece" />
						</div>
					
						<div>
							<label for="toolsOrEquipment" class="block text-sm font-medium text-gray-700">Tools / Equipment</label>
							<input type="text" id="toolsOrEquipment" bind:value={newItem.toolsOrEquipment} class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="e.g., Power adapter, Sheath" />
						</div>
					
						<div>
							<label for="quantity" class="block text-sm font-medium text-gray-700">Current Count *</label>
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
							<label for="eomCount" class="block text-sm font-medium text-gray-700">EOM Count</label>
							<input type="number" id="eomCount" bind:value={newItem.eomCount} min="0" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="0" />
						</div>

						<div>
							<label for="minStock" class="block text-sm font-medium text-gray-700">Minimum Stock *</label>
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
							<label for="condition" class="block text-sm font-medium text-gray-700">Condition</label>
							<select id="condition" bind:value={newItem.condition} class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500">
								<option value="Excellent">Excellent</option>
								<option value="Good">Good</option>
								<option value="Fair">Fair</option>
								<option value="Poor">Poor</option>
								<option value="Damaged">Damaged</option>
							</select>
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
					
					</div>

					<!-- Upload control -->
					<div class="md:col-span-2 mt-2 flex items-center justify-end gap-3" aria-live="polite">
						<div class="flex items-center gap-3 bg-white p-2 rounded-md shadow-none">
							<button
								type="button"
								onclick={() => pictureInput?.click()}
								aria-label="Upload item image"
								class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
								disabled={uploadingImage || loading}
							>
								{#if uploadingImage}
									<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
								{:else}
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M16 3l-4 4-4-4"/></svg>
								{/if}
								Upload Image
							</button>
							<span class="text-sm text-gray-600">{newItem.pictureFile ? newItem.pictureFile.name : 'No file chosen'}</span>
							{#if newItem.picture}
								<img src={newItem.picture} alt="preview" class="h-16 w-auto rounded ml-2" />
								<button type="button" onclick={() => { try { URL.revokeObjectURL(newItem.picture) } catch(e){}; newItem.picture=''; newItem.pictureFile=null }} class="ml-2 text-sm text-red-500">Remove</button>
							{/if}
							<input id="picture" type="file" accept="image/*" onchange={handlePictureChange} bind:this={pictureInput} class="hidden" />
						</div>
					</div>

					<div class="flex gap-3 border-t border-gray-200 pt-6">
						<button
							type="submit"
							class="inline-flex items-center rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
							disabled={loading || uploadingImage}
						>
							{#if loading}
								<div class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
							{:else}
								<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
								</svg>
							{/if}
							{editingItemId ? 'Update Item' : 'Add Item'}
						</button>
						<button
							type="button"
							onclick={() => {
								resetForm();
								switchTab('all-items');
							}}
							class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
							disabled={loading}
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		{/if}
	</div>
{/if}
</div>
