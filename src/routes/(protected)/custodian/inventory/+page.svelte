<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import type { InventoryItem, InventoryCategory } from '$lib/api/inventory';
	import { 
		inventoryItemsAPI, 
		inventoryCategoriesAPI, 
		uploadInventoryImage,
		subscribeToInventoryChanges
	} from '$lib/api/inventory';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import { inventoryStore } from '$lib/stores/inventory';
	import InventorySkeletonLoader from '$lib/components/ui/InventorySkeletonLoader.svelte';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	import { Package, FolderTree, AlertTriangle, Star } from 'lucide-svelte';
	
	type Tab = 'all-items' | 'constant-items' | 'categories' | 'low-stock';
	
	let activeTab = $state<Tab>('all-items');
	let showAddItemModal = $state(false);
	
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
		condition: 'Good',
		location: '',
		isConstant: false,
		maxQuantityPerRequest: undefined as number | undefined
	});

	// Editing mode
	let editingItemId = $state<string | null>(null);

	// Import modal state
	let showImportModal = $state(false);
	let importFile = $state<File | null>(null);
	let importPreviewData = $state<any[]>([]);
	let importErrors = $state<string[]>([]);
	let importing = $state(false);
	let importStep = $state<'upload' | 'preview' | 'complete'>('upload');
	let importImageFiles = $state<Map<string, File>>(new Map());
	let importProgress = $state({ current: 0, total: 0, message: '' });
	let isDraggingOver = $state(false);
	let importPreviewImageUrl = $state<string | null>(null); // lightbox for import preview
	let importPreviewImageName = $state<string>('');
	let showFormatGuide = $state(false); // collapsible format guide
	const INVENTORY_FETCH_PAGE_SIZE = 500;
	const IMPORT_BATCH_SIZE = 100;

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
			if (e.key === 'Escape' && showAddItemModal) {
				closeAddItemModal();
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

	// Real-time inventory updates via SSE
	onMount(() => {
		const unsub = subscribeToInventoryChanges(() => {
			inventoryStore.invalidateAll();
			loadItems();
			loadCategories();
		});
		return () => unsub();
	});

	function delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	function normalizeKeyPart(value: string | undefined | null): string {
		return (value || '').toLowerCase().trim();
	}

	function getItemCompositeKey(name: string, specification: string | undefined | null): string {
		return `${normalizeKeyPart(name)}|${normalizeKeyPart(specification)}`;
	}

	function normalizeImportedCondition(value: string | undefined | null): string | null {
		const normalized = normalizeKeyPart(value).replace(/[\s_-]+/g, '');
		if (!normalized) return null;

		if (normalized === 'excellent') return 'Excellent';
		if (normalized === 'good') return 'Good';
		if (normalized === 'fair') return 'Fair';
		if (normalized === 'poor') return 'Poor';
		if (normalized === 'damaged') return 'Damaged';

		return null;
	}

	async function fetchAllInventoryItems(includeArchived = true): Promise<InventoryItem[]> {
		const allItems: InventoryItem[] = [];
		let page = 1;

		while (true) {
			const response = await inventoryItemsAPI.getAll({
				page,
				limit: INVENTORY_FETCH_PAGE_SIZE,
				includeArchived
			});

			allItems.push(...response.items);

			if (page >= response.pages || response.items.length === 0) {
				break;
			}

			page += 1;
		}

		return allItems;
	}

	async function createInventoryItemWithRetry(itemData: any, maxRetries = 5): Promise<InventoryItem> {
		let attempt = 0;

		while (true) {
			try {
				return await inventoryItemsAPI.create(itemData);
			} catch (err: any) {
				const message = err?.message || '';
				const isRateLimited = /429|too many requests/i.test(message);

				if (!isRateLimited || attempt >= maxRetries) {
					throw err;
				}

				const backoffMs = Math.min(8000, 400 * Math.pow(2, attempt));
				await delay(backoffMs);
				attempt += 1;
			}
		}
	}

	async function updateInventoryItemWithRetry(itemId: string, itemData: any, maxRetries = 5): Promise<InventoryItem> {
		let attempt = 0;

		while (true) {
			try {
				return await inventoryItemsAPI.update(itemId, itemData);
			} catch (err: any) {
				const message = err?.message || '';
				const isRateLimited = /429|too many requests/i.test(message);

				if (!isRateLimited || attempt >= maxRetries) {
					throw err;
				}

				const backoffMs = Math.min(8000, 400 * Math.pow(2, attempt));
				await delay(backoffMs);
				attempt += 1;
			}
		}
	}

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

			items = await fetchAllInventoryItems(true);

			// Update cache
			inventoryStore.setItems(items);
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
	const constantItems = $derived(activeItems.filter(item => item.isConstant === true));
	
	function switchTab(tab: Tab) {
		activeTab = tab;
		// Note: Don't auto-clear category filter - use clearCategoryFilter() explicitly
	}

	function openAddItemModal() {
		resetForm();
		showAddItemModal = true;
	}

	function closeAddItemModal() {
		resetForm();
		showAddItemModal = false;
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
const PAGE_SIZE = 10;
let currentPage = $state(1);

const filteredItems = $derived(items.filter(item => {
	const isActive = !item.archived;
	
	// Case-insensitive category matching with trim for robustness
	const matchesCategory = !selectedCategory || 
		(item.category?.toLowerCase().trim() === selectedCategory.name?.toLowerCase().trim());
	
	const q = (query || '').toLowerCase();
	const matchesQuery = !q || (item.name || '').toLowerCase().includes(q);
	return isActive && matchesCategory && matchesQuery;
}));
const sortedItems = $derived([...filteredItems].sort((a, b) => sortOrder === 'az' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
const totalPages = $derived(Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE)));
const displayItems = $derived(sortedItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

// Reset to page 1 when filters change
$effect(() => {
	filteredItems;
	sortOrder;
	currentPage = 1;
});

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
			const updatedItem = await inventoryItemsAPI.update(item.id, { archived: true });

			// Optimistic update: Remove archived item from local array immediately
			const itemIndex = items.findIndex(i => i.id === item.id);
			if (itemIndex !== -1) {
				items.splice(itemIndex, 1);
			}

			// Update category count
			if (item.categoryId) {
				const categoryIndex = categories.findIndex(c => c.id === item.categoryId);
				if (categoryIndex !== -1) {
					categories[categoryIndex] = {
						...categories[categoryIndex],
						itemCount: Math.max(0, categories[categoryIndex].itemCount - 1)
					};
				}
			}

			// Update store with current arrays
			inventoryStore.setItems(items);
			inventoryStore.setCategories(categories);

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
			const wasEditing = !!editingItemId; // Store edit state before async operations

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
				condition: newItem.condition,
				location: newItem.location,
				isConstant: newItem.isConstant,
				maxQuantityPerRequest: newItem.isConstant && newItem.maxQuantityPerRequest 
					? Number(newItem.maxQuantityPerRequest) 
					: undefined
			};

			let savedItem;
			if (wasEditing) {
				// Update existing item
				savedItem = await inventoryItemsAPI.update(editingItemId!, itemData);
				
				// Optimistic update: Update item in local array
				const itemIndex = items.findIndex(i => i.id === editingItemId);
				if (itemIndex !== -1) {
					items[itemIndex] = savedItem;
				}
			} else {
				// Create new item
				savedItem = await inventoryItemsAPI.create(itemData);
				
				// Optimistic update: Add new item to local array immediately
				items = [...items, savedItem];
				
				// Update category count
				if (savedItem.categoryId) {
					const categoryIndex = categories.findIndex(c => c.id === savedItem.categoryId);
					if (categoryIndex !== -1) {
						categories[categoryIndex] = {
							...categories[categoryIndex],
							itemCount: categories[categoryIndex].itemCount + 1
						};
					}
				}
			}

		// Update store with current arrays
		inventoryStore.setItems(items);
		inventoryStore.setCategories(categories);

			closeAddItemModal();
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
			condition: 'Good',
			location: '',
			isConstant: false,
			maxQuantityPerRequest: undefined
		};
		editingItemId = null;
	}

	function editItem(item: InventoryItem) {
		// prefill form and open modal
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
			condition: item.condition,
			location: item.location || '',
			isConstant: item.isConstant || false,
			maxQuantityPerRequest: item.maxQuantityPerRequest
		};
		editingItemId = item.id;
		showAddItemModal = true;
		selectedItem = null;
	}

	function openCategory(category: InventoryCategory) {
		switchTab('all-items');
		selectedCategory = category;
		selectedItem = null;
		console.log('Category filter set to:', category.name);
		console.log('Items in this category:', items.filter(item => 
			!item.archived && item.category?.toLowerCase().trim() === category.name?.toLowerCase().trim()
		).map(i => i.name));
	}

	async function toggleConstantStatus(item: InventoryItem) {
		const newStatus = !item.isConstant;
		
		// Confirm action with user
		const confirmed = await confirmStore.confirm({
			type: newStatus ? 'info' : 'warning',
			title: newStatus ? 'Mark as Constant Item' : 'Remove from Constant Items',
			message: newStatus
				? `Mark "${item.name}" as a constant item? It will always appear on student request forms regardless of availability.`
				: `Remove "${item.name}" from constant items? Students will need to manually add it to their requests.`,
			confirmText: newStatus ? 'Mark as Constant' : 'Remove',
			cancelText: 'Cancel'
		});

		if (!confirmed) {
			return;
		}

		try {
			loading = true;
			const updatedItem = await inventoryItemsAPI.update(item.id, { isConstant: newStatus });

			// Optimistic update: Update item in local array
			const itemIndex = items.findIndex(i => i.id === item.id);
			if (itemIndex !== -1) {
				items[itemIndex] = updatedItem;
			}

			// Update store with current arrays
			inventoryStore.setItems(items);

			toastStore.success(
				newStatus 
					? `"${item.name}" is now a constant item and will always appear on student request forms` 
					: `"${item.name}" removed from constant items`,
				'Constant Item Updated'
			);
		} catch (err: any) {
			toastStore.error(
				err.message || 'Failed to update constant status',
				'Update Failed'
			);
			console.error('Error updating constant status:', err);
		} finally {
			loading = false;
		}
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
			
			// Delete from API
			await inventoryItemsAPI.delete(item.id);

			// Optimistic update: Immediately remove from arrays
			const itemIndex = items.findIndex(i => i.id === item.id);
			if (itemIndex !== -1) {
				items.splice(itemIndex, 1); // Modify array in place for reactivity
			}
			
			// Update category counts
			if (item.categoryId) {
				const categoryIndex = categories.findIndex(c => c.id === item.categoryId);
				if (categoryIndex !== -1) {
					categories[categoryIndex] = { 
						...categories[categoryIndex], 
						itemCount: Math.max(0, categories[categoryIndex].itemCount - 1) 
					};
				}
			}

			// Close modal and show success
			selectedItem = null;
			toastStore.success('Item deleted successfully');

			// Update store with current items array (without deleted item)
			inventoryStore.setItems(items);
			inventoryStore.setCategories(categories);
			
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

			const newCategory = await inventoryCategoriesAPI.create({
				name: newCategoryName,
				description: newCategoryDescription,
				picture: imageUrl
			});

			// Optimistic update: Add new category to local array immediately
			categories = [...categories, newCategory];

			// Update store with current categories
			inventoryStore.setCategories(categories);

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

			const updatedCategory = await inventoryCategoriesAPI.update(editingCategory.id, {
				name: newCategoryName,
				description: newCategoryDescription,
				picture: imageUrl
			});

			// Optimistic update: Update category in local array immediately
			const categoryIndex = categories.findIndex(c => c.id === editingCategory.id);
			if (categoryIndex !== -1) {
				categories[categoryIndex] = updatedCategory;
			}

			// Update store with current categories
			inventoryStore.setCategories(categories);

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

			// Optimistic update: Immediately remove from array
			const categoryIndex = categories.findIndex(c => c.id === category.id);
			if (categoryIndex !== -1) {
				categories.splice(categoryIndex, 1); // Modify array in place for reactivity
			}

			toastStore.success('Category deleted successfully. Recoverable for 30 days from History page.');

			// Update store with current categories
			inventoryStore.setCategories(categories);
			
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to delete category');
			console.error('Error deleting category:', err);
		} finally {
			loading = false;
		}
	}

	// Import functions
	function openImagePreview(item: any) {
		if (!item._hasImage) return;
		if (item._imageSource === 'url') {
			importPreviewImageUrl = item._pictureRef;
			importPreviewImageName = item.name;
		} else {
			const file = importImageFiles.get(item._pictureRef.toLowerCase());
			if (file) {
				// Revoke any previous object URL to avoid memory leaks
				if (importPreviewImageUrl && importPreviewImageUrl.startsWith('blob:')) {
					URL.revokeObjectURL(importPreviewImageUrl);
				}
				importPreviewImageUrl = URL.createObjectURL(file);
				importPreviewImageName = item.name;
			}
		}
	}

	function closeImagePreview() {
		if (importPreviewImageUrl?.startsWith('blob:')) {
			URL.revokeObjectURL(importPreviewImageUrl);
		}
		importPreviewImageUrl = null;
		importPreviewImageName = '';
	}

	function openImportModal() {
		showImportModal = true;
		importStep = 'upload';
		importFile = null;
		importPreviewData = [];
		importErrors = [];
	}

	function closeImportModal() {
		showImportModal = false;
		importPreviewImageUrl = null;
		importPreviewImageName = '';
		importFile = null;
		importPreviewData = [];
		importErrors = [];
		importStep = 'upload';
		importImageFiles = new Map();
		importProgress = { current: 0, total: 0, message: '' };
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	function getFileIcon(fileName: string): string {
		const extension = fileName.toLowerCase().split('.').pop();
		if (extension === 'csv') return 'csv';
		if (extension === 'xlsx' || extension === 'xls') return 'excel';
		if (extension === 'zip') return 'zip';
		return 'file';
	}

	function removeImportFile() {
		importFile = null;
		importPreviewData = [];
		importErrors = [];
		importImageFiles = new Map();
	}

	async function handleImportFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		
		if (!file) return;

		// Validate file type
		const validExtensions = ['.csv', '.xlsx', '.xls', '.zip'];
		const fileName = file.name.toLowerCase();
		const isValid = validExtensions.some(ext => fileName.endsWith(ext));

		if (!isValid) {
			toastStore.error('Please upload a CSV, Excel, or ZIP file (.csv, .xlsx, .xls, .zip)');
			return;
		}

		importFile = file;

		// Handle ZIP files differently
		if (fileName.endsWith('.zip')) {
			await parseZipFile(file);
		} else {
			await parseImportFile(file);
		}
	}

	async function parseZipFile(file: File) {
		try {
			importing = true;
			importErrors = [];
			importPreviewData = [];
			importImageFiles.clear();
			importImageFiles = new Map();

			// Import JSZip dynamically
			const JSZip = (await import('jszip')).default;
			const zip = new JSZip();
			const contents = await zip.loadAsync(file);

			// Find CSV or Excel file
			let dataFile: any = null;
			let dataFileName = '';

			for (const [fileName, zipEntry] of Object.entries(contents.files)) {
				if (!zipEntry.dir && (fileName.toLowerCase().endsWith('.csv') || fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls'))) {
					dataFile = zipEntry;
					dataFileName = fileName;
					break;
				}
			}

			if (!dataFile) {
				importErrors = ['No CSV or Excel file found in ZIP archive'];
				return;
			}

			// Extract images
			for (const [fileName, zipEntry] of Object.entries(contents.files)) {
				if (!zipEntry.dir && /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
					const blob = await zipEntry.async('blob');
					const imageFile = new File([blob], fileName.split('/').pop() || fileName, { type: blob.type || 'image/jpeg' });
					importImageFiles.set(fileName.split('/').pop()?.toLowerCase() || fileName.toLowerCase(), imageFile);
				}
			}

			// Parse data file
			if (dataFileName.toLowerCase().endsWith('.csv')) {
				// Parse CSV
				const csvText = await dataFile.async('text');
				await parseCSVText(csvText);
			} else {
				// Parse all sheets in Excel file
				const XLSX = await import('xlsx');
				const arrayBuffer = await dataFile.async('arraybuffer');
				const workbook = XLSX.read(arrayBuffer, { type: 'array' });

				let appended = false;
				for (const sheetName of workbook.SheetNames) {
					const worksheet = workbook.Sheets[sheetName];
					if (!worksheet || !worksheet['!ref']) continue;

					const xlsxNonEmptyRows = getNonEmptyExcelRows(worksheet, XLSX);
					const csvText = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
					if (!csvText.trim()) continue;

					await parseCSVText(csvText, sheetName, undefined, {
						append: appended,
						silent: true,
						csvLineToExcelRows: xlsxNonEmptyRows
					});
					appended = true;
				}

				if (importPreviewData.length > 0) {
					toastStore.success(`Parsed ${importPreviewData.length} items from ${workbook.SheetNames.length} sheet(s). ${importErrors.length > 0 ? `${importErrors.length} rows have errors.` : 'Click Continue to preview.'}`);
				}
			}

			toastStore.success(`Found ${importImageFiles.size} image(s) in ZIP file`);

		} catch (err: any) {
			importErrors = [`Failed to parse ZIP file: ${err.message}`];
			toastStore.error(`Failed to parse ZIP file: ${err.message}`);
			console.error('ZIP parse error:', err);
		} finally {
			importing = false;
		}
	}

	function getNonEmptyExcelRows(worksheet: any, XLSX: any): number[] {
		const xlsxRowSet = new Set<number>();

		for (const addr of Object.keys(worksheet)) {
			if (addr.startsWith('!')) continue;
			const cell = worksheet[addr];
			if (cell && cell.v !== null && cell.v !== undefined && String(cell.v).trim() !== '') {
				const { r } = XLSX.utils.decode_cell(addr);
				xlsxRowSet.add(r + 1);
			}
		}

		return [...xlsxRowSet].sort((a, b) => a - b);
	}

	async function extractEmbeddedImagesFromExcel(data: ArrayBuffer, sheetName: string): Promise<Map<number, File>> {
		// Returns Map<1-based Excel row number, File>
		// Keyed by the actual row number, NOT a CSV line index.
		// The caller is responsible for correlating to CSV line indices.
		const imagesByRow = new Map<number, File>();

		try {
			const ExcelJS = await import('exceljs');
			const workbook = new ExcelJS.Workbook();
			await workbook.xlsx.load(data);

			const worksheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];
			if (!worksheet || typeof (worksheet as any).getImages !== 'function') {
				return imagesByRow;
			}

			const images = (worksheet as any).getImages() as any[];
			if (!images || images.length === 0) {
				return imagesByRow;
			}

			console.log('Total images found:', images.length);

			for (const img of images) {
				const tl = img?.range?.tl;
				const br = img?.range?.br;
				const tlNativeRow = typeof tl?.nativeRow === 'number' ? tl.nativeRow : tl?.row;
				if (typeof tlNativeRow !== 'number') continue;

				const brNativeRow = typeof br?.nativeRow === 'number' ? br.nativeRow : br?.row;
				// Use vertical center of the image range to reduce off-by-one anchor effects.
				const anchorNativeRow =
					typeof brNativeRow === 'number'
						? Math.floor((tlNativeRow + brNativeRow) / 2)
						: tlNativeRow;

				// ExcelJS nativeRow is 0-based -> convert to 1-based
				const excelRowNumber = anchorNativeRow + 1;

				const imageData = workbook.getImage(img.imageId) as any;
				if (!imageData?.buffer) continue;

				const ext = String(imageData.extension || 'png').toLowerCase();
				const mime = ext === 'jpg' || ext === 'jpeg'
					? 'image/jpeg'
					: ext === 'gif'
						? 'image/gif'
						: ext === 'webp'
							? 'image/webp'
							: 'image/png';

				let bytes: Uint8Array | null = null;
				if (imageData.buffer instanceof Uint8Array) {
					bytes = imageData.buffer;
				} else if (imageData.buffer instanceof ArrayBuffer) {
					bytes = new Uint8Array(imageData.buffer);
				} else if (Array.isArray(imageData.buffer)) {
					bytes = new Uint8Array(imageData.buffer);
				}

				if (!bytes) continue;

				const embeddedFile = new File([bytes], `excel-row-${excelRowNumber}.${ext}`, { type: mime });
				imagesByRow.set(excelRowNumber, embeddedFile);
				console.log(`Image stored for Excel row ${excelRowNumber}`);
			}
		} catch (err) {
			console.warn('Could not extract embedded images from Excel:', err);
		}

		console.log('Images by row:', Array.from(imagesByRow.keys()));
		return imagesByRow;
	}

	async function parseImportFile(file: File) {
		try {
			importing = true;
			importErrors = [];
			importPreviewData = [];
			importImageFiles.clear();

			const fileName = file.name.toLowerCase();

			// Handle Excel files
			if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
				const XLSX = await import('xlsx');

				const data = await file.arrayBuffer();
				const workbook = XLSX.read(data, { type: 'array' });

				let appended = false;
				for (const sheetName of workbook.SheetNames) {
					const worksheet = workbook.Sheets[sheetName];
					if (!worksheet || !worksheet['!ref']) continue;

					const xlsxNonEmptyRows = getNonEmptyExcelRows(worksheet, XLSX);
					console.log(`XLSX non-empty rows (${sheetName}):`, xlsxNonEmptyRows);

					// Extract images keyed by their 1-based Excel row number.
					// Later, parseCSVText resolves each CSV line back to this row number.
					const imagesByExcelRow = await extractEmbeddedImagesFromExcel(data, sheetName);

					// Convert to CSV and parse
					const csvText = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
					if (!csvText.trim()) continue;

					await parseCSVText(csvText, sheetName, imagesByExcelRow, {
						append: appended,
						silent: true,
						csvLineToExcelRows: xlsxNonEmptyRows
					});
					appended = true;
				}

				if (importPreviewData.length > 0) {
					toastStore.success(`Parsed ${importPreviewData.length} items from ${workbook.SheetNames.length} sheet(s). ${importErrors.length > 0 ? `${importErrors.length} rows have errors.` : 'Click Continue to preview.'}`);
				}
			} else {
				// Handle CSV files
				const text = await file.text();
				await parseCSVText(text);
			}
		} catch (err: any) {
			importErrors = [`Failed to parse file: ${err.message}`];
			toastStore.error(`Failed to parse file: ${err.message}`);
			console.error('File parse error:', err);
		} finally {
			importing = false;
		}
	}

	// Drag and drop handlers
	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDraggingOver = true;
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDraggingOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		const target = e.currentTarget as HTMLElement;
		const related = e.relatedTarget as Node;
		if (!target.contains(related)) {
			isDraggingOver = false;
		}
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDraggingOver = false;

		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;

		const file = files[0];

		// Validate file type
		const validExtensions = ['.csv', '.xlsx', '.xls', '.zip'];
		const fileName = file.name.toLowerCase();
		const isValid = validExtensions.some(ext => fileName.endsWith(ext));

		if (!isValid) {
			toastStore.error('Please upload a CSV, Excel, or ZIP file (.csv, .xlsx, .xls, .zip)');
			return;
		}

		importFile = file;

		// Handle ZIP files differently
		if (fileName.endsWith('.zip')) {
			await parseZipFile(file);
		} else {
			await parseImportFile(file);
		}
	}

	async function parseCSVText(
		text: string,
		categoryFromSheet?: string,
		embeddedImagesByExcelRow?: Map<number, File>,
		options?: { append?: boolean; silent?: boolean; csvLineToExcelRows?: number[] }
	) {
		try {
			importing = true;

			const append = options?.append === true;
			const silent = options?.silent === true;
			const existingPreview = append ? importPreviewData : [];
			const existingErrors = append ? importErrors : [];

			if (!append) {
				importErrors = [];
				importPreviewData = [];
			}

			const lines = text
				.split(/\r?\n/)
				.map(line => line.replace(/^\uFEFF/, ''));

			if (lines.length < 2) {
				importErrors = ['File is empty or contains no data rows'];
				toastStore.error('File is empty or contains no data rows');
				return;
			}

			// Parse CSV (handle both comma and semicolon separators)
			const separator = text.includes(';') && !text.includes(',') ? ';' : ',';

			const normalizeHeader = (value: string) =>
				value.trim().toLowerCase().replace(/\s+/g, ' ');

			const isNameHeader = (value: string) => {
				const v = normalizeHeader(value);
				return v === 'name' || v === 'item name' || v === 'item' || v === 'itemname';
			};

			const isKnownHeader = (value: string) => {
				const v = normalizeHeader(value);
				return (
					isNameHeader(v) ||
					v === 'category' ||
					v === 'specification' ||
					v === 'spec' ||
					v === 'tools or equipment' ||
					v === 'tools/equipment' ||
					v === 'tools' ||
					v === 'equipment' ||
					v === 'picture' ||
					v === 'image' ||
					v === 'photo' ||
					v === 'quantity' ||
					v === 'qty' ||
					v === 'count' ||
					v === 'current count' ||
					v === 'eom count' ||
					v === 'condition' ||
					v === 'item condition' ||
					v === 'status' ||
					v === 'location' ||
					v === 'storage location' ||
					v === 'storage' ||
					v === 'min stock' ||
					v === 'minimum stock' ||
					v === 'reorder point' ||
					v === 'reorder level' ||
					v === 'remarks' ||
					v === 'remark' ||
					v === 'notes' ||
					v === 'note' ||
					v === 'variance/overage' ||
					v === 'variance overage'
				);
			};

			let headerLineIndex = -1;
			let rawHeaders: string[] = [];
			let headers: string[] = [];

			// Find the row that looks like a real table header (name + at least one other known header)
			for (let i = 0; i < Math.min(30, lines.length); i++) {
				const candidateRaw = parseCSVLine(lines[i], separator);
				const candidate = candidateRaw.map(normalizeHeader);
				const hasName = candidate.some(isNameHeader);
				const knownCount = candidate.filter(isKnownHeader).length;

				if (hasName && knownCount >= 2) {
					headerLineIndex = i;
					rawHeaders = candidateRaw;
					headers = candidate;
					break;
				}
			}

			if (headerLineIndex === -1) {
				importErrors = ['Could not detect the header row. Ensure one row contains columns like Name, Specification, Current Count.'];
				toastStore.error('Could not detect header row in file');
				return;
			}

			const dataLineIndexes = Array.from(
				{ length: lines.length - (headerLineIndex + 1) },
				(_, offset) => headerLineIndex + 1 + offset
			).filter(lineIndex => {
				const values = parseCSVLine(lines[lineIndex], separator);
				return values.length > 0 && values.some(v => v.trim() !== '');
			});

			const nonEmptyLineIndexes = Array.from({ length: lines.length }, (_, lineIndex) => lineIndex).filter(lineIndex => {
				const values = parseCSVLine(lines[lineIndex], separator);
				return values.length > 0 && values.some(v => v.trim() !== '');
			});

			const lineIndexToNonEmptyPosition = new Map<number, number>();
			nonEmptyLineIndexes.forEach((lineIndex, position) => {
				lineIndexToNonEmptyPosition.set(lineIndex, position);
			});

			if (dataLineIndexes.length === 0) {
				importErrors = ['File is empty or contains no data rows'];
				toastStore.error('File is empty or contains no data rows');
				return;
			}

			const headerMap: Record<string, number> = {};
			headers.forEach((header, index) => {
				if (isNameHeader(header) && headerMap.name === undefined) {
					headerMap.name = index;
				} else if ((header === 'category' || header.includes('category')) && headerMap.category === undefined) {
					headerMap.category = index;
				} else if ((header === 'eom count' || header.replace(/\s+/g, '') === 'eomcount') && headerMap.eomcount === undefined) {
					headerMap.eomcount = index;
				} else if (
					(header === 'current count' || header.replace(/\s+/g, '') === 'currentcount' || header === 'quantity' || header === 'qty' || header === 'count') &&
					headerMap.quantity === undefined
				) {
					headerMap.quantity = index;
				} else if ((header === 'specification' || header === 'spec') && headerMap.specification === undefined) {
					headerMap.specification = index;
				} else if (
					(header === 'tools or equipment' || header === 'tools/equipment' || header === 'tools' || header === 'equipment') &&
					headerMap.toolsorequipment === undefined
				) {
					headerMap.toolsorequipment = index;
				} else if ((header === 'picture' || header === 'image' || header === 'photo') && headerMap.picture === undefined) {
					headerMap.picture = index;
				} else if ((header === 'remarks' || header === 'remark' || header === 'notes' || header === 'note') && headerMap.remarks === undefined) {
					headerMap.remarks = index;
				} else if ((header === 'condition' || header === 'item condition' || header === 'status') && headerMap.condition === undefined) {
					headerMap.condition = index;
				} else if ((header === 'location' || header === 'storage location' || header === 'storage') && headerMap.location === undefined) {
					headerMap.location = index;
				} else if (
					(header === 'min stock' || header === 'minimum stock' || header === 'reorder point' || header === 'reorder level') &&
					headerMap.minstock === undefined
				) {
					headerMap.minstock = index;
				}
			});

			if (headerMap.name === undefined) {
				importErrors = [`Missing required column: Name (found: ${rawHeaders.join(', ')})`];
				toastStore.error('Missing required column: Name');
				return;
			}
		
		const parsedData: any[] = [...existingPreview];
		const errors: string[] = [...existingErrors];
		const consumedEmbeddedImageRows = new Set<number>();
		const seenKeys = new Set<string>(
			existingPreview.map((row: any) => getItemCompositeKey(row.name, row.specification))
		); // track name+specification composites across the full import preview

		// Start from the line after the header row
		for (let i = headerLineIndex + 1; i < lines.length; i++) {
			const values = parseCSVLine(lines[i], separator);
			const nonEmptyPosition = lineIndexToNonEmptyPosition.get(i);
			const sourceRowNumber =
				typeof nonEmptyPosition === 'number'
					? options?.csvLineToExcelRows?.[nonEmptyPosition] ?? i + 1
					: i + 1;
			
			// Skip completely empty lines
			if (values.length === 0 || values.every(v => !v.trim())) {
				continue;
			}

			// Extract values using header map
			const valueAt = (key: string) => {
				const idx = headerMap[key];
				return idx !== undefined ? values[idx]?.trim() || '' : '';
			};

			const name = valueAt('name');
			const rawCategory = valueAt('category');
			const quantityValue = valueAt('quantity');
			const specification = valueAt('specification');
			const toolsorequipment = valueAt('toolsorequipment');
			const eomcount = valueAt('eomcount');
			const minStockValue = valueAt('minstock');
			const conditionValue = valueAt('condition');
			const locationValue = valueAt('location');
			let pictureRef = valueAt('picture');
			const remarks = valueAt('remarks');
			const category = categoryFromSheet || rawCategory;

			const providedFlags = {
				category: !!categoryFromSheet || (headerMap['category'] !== undefined && rawCategory !== ''),
				quantity: headerMap['quantity'] !== undefined && quantityValue !== '',
				specification: headerMap['specification'] !== undefined && specification !== '',
				toolsOrEquipment: headerMap['toolsorequipment'] !== undefined && toolsorequipment !== '',
				eomCount: headerMap['eomcount'] !== undefined && eomcount !== '',
				minStock: headerMap['minstock'] !== undefined && minStockValue !== '',
				condition: headerMap['condition'] !== undefined && conditionValue !== '',
				location: headerMap['location'] !== undefined && locationValue !== '',
				picture: headerMap['picture'] !== undefined && pictureRef !== '',
				remarks: headerMap['remarks'] !== undefined && remarks !== ''
			};

			// Skip rows without a name - they're not valid items
			if (!name || name.trim() === '') {
				errors.push(`Row ${sourceRowNumber}: Name is required`);
				console.log(`Skipping source row ${sourceRowNumber}: No name found`);
				continue;
			}

			// Validate row
			const rowErrors: string[] = [];
			if (!category) rowErrors.push('Category is required (use sheet name or Category column)');

			// Check for duplicate using name+specification composite (same name with different spec = different item)
			const nameLower = normalizeKeyPart(name);
			const specLower = normalizeKeyPart(specification);
			const compositeKey = getItemCompositeKey(name, specification);
			const isDuplicateInFile = seenKeys.has(compositeKey);
			if (isDuplicateInFile) {
				rowErrors.push('Duplicate: same name and specification appears earlier in this file');
			}
			seenKeys.add(compositeKey);

			// Check if item already exists in inventory (same name + same spec, case-insensitive).
			// Existing items are allowed and will be updated during import.
			const existingInventoryItem = items.find(
				i => i.name.toLowerCase().trim() === nameLower &&
				     (i.specification ?? '').toLowerCase().trim() === specLower
			);
			const alreadyExistsInInventory = !!existingInventoryItem;

			// Parse quantity - default to 1 if not provided
			const quantity = providedFlags.quantity ? parseInt(quantityValue, 10) : 1;
			if (providedFlags.quantity && (isNaN(quantity) || quantity < 0)) {
				rowErrors.push('Quantity/Current Count must be a valid number');
			}

			const parsedEomCount = providedFlags.eomCount ? parseInt(eomcount, 10) : 0;
			if (providedFlags.eomCount && (isNaN(parsedEomCount) || parsedEomCount < 0)) {
				rowErrors.push('EOM Count must be a valid number');
			}

			const parsedMinStock = providedFlags.minStock ? parseInt(minStockValue, 10) : 0;
			if (providedFlags.minStock && (isNaN(parsedMinStock) || parsedMinStock < 0)) {
				rowErrors.push('Min Stock must be a valid number');
			}

			const parsedCondition = providedFlags.condition ? normalizeImportedCondition(conditionValue) : 'Good';
			if (providedFlags.condition && !parsedCondition) {
				rowErrors.push('Condition must be one of: Excellent, Good, Fair, Poor, Damaged');
			}

			const parsedLocation = providedFlags.location ? locationValue : '';

			// Handle Picture column - support URL or filename
			let hasImage = false;
			let imageSource = '';

			// Check for embedded Excel images using actual Excel row numbers.
			const excelRowForLine =
				typeof nonEmptyPosition === 'number'
					? options?.csvLineToExcelRows?.[nonEmptyPosition]
					: undefined;
			console.log(
				`Checking embedded image for CSV line ${i} (Excel row: ${excelRowForLine ?? 'unknown'}) item "${name}"`
			);
			if (!pictureRef && embeddedImagesByExcelRow && typeof excelRowForLine === 'number') {
				let resolvedImageRow: number | null = null;
				const candidateRows = [excelRowForLine];

				for (const candidateRow of candidateRows) {
					if (
						embeddedImagesByExcelRow.has(candidateRow) &&
						!consumedEmbeddedImageRows.has(candidateRow)
					) {
						resolvedImageRow = candidateRow;
						break;
					}
				}

				if (resolvedImageRow !== null) {
					const embeddedFile = embeddedImagesByExcelRow.get(resolvedImageRow);
					if (embeddedFile) {
						const embeddedKey = `excel_row_${excelRowForLine}_${embeddedFile.name}`;
						importImageFiles.set(embeddedKey.toLowerCase(), embeddedFile);
						pictureRef = embeddedKey;
						hasImage = true;
						imageSource = 'excel';
						consumedEmbeddedImageRows.add(resolvedImageRow);
						console.log(
							`✓ Found embedded image for "${name}" at Excel row ${resolvedImageRow} (resolved for line row ${excelRowForLine})`
						);
					}
				} else {
					console.log(
						`✗ No embedded image found for Excel row ${excelRowForLine} (available keys: ${Array.from(embeddedImagesByExcelRow.keys()).join(', ')})`
					);
				}
			} else if (!pictureRef && embeddedImagesByExcelRow) {
				console.log(
					`✗ No row mapping available for CSV line ${i} (available embedded keys: ${Array.from(embeddedImagesByExcelRow.keys()).join(', ')})`
				);
			}

				if (pictureRef) {
					// Check if it's a URL
					if (pictureRef.startsWith('http://') || pictureRef.startsWith('https://')) {
						hasImage = true;
						imageSource = 'url';
					} 
					// Check if it matches an uploaded image file
					else if (importImageFiles.has(pictureRef.toLowerCase())) {
						hasImage = true;
						imageSource = pictureRef.toLowerCase().startsWith('excel_row_') ? 'excel' : 'zip';
					}
					// Check with common extensions
					else {
						const withExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
							.map(ext => pictureRef + ext)
						.find(fileName => importImageFiles.has(fileName.toLowerCase()));
					
					if (withExt) {
						pictureRef = withExt;
						hasImage = true;
						imageSource = 'zip';
					}
				}
			}

			const normalizedCategory = normalizeKeyPart(category);
			const normalizedTools = normalizeKeyPart(toolsorequipment || '');
			const normalizedLocation = normalizeKeyPart(parsedLocation);

			const changedFields: string[] = [];
			let importAction: 'create' | 'update' | 'no-change' | 'error' = rowErrors.length > 0 ? 'error' : 'create';

			if (existingInventoryItem && rowErrors.length === 0) {
				if (providedFlags.category && normalizeKeyPart(existingInventoryItem.category) !== normalizedCategory) changedFields.push('category');
				if (providedFlags.toolsOrEquipment && normalizeKeyPart(existingInventoryItem.toolsOrEquipment || '') !== normalizedTools) changedFields.push('tools/equipment');
				if (providedFlags.quantity && (existingInventoryItem.quantity ?? 0) !== quantity) changedFields.push('quantity');
				if (providedFlags.eomCount && (existingInventoryItem.eomCount ?? 0) !== parsedEomCount) changedFields.push('eomCount');
				if (providedFlags.minStock && (existingInventoryItem.minStock ?? 0) !== parsedMinStock) changedFields.push('minStock');
				if (providedFlags.condition && normalizeKeyPart(existingInventoryItem.condition || '') !== normalizeKeyPart(parsedCondition || '')) changedFields.push('condition');
				if (providedFlags.location && normalizeKeyPart(existingInventoryItem.location || '') !== normalizedLocation) changedFields.push('location');
				if (existingInventoryItem.archived) changedFields.push('archived->active');

				if (hasImage) {
					if (imageSource === 'url') {
						if ((existingInventoryItem.picture || '') !== pictureRef) changedFields.push('picture');
					} else {
						// ZIP/Excel images are uploaded to a new URL, so treat as a picture update.
						changedFields.push('picture');
					}
				}

				importAction = changedFields.length > 0 ? 'update' : 'no-change';
			}

			const rowData: any = {
				name: name,
				category: category,
				quantity: quantity,
				specification: specification || '',
				toolsOrEquipment: toolsorequipment || '',
				eomCount: providedFlags.eomCount ? parsedEomCount : undefined,
				minStock: providedFlags.minStock ? parsedMinStock : 0,
				remarks: remarks || '',
				condition: parsedCondition || 'Good',
				location: parsedLocation,
				_rowNumber: sourceRowNumber,
				_errors: rowErrors,
				_valid: rowErrors.length === 0,
				_pictureRef: pictureRef,
				_hasImage: hasImage,
				_imageSource: imageSource,
				_categoryExists: !!categories.find(c => c.name.toLowerCase().trim() === (category || '').toLowerCase().trim()),
				_isDuplicateInFile: isDuplicateInFile,
				_alreadyExists: alreadyExistsInInventory,
				_existingItemId: existingInventoryItem?.id,
				_importAction: importAction,
				_changedFields: changedFields,
				_provided: providedFlags
			};

			parsedData.push(rowData);

			if (rowErrors.length > 0) {
				errors.push(`Row ${sourceRowNumber}: ${rowErrors.join(', ')}`);
			}
		}

		importPreviewData = parsedData;
		importErrors = errors;

		// Show success toast
		if (parsedData.length > 0 && !silent) {
			toastStore.success(`Parsed ${parsedData.length} items. ${errors.length > 0 ? `${errors.length} rows have errors.` : 'Click Continue to preview.'}`);
		}

		} catch (err: any) {
			importErrors = [`Failed to parse file: ${err.message}`];
			toastStore.error(`Failed to parse file: ${err.message}`);
			console.error('Import parse error:', err);
		} finally {
			importing = false;
		}
	}

	function parseCSVLine(line: string, separator: string): string[] {
		const result: string[] = [];
		let current = '';
		let inQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			const nextChar = line[i + 1];

			if (char === '"') {
				if (inQuotes && nextChar === '"') {
					current += '"';
					i++; // Skip next quote
				} else {
					inQuotes = !inQuotes;
				}
			} else if (char === separator && !inQuotes) {
				result.push(current);
				current = '';
			} else {
				current += char;
			}
		}

		result.push(current);
		return result;
	}

	async function handleImportConfirm() {
		const validItems = importPreviewData.filter(item => item._valid);
		const actionableItems = importPreviewData.filter(
			item => item._importAction === 'create' || item._importAction === 'update'
		);
		const noChangeCount = importPreviewData.filter(item => item._importAction === 'no-change').length;

		if (validItems.length === 0) {
			toastStore.error('No valid items to import');
			return;
		}

		if (actionableItems.length === 0) {
			toastStore.info('No changes detected. All valid rows already match existing inventory.');
			return;
		}

		const confirmed = await confirmStore.warning(
			`Apply ${actionableItems.length} change${actionableItems.length > 1 ? 's' : ''}? ${noChangeCount > 0 ? `${noChangeCount} row(s) have no changes.` : ''} ${importErrors.length > 0 ? `${importErrors.length} row(s) will be skipped due to errors.` : ''}`.trim(),
			'Confirm Import',
			'Import',
			'Cancel'
		);

		if (!confirmed) return;

		try {
			importing = true;
			importProgress.total = validItems.length;
			importProgress.current = 0;
			let createdCount = 0;
			let updatedCount = 0;
			let failCount = 0;

			console.log('=== IMPORT START ===');
			console.log('Items to import:', validItems.length);
			console.log('Items before import:', items.length);
			console.log('Available categories:', categories.map(c => c.name));

			// Collect unique categories from import data
			const uniqueCategories = [...new Set(validItems.map(item => item.category))];
			console.log('Unique categories in import:', uniqueCategories);

			// Create missing categories first
			const categoryMap = new Map<string, InventoryCategory>();
			
			for (const categoryName of uniqueCategories) {
				const existing = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
				if (existing) {
					categoryMap.set(categoryName.toLowerCase(), existing);
					console.log(`Category "${categoryName}" exists:`, existing.id);
				} else {
					// Create new category
					try {
						importProgress.message = `Creating category: ${categoryName}...`;
						const newCategory = await inventoryCategoriesAPI.create({ 
							name: categoryName,
							description: `Auto-created from import`
						});
						categories.push(newCategory);
						categoryMap.set(categoryName.toLowerCase(), newCategory);
						console.log(`Created category "${categoryName}":`, newCategory.id);
						toastStore.success(`Created category: ${categoryName}`);
					} catch (err: any) {
						console.error(`Failed to create category "${categoryName}":`, err);
						toastStore.error(`Failed to create category: ${categoryName}`);
					}
				}
			}

			const existingItemsByKey = new Map<string, InventoryItem>();
			for (const existingItem of items) {
				existingItemsByKey.set(
					getItemCompositeKey(existingItem.name, existingItem.specification),
					existingItem
				);
			}

			const preparedCreateItems: Array<{ rowNumber: number; name: string; data: any }> = [];
			const preparedUpdateItems: Array<{ rowNumber: number; name: string; id: string; data: any }> = [];

			for (const item of validItems) {
				try {
					importProgress.current++;
					importProgress.message = `Preparing ${item.name} (${importProgress.current}/${importProgress.total})`;

					// Get category from map (already exists or just created)
					const category = categoryMap.get(item.category.toLowerCase());

					console.log(`Importing: "${item.name}" → Category: "${item.category}" (ID: ${category?.id || 'NONE'})`);
					console.log(`  Full item data:`, item);

					// Handle image upload
					let pictureUrl = '';
					
					if (item._hasImage) {
						if (item._imageSource === 'url') {
							// Validate URL format
							try {
								new URL(item._pictureRef);
								pictureUrl = item._pictureRef;
							} catch {
								console.warn(`Invalid image URL for ${item.name}: ${item._pictureRef}`);
							}
						} else if (item._imageSource === 'zip' || item._imageSource === 'excel') {
							// Upload image from local file (ZIP or embedded Excel image)
							const imageFile = importImageFiles.get(item._pictureRef.toLowerCase());
							if (imageFile) {
								try {
									importProgress.message = `Uploading image for ${item.name}...`;
									const uploadResult = await uploadInventoryImage(imageFile);
									pictureUrl = uploadResult.url;
								} catch (err: any) {
									console.error(`Failed to upload image for ${item.name}:`, err);
								}
							}
						}
					}

					const itemData = {
						name: item.name,
						category: category?.name || item.category,
						categoryId: category?.id,
						specification: item.specification || '',
						toolsOrEquipment: item.toolsOrEquipment || '',
						quantity: item.quantity,
						eomCount: item.eomCount,
						minStock: item.minStock,
						condition: item.condition,
						location: item.location || ''
					};

					const importKey = getItemCompositeKey(itemData.name, itemData.specification);
					const existingItem = existingItemsByKey.get(importKey);

					if (existingItem) {
						const updateData: any = {};
						const provided = item._provided || {};

						if (provided.category && (existingItem.category || '') !== (itemData.category || '')) updateData.category = itemData.category;
						if (provided.category && (existingItem.categoryId || '') !== (itemData.categoryId || '')) updateData.categoryId = itemData.categoryId;
						if (provided.toolsOrEquipment && (existingItem.toolsOrEquipment || '') !== (itemData.toolsOrEquipment || '')) updateData.toolsOrEquipment = itemData.toolsOrEquipment;
						if (provided.quantity && (existingItem.quantity ?? 0) !== (itemData.quantity ?? 0)) updateData.quantity = itemData.quantity;
						if (provided.eomCount && (existingItem.eomCount ?? 0) !== (itemData.eomCount ?? 0)) updateData.eomCount = itemData.eomCount;
						if (provided.minStock && (existingItem.minStock ?? 0) !== (itemData.minStock ?? 0)) updateData.minStock = itemData.minStock;
						if (provided.condition && (existingItem.condition || '') !== (itemData.condition || '')) updateData.condition = itemData.condition;
						if (provided.location && (existingItem.location || '') !== (itemData.location || '')) updateData.location = itemData.location;

						if (existingItem.archived) {
							updateData.archived = false;
						}

						// Replace image only when a new image is provided and is different.
						if (pictureUrl && pictureUrl !== existingItem.picture) {
							updateData.picture = pictureUrl;
							updateData.replacePicture = true;
						}

						if (Object.keys(updateData).length > 0) {
							preparedUpdateItems.push({
								rowNumber: item._rowNumber,
								name: itemData.name,
								id: existingItem.id,
								data: updateData
							});
						}
					} else {
						preparedCreateItems.push({
							rowNumber: item._rowNumber,
							name: itemData.name,
							data: {
								...itemData,
								picture: pictureUrl
							}
						});
					}
				} catch (err: any) {
					console.error(`Failed to import row ${item._rowNumber}:`, err);
					failCount++;
				}
			}

			for (const entry of preparedUpdateItems) {
				try {
					importProgress.message = `Updating ${entry.name}...`;
					await updateInventoryItemWithRetry(entry.id, entry.data);
					updatedCount++;
				} catch (updateErr: any) {
					console.error(`Failed to update row ${entry.rowNumber} (${entry.name}):`, updateErr);
					failCount++;
				}
			}

			for (let i = 0; i < preparedCreateItems.length; i += IMPORT_BATCH_SIZE) {
				const batch = preparedCreateItems.slice(i, i + IMPORT_BATCH_SIZE);
				const batchNumber = Math.floor(i / IMPORT_BATCH_SIZE) + 1;
				const totalBatches = Math.ceil(preparedCreateItems.length / IMPORT_BATCH_SIZE);
				importProgress.message = `Creating batch ${batchNumber}/${totalBatches}...`;

				try {
					const response = await inventoryItemsAPI.bulkCreate({
						items: batch.map(entry => entry.data)
					});

					createdCount += response.createdCount;
					failCount += response.failedCount;

					if (response.failures.length > 0) {
						for (const failure of response.failures) {
							const failedItem = batch[failure.index];
							console.error(
								`Failed to import row ${failedItem?.rowNumber ?? '?'} (${failedItem?.name ?? 'unknown'}): ${failure.error}`
							);
						}
					}
				} catch (batchErr: any) {
					console.error(`Bulk batch ${batchNumber} failed, falling back to per-item import`, batchErr);

					for (const entry of batch) {
						try {
							await createInventoryItemWithRetry(entry.data);
							createdCount++;
						} catch (singleErr: any) {
							console.error(`Fallback failed for row ${entry.rowNumber} (${entry.name}):`, singleErr);
							failCount++;
						}
					}
				}
			}

			console.log('=== IMPORT COMPLETE ===');
			const successCount = createdCount + updatedCount;
			console.log(`Created: ${createdCount}, Updated: ${updatedCount}, Failed: ${failCount}`);

			if (successCount > 0) {
				console.log('Reloading inventory data...');

				// Complete cache reset
				inventoryStore.reset();
				
				// Clear all filters
				selectedCategory = null;
				query = '';
				
				// Delay to ensure database writes are fully committed
				await new Promise(resolve => setTimeout(resolve, 800));
				
				// Force complete reload with direct API calls
				try {
					console.log('Items before reload:', items.length);
					loading = true;
					
					// Direct API calls bypassing cache
					console.log('Fetching from API...');
					const [allFetchedItems, categoriesResponse] = await Promise.all([
						fetchAllInventoryItems(true),
						inventoryCategoriesAPI.getAll({ limit: 1000, includeArchived: true })
					]);
					
					console.log('API Response - Items:', allFetchedItems.length);
					console.log('API Response - Categories:', categoriesResponse);
					
					items = allFetchedItems;
					categories = categoriesResponse.categories;
					
					// Update store cache
					inventoryStore.setItems(allFetchedItems);
					inventoryStore.setCategories(categoriesResponse.categories);
					
					console.log('Items after reload:', items.length);
					console.log('Categories after reload:', categories.length);
					console.log('All items:', items.map(i => ({ name: i.name, archived: i.archived, category: i.category })));
					console.log('Active items:', items.filter(item => !item.archived).map(item => item.name));
				} catch (reloadErr: any) {
					console.error('Failed to reload after import:', reloadErr);
					toastStore.error('Import succeeded but failed to refresh. Please reload the page.');
				} finally {
					loading = false;
				}
			}

			importStep = 'complete';
			importProgress.message = 'Import complete!';
			
			if (failCount === 0) {
				toastStore.success(`Import complete: ${createdCount} created, ${updatedCount} updated`);
			} else {
				toastStore.warning(`Import complete: ${createdCount} created, ${updatedCount} updated, ${failCount} failed`);
			}

			// Switch to all items tab to show results
			switchTab('all-items');

			// Close modal after delay
			setTimeout(() => {
				closeImportModal();
			}, 2000);

		} catch (err: any) {
			toastStore.error('Import failed: ' + err.message);
			console.error('Import error:', err);
		} finally {
			importing = false;
			importProgress = { current: 0, total: 0, message: '' };
		}
	}

	function downloadTemplate() {
		const template = `Name,Specification,Tools or Equipment,Picture,Current Count,EOM Count,Remarks
Chef Knife,8-inch stainless steel,Knife sheath,https://example.com/knife.jpg,10,10,Sharp and ready
Mixing Bowl,Stainless steel 5L,,,5,5,Good condition
Kitchen Stove,4-burner with oven,Gas regulator,,2,2,Station 1`;

		const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = 'inventory_import_template.csv';
		link.click();
		URL.revokeObjectURL(link.href);
		
		toastStore.success('Template downloaded! Name your Excel sheet tab as the category (e.g., "Hot Kitchen")');
	}
</script>

<svelte:head>
	<title>Inventory Management - CHTM Cooks</title>
</svelte:head>

<div class="w-full min-w-0 space-y-4">
	<!-- Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Inventory Management</h1>
			<p class="mt-1 text-sm text-gray-500">Manage kitchen laboratory inventory and stock levels</p>
		</div>

		<!-- Item Details Modal -->
		{#if selectedItem}
			<div class="fixed inset-0 z-50 overflow-y-auto">
				<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onclick={closeModal} aria-label="Close modal" tabindex="-1"></button>
				<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
					<div class="relative w-full max-w-2xl sm:max-w-4xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl animate-scaleIn overflow-hidden mx-0 sm:mx-auto">
						
						<!-- Header -->
						<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
							<div class="px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
								<div class="flex items-start gap-3 sm:gap-4">
									<!-- Item Image as Icon -->
									{#if selectedItem.picture}
										<button
											type="button"
											onclick={openFullImage}
											class="relative cursor-zoom-in transition-all group shrink-0"
											title="Click to view full size"
										>
											<div class="relative h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16">
												<img 
													src={selectedItem.picture} 
													alt={selectedItem.name} 
													class="h-full w-full rounded-xl sm:rounded-2xl object-cover shadow-lg ring-2 ring-pink-200" 
													loading="lazy" 
												/>
												<div class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors rounded-xl sm:rounded-2xl">
													<svg class="h-4 w-4 sm:h-5 sm:w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/>
													</svg>
												</div>
											</div>
										</button>
									{:else}
										<div class="flex h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30">
											<svg class="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
											</svg>
										</div>
									{/if}
									
									<div class="min-w-0 flex-1">
										<h2 class="text-base font-bold text-gray-900 sm:text-lg lg:text-xl">{selectedItem.name}</h2>
										<p class="mt-0.5 text-xs text-gray-500 sm:text-sm">{selectedItem.category}</p>
										<div class="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
											<span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 sm:px-2.5 sm:py-1 shadow-sm ring-1 ring-black/5 {
												selectedItem.status === 'In Stock' ? 'bg-green-100 text-green-800' :
												selectedItem.status === 'Low Stock' ? 'bg-amber-100 text-amber-800' :
												'bg-red-100 text-red-800'
											}">
												<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
												<span class="text-[10px] font-bold sm:text-xs">{selectedItem.status}</span>
											</span>
											{#if selectedItem.isConstant}
												<span class="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 sm:px-2.5 sm:py-1 text-purple-800 shadow-sm ring-1 ring-purple-200">
													<Star class="h-2.5 w-2.5 sm:h-3 sm:w-3 fill-current" />
													<span class="text-[10px] font-bold sm:text-xs">Constant</span>
												</span>
											{/if}
										</div>
									</div>

									<button 
										onclick={closeModal}
										aria-label="Close modal"
										class="rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 shrink-0"
									>
										<svg class="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
										</svg>
									</button>
								</div>
							</div>
						</div>
						
						<!-- Content -->
						<div class="max-h-[calc(100vh-180px)] sm:max-h-[70vh] overflow-y-auto">
							<div class="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
								<div class="space-y-5 sm:space-y-6 lg:space-y-8">
									
									<!-- Item Details -->
									<div>
										<h3 class="mb-3 sm:mb-4 flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-900">
											<div class="h-1 w-1 rounded-full bg-pink-500"></div>
											Item Details
										</h3>
										<div class="grid grid-cols-2 gap-2 lg:gap-3">
											<div class="group rounded-lg sm:rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
												<div class="flex items-center gap-1.5 mb-1.5 sm:mb-2">
													<svg class="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
													</svg>
													<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Category</p>
												</div>
												<p class="text-xs sm:text-sm font-bold text-gray-900 truncate">{selectedItem.category}</p>
											</div>

											<div class="group rounded-lg sm:rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
												<div class="flex items-center gap-1.5 mb-1.5 sm:mb-2">
													<svg class="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
													</svg>
													<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Specification</p>
												</div>
												<p class="text-xs sm:text-sm font-bold text-gray-900 truncate">{selectedItem.specification || '—'}</p>
											</div>

											<div class="group rounded-lg sm:rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
												<div class="flex items-center gap-1.5 mb-1.5 sm:mb-2">
													<svg class="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
													</svg>
													<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Tools / Equipment</p>
												</div>
												<p class="text-xs sm:text-sm font-bold text-gray-900 truncate">{selectedItem.toolsOrEquipment || '—'}</p>
											</div>

											<div class="group rounded-lg sm:rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
												<div class="flex items-center gap-1.5 mb-1.5 sm:mb-2">
													<svg class="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
													</svg>
													<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Location</p>
												</div>
												<p class="text-xs sm:text-sm font-bold text-gray-900 truncate">{selectedItem.location || '—'}</p>
											</div>

											<div class="group rounded-lg sm:rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
												<div class="flex items-center gap-1.5 mb-1.5 sm:mb-2">
													<svg class="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
													</svg>
													<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Condition</p>
												</div>
												<p class="text-xs sm:text-sm font-bold text-gray-900 truncate">{selectedItem.condition}</p>
											</div>

											<div class="group rounded-lg sm:rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
												<div class="flex items-center gap-1.5 mb-1.5 sm:mb-2">
													<svg class="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
													</svg>
													<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Status</p>
												</div>
												<p class="text-xs sm:text-sm font-bold text-gray-900 truncate">{selectedItem.status}</p>
											</div>
										</div>
									</div>

									<!-- Stock Information -->
									<div>
										<h3 class="mb-3 sm:mb-4 flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-900">
											<div class="h-1 w-1 rounded-full bg-pink-500"></div>
											Stock Information
										</h3>
										<div class="grid grid-cols-2 gap-2 lg:gap-3">
<div class="group rounded-lg sm:rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-2.5 sm:p-3 lg:p-4 transition-all hover:border-pink-200 hover:shadow-md">
											<div class="flex items-center gap-1 sm:gap-1.5 mb-1 sm:mb-1.5">
												<div class="flex h-5 w-5 sm:h-6 sm:w-6 lg:h-8 lg:w-8 shrink-0 items-center justify-center rounded-md sm:rounded-lg bg-blue-100">
													<svg class="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
													</svg>
												</div>
												<p class="text-[8px] sm:text-[9px] lg:text-xs font-bold uppercase tracking-tight text-gray-500 leading-tight">Current</p>
											</div>
											<p class="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">{selectedItem.quantity}</p>
											</div>

<div class="group rounded-lg sm:rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-2.5 sm:p-3 lg:p-4 transition-all hover:border-pink-200 hover:shadow-md">
											<div class="flex items-center gap-1 sm:gap-1.5 mb-1 sm:mb-1.5">
												<div class="flex h-5 w-5 sm:h-6 sm:w-6 lg:h-8 lg:w-8 shrink-0 items-center justify-center rounded-md sm:rounded-lg bg-purple-100">
													<svg class="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
													</svg>
												</div>
												<p class="text-[8px] sm:text-[9px] lg:text-xs font-bold uppercase tracking-tight text-gray-500 leading-tight">EOM</p>
											</div>
											<p class="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">{selectedItem.eomCount}</p>
											</div>

											<div class="group rounded-lg sm:rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-2.5 sm:p-3 lg:p-4 transition-all hover:border-pink-200 hover:shadow-md">
												<div class="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
													<div class="flex h-7 w-7 sm:h-8 sm:w-8 lg:h-10 lg:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl {
														selectedItem.variance > 0 ? 'bg-green-100' :
														selectedItem.variance < 0 ? 'bg-red-100' :
														'bg-gray-100'
													}">
														<svg class="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 {
															selectedItem.variance > 0 ? 'text-green-600' :
															selectedItem.variance < 0 ? 'text-red-600' :
															'text-gray-600'
														}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/>
														</svg>
													</div>
													<p class="text-[8px] sm:text-[9px] lg:text-xs font-bold uppercase tracking-tight text-gray-500 leading-tight">Variance</p>
												</div>
												<p class="text-lg sm:text-xl lg:text-2xl font-bold {
													selectedItem.variance > 0 ? 'text-green-600' :
													selectedItem.variance < 0 ? 'text-red-600' :
													'text-gray-900'
												}">{selectedItem.variance > 0 ? '+' : ''}{selectedItem.variance}</p>
											</div>
										</div>
									</div>

									<!-- Low Stock Warning -->
									{#if selectedItem.status === 'Low Stock' || selectedItem.status === 'Out of Stock'}
										<div class="rounded-xl sm:rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 sm:p-5">
											<div class="flex gap-2.5 sm:gap-3">
												<div class="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl {selectedItem.status === 'Out of Stock' ? 'bg-red-500' : 'bg-amber-500'}">
													<AlertTriangle class="h-4 w-4 sm:h-5 sm:w-5 text-white" />
												</div>
												<div class="flex-1 min-w-0">
													<p class="text-xs sm:text-sm font-bold {selectedItem.status === 'Out of Stock' ? 'text-red-900' : 'text-amber-900'}">
														{selectedItem.status === 'Out of Stock' ? 'Out of Stock' : 'Low Stock Alert'}
													</p>
													<p class="mt-1 sm:mt-1.5 text-xs sm:text-sm {selectedItem.status === 'Out of Stock' ? 'text-red-800' : 'text-amber-800'} leading-relaxed">
														{#if selectedItem.status === 'Out of Stock'}
															This item is currently out of stock. Consider restocking or marking as unavailable for requests.
														{:else}
															Stock levels are running low. Consider restocking this item soon to maintain availability.
														{/if}
													</p>
												</div>
											</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
						
						<!-- Footer -->
						<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm">
							<div class="px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5">
								<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
									<button
										onclick={closeModal}
										class="order-3 sm:order-1 rounded-lg sm:rounded-xl border border-gray-300 bg-white px-4 py-2 sm:px-4 sm:py-2 lg:px-4 lg:py-2 text-sm sm:text-xs lg:text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98] whitespace-nowrap"
									>
										Close
									</button>
									<div class="order-1 sm:order-2 flex flex-row gap-2 sm:gap-2">
										<button
											onclick={() => { if (selectedItem) toggleConstantStatus(selectedItem); }}
											class="flex-1 sm:flex-none rounded-md sm:rounded-xl border border-purple-300 bg-white px-3 py-1.5 sm:px-4 sm:py-2 lg:px-4 lg:py-2 text-xs sm:text-xs lg:text-sm font-semibold text-purple-700 shadow-sm transition-all hover:bg-purple-50 active:scale-[0.98] whitespace-nowrap"
										>
											{#if selectedItem.isConstant}
												<span class="hidden sm:inline">Remove Constant</span>
												<span class="sm:hidden">Remove Constant</span>
											{:else}
												<span class="hidden sm:inline">Mark Constant</span>
												<span class="sm:hidden">Mark Constant</span>
											{/if}
										</button>
										<button
											onclick={() => { if (selectedItem) editItem(selectedItem); }}
											class="flex-1 sm:flex-none rounded-md sm:rounded-xl bg-gradient-to-r from-pink-600 to-pink-700 px-3 py-1.5 sm:px-4 sm:py-2 lg:px-4 lg:py-2 text-xs sm:text-xs lg:text-sm font-bold text-white shadow-sm transition-all hover:from-pink-700 hover:to-pink-800 active:scale-[0.98] whitespace-nowrap"
										>
											Edit Item
										</button>
									</div>
								</div>
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

		<div class="flex flex-wrap gap-2">
			<button 
				onclick={openImportModal}
				class="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:px-4"
				disabled={loading}
			>
				<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
				</svg>
				<span class="hidden sm:inline">Import Items</span>
				<span class="sm:hidden">Import</span>
			</button>
			<button 
				onclick={openAddItemModal}
				class="inline-flex items-center rounded-lg bg-pink-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 sm:px-4"
				disabled={loading}
			>
				<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
				</svg>
				<span class="hidden sm:inline">Add New Item</span>
				<span class="sm:hidden">Add Item</span>
			</button>
		</div>
	</div>

	<!-- Global Skeleton Loading State -->
	{#if loading}
		<InventorySkeletonLoader view={activeTab === 'categories' ? 'categories' : activeTab === 'low-stock' ? 'low-stock' : activeTab === 'constant-items' ? 'all-items' : 'all-items'} />
	{:else}
	
	<!-- Stats Overview -->
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Active Items</p>
					<p class="mt-1 text-2xl font-semibold text-gray-900 sm:mt-2 sm:text-3xl">{activeItems.length}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 sm:h-12 sm:w-12">
					<Package size={18} class="text-blue-600 sm:hidden" />
					<Package size={24} class="hidden text-blue-600 sm:block" />
				</div>
			</div>
		</div>
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Categories</p>
					<p class="mt-1 text-2xl font-semibold text-gray-900 sm:mt-2 sm:text-3xl">{categories.length}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 sm:h-12 sm:w-12">
					<FolderTree size={18} class="text-purple-600 sm:hidden" />
					<FolderTree size={24} class="hidden text-purple-600 sm:block" />
				</div>
			</div>
		</div>
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Low Stock</p>
					<p class="mt-1 text-2xl font-semibold text-red-600 sm:mt-2 sm:text-3xl">{lowStockItems.length}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 sm:h-12 sm:w-12">
					<AlertTriangle size={18} class="text-red-600 sm:hidden" />
					<AlertTriangle size={24} class="hidden text-red-600 sm:block" />
				</div>
			</div>
		</div>
		<div class="rounded-lg bg-white p-3 shadow sm:p-5">
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Constant Items</p>
					<p class="mt-1 text-2xl font-semibold text-amber-600 sm:mt-2 sm:text-3xl">{constantItems.length}</p>
				</div>
				<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 sm:h-12 sm:w-12">
					<Star size={18} class="text-amber-600 sm:hidden" />
					<Star size={24} class="hidden text-amber-600 sm:block" />
				</div>
			</div>
		</div>
	</div>
	
	<!-- Tabs Navigation -->
	<div class="border-b border-gray-200 bg-white">
		<nav class="-mb-px flex" aria-label="Inventory tabs">
			<button
				onclick={() => switchTab('all-items')}
				class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium transition-colors sm:text-sm
					{activeTab === 'all-items' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Items
				<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'all-items' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
					{selectedCategory ? filteredItems.length : activeItems.length}
				</span>
			</button>

			<button
				onclick={() => switchTab('constant-items')}
				class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium transition-colors sm:text-sm
					{activeTab === 'constant-items' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Constant
				<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'constant-items' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-600'}">
					{constantItems.length}
				</span>
			</button>

			<button
				onclick={() => switchTab('categories')}
				class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium transition-colors sm:text-sm
					{activeTab === 'categories' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Categories
				<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'categories' ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
					{categories.length}
				</span>
			</button>

			<button
				onclick={() => switchTab('low-stock')}
				class="flex flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-3 text-[11px] font-medium transition-colors sm:text-sm
					{activeTab === 'low-stock' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Low Stock
				<span class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'low-stock' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}">
					{lowStockItems.length}
				</span>
			</button>
		</nav>
	</div>
	
	<!-- Tab Content -->
	<div class="rounded-b-lg bg-white shadow">
		{#if activeTab === 'all-items'}
			<!-- All Items View -->
			<div class="p-4 sm:p-6">
				<div class="mb-4 flex flex-col gap-3">
					{#if selectedCategory}
						<div class="flex items-center gap-2">
							<span class="inline-flex items-center rounded-full bg-pink-100 px-3 py-1 text-sm font-medium text-pink-800">Showing: {selectedCategory.name}</span>
							<button onclick={clearCategoryFilter} class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">Clear</button>
						</div>
					{/if}
					<!-- Search + Sort row -->
					<div class="flex gap-2">
						<div class="relative flex-1">
							<input
								type="text"
								placeholder="Search items..."
								bind:value={query}
								class="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
							/>
							<svg class="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
						</div>
						<select bind:value={sortOrder} class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500">
							<option value="az">A – Z</option>
							<option value="za">Z – A</option>
						</select>
					</div>
				</div>
				
				{#if displayItems.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
					<!-- Mobile card list — hidden on sm+ -->
					<div class="divide-y divide-gray-100 sm:hidden">
						{#each displayItems as item, i}
							<button
								class="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
								onclick={() => openModal(item)}
							>
								<div class="flex items-center gap-3">
									<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
										{(currentPage - 1) * PAGE_SIZE + i + 1}
									</span>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-semibold text-gray-900">{item.name}</p>
										<p class="truncate text-xs text-gray-500">{item.specification || item.category}</p>
										<div class="mt-1 flex flex-wrap items-center gap-1">
											{#if item.isConstant}
												<span class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Constant</span>
											{/if}
											<span class="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">{item.category}</span>
											{#if item.status === 'Low Stock' || item.status === 'Out of Stock'}
												<span class="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">{item.status}</span>
											{:else}
												<span class="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">{item.status}</span>
											{/if}
											<span class="text-[10px] text-gray-400">Qty: {item.quantity} · EOM: {item.eomCount}</span>
										</div>
									</div>
									<svg class="h-4 w-4 shrink-0 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
									</svg>
								</div>
							</button>
						{/each}
					</div>

					<!-- Desktop table — hidden on mobile -->
					<div class="hidden overflow-x-auto sm:block">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item Name</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Category</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Specification</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tools / Equipment</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Current Count</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">EOM Count</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Variance</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Condition</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each displayItems as item, i}
									<tr class="cursor-pointer hover:bg-gray-50" onclick={() => openModal(item)}>
										<td class="whitespace-nowrap px-6 py-4">
											<div class="flex items-center gap-3">
												<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">{(currentPage - 1) * PAGE_SIZE + i + 1}</span>
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
											<div class="flex items-center gap-1.5">
												{#if item.isConstant}
													<span class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
														<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
														Constant
													</span>
												{:else if item.status === 'Low Stock' || item.status === 'Out of Stock'}
													<span class="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
														<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
														{item.status}
													</span>
												{:else}
													<span class="inline-flex items-center rounded-full bg-pink-100 px-2 py-1 text-xs font-semibold text-pink-800">
														<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
														{item.status}
													</span>
												{/if}
											</div>
										</td>
										<td class="whitespace-nowrap px-6 py-4">
											<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {item.condition === 'Good' ? 'bg-pink-100 text-pink-800' : 'bg-yellow-100 text-yellow-800'}">{item.condition}</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Pagination -->
					{#if totalPages > 1}
						<div class="flex items-center justify-between border-t border-gray-200 px-4 py-3 sm:px-6">
							<div class="text-sm text-gray-500">
								Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sortedItems.length)} of {sortedItems.length} items
							</div>
							<nav class="flex items-center gap-1" aria-label="Pagination">
								<button
									onclick={() => currentPage = Math.max(1, currentPage - 1)}
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
											onclick={() => currentPage = page}
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
									onclick={() => currentPage = Math.min(totalPages, currentPage + 1)}
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
				{/if}
			</div>
			
		{:else if activeTab === 'categories'}
			<!-- Categories View -->
			<div class="p-4 sm:p-6">
				<div class="mb-4 flex items-center justify-between gap-3">
					<h3 class="text-base font-semibold text-gray-900 sm:text-lg">Item Categories</h3>
					<button 
						onclick={() => showCategoryModal = true}
						class="inline-flex shrink-0 items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 sm:px-4 sm:py-2 sm:text-sm"
						disabled={loading}
					>
						<svg class="mr-1.5 h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
						</svg>
						Add Category
					</button>
				</div>
				
				{#if categories.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each categories as category}
						<div onclick={() => openCategory(category)} class="relative cursor-pointer rounded-lg border border-gray-200 p-3 transition-all hover:border-emerald-500 hover:shadow-md sm:p-4">
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0 flex-1">
									<h4 class="truncate text-sm font-semibold text-gray-900 sm:text-base">{category.name}</h4>
									<p class="mt-0.5 text-xs text-gray-500">{category.itemCount} items</p>
									{#if category.description}
										<p class="mt-0.5 truncate text-xs text-gray-400">{category.description}</p>
									{/if}
								</div>
								<div class="flex shrink-0 items-center gap-2">
									{#if category.picture}
										<img src={category.picture} alt={category.name} class="h-9 w-9 rounded-full object-cover sm:h-10 sm:w-10" />
									{:else}
										<span class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 sm:h-10 sm:w-10">
											<svg class="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
											<div class="absolute right-0 mt-2 w-48 rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 z-30 origin-top-right">
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
			<div class="fixed inset-0 z-50 overflow-y-auto">
				<div class="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" onclick={() => showCategoryModal = false}></div>
				<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
					<div class="relative z-50 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-gray-100 bg-white shadow-2xl">
						<div class="border-b border-gray-200 px-4 py-3 sm:px-5 sm:py-4">
							<h3 class="text-base sm:text-lg font-semibold text-gray-900">Add New Category</h3>
							<p class="mt-1 text-xs text-gray-500">Create a category to organize inventory items.</p>
						</div>
						<div class="max-h-[70vh] overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
							<form onsubmit={handleCreateCategory} class="space-y-3">
						<div>
							<label for="categoryName" class="block text-sm font-medium text-gray-700">Category Name *</label>
							<input
								type="text"
								id="categoryName"
								bind:value={newCategoryName}
								required
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
								placeholder="e.g., Cookware"
							/>
						</div>
						<div>
							<label for="categoryDescription" class="block text-sm font-medium text-gray-700">Description</label>
							<input
								type="text"
								id="categoryDescription"
								bind:value={newCategoryDescription}
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
								placeholder="Optional description"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-2">Category Image</label>
							<div class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
								<button
									type="button"
									onclick={() => categoryPictureInput?.click()}
									class="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-pink-700"
									disabled={uploadingCategoryImage || loading}
								>
									{#if uploadingCategoryImage}
										<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
									{:else}
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M16 3l-4 4-4-4"/></svg>
									{/if}
									Upload Image
								</button>
								<span class="min-w-0 flex-1 truncate text-xs text-gray-600">{newCategoryPictureFile ? newCategoryPictureFile.name : 'No file chosen'}</span>
								{#if newCategoryPicture}
									<img src={newCategoryPicture} alt="preview" class="h-14 w-14 rounded-lg object-cover border border-gray-200" />
									<button type="button" onclick={() => { try { URL.revokeObjectURL(newCategoryPicture) } catch(e){}; newCategoryPicture=''; newCategoryPictureFile=null }} class="text-xs sm:text-sm text-red-500 hover:text-red-700">Remove</button>
								{/if}
								<input type="file" accept="image/*" onchange={handleCategoryPictureChange} bind:this={categoryPictureInput} class="hidden" />
							</div>
						</div>
						<div class="flex flex-col-reverse gap-1.5 pt-1.5 sm:flex-row sm:justify-end">
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
								class="inline-flex min-w-[108px] items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
							>
								Cancel
							</button>
							<button
								type="submit"
								class="inline-flex min-w-[108px] items-center justify-center rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-pink-700"
								disabled={loading}
							>
								Create Category
							</button>
						</div>
					</form>
						</div>
					</div>
				</div>
			</div>
		{/if}
			
		<!-- Category Edit Modal -->
		{#if showEditCategoryModal && editingCategory}
			<div class="fixed inset-0 z-50 overflow-y-auto">
				<div class="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" onclick={() => showEditCategoryModal = false}></div>
				<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
					<div class="relative z-50 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-gray-100 bg-white shadow-2xl">
						<div class="border-b border-gray-200 px-4 py-3 sm:px-5 sm:py-4">
							<h3 class="text-base sm:text-lg font-semibold text-gray-900">Edit Category</h3>
							<p class="mt-1 text-xs text-gray-500">Update category details and media.</p>
						</div>
						<div class="max-h-[70vh] overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
							<form onsubmit={handleEditCategory} class="space-y-3">
						<div>
							<label for="editCategoryName" class="block text-sm font-medium text-gray-700">Category Name *</label>
							<input
								type="text"
								id="editCategoryName"
								bind:value={newCategoryName}
								required
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
								placeholder="e.g., Cookware"
							/>
						</div>
						<div>
							<label for="editCategoryDescription" class="block text-sm font-medium text-gray-700">Description</label>
							<input
								type="text"
								id="editCategoryDescription"
								bind:value={newCategoryDescription}
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
								placeholder="Optional description"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-2">Category Image</label>
							<div class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
								<button
									type="button"
									onclick={() => editCategoryPictureInput?.click()}
									class="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-pink-700"
									disabled={uploadingCategoryImage || loading}
								>
									{#if uploadingCategoryImage}
										<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
									{:else}
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M16 3l-4 4-4-4"/></svg>
									{/if}
									Upload Image
								</button>
								<span class="min-w-0 flex-1 truncate text-xs text-gray-600">{newCategoryPictureFile ? newCategoryPictureFile.name : 'No file chosen'}</span>
								{#if newCategoryPicture}
									<img src={newCategoryPicture} alt="preview" class="h-14 w-14 rounded-lg object-cover border border-gray-200" />
									<button type="button" onclick={() => { try { if(newCategoryPicture.startsWith('blob:')) URL.revokeObjectURL(newCategoryPicture) } catch(e){}; newCategoryPicture=editingCategory?.picture || ''; newCategoryPictureFile=null }} class="text-xs sm:text-sm text-red-500 hover:text-red-700">Remove</button>
								{/if}
								<input type="file" accept="image/*" onchange={handleCategoryPictureChange} bind:this={editCategoryPictureInput} class="hidden" />
							</div>
						</div>
						<div class="flex flex-col-reverse gap-1.5 pt-1.5 sm:flex-row sm:justify-end">
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
								class="inline-flex min-w-[108px] items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
							>
								Cancel
							</button>
							<button
								type="submit"
								class="inline-flex min-w-[108px] items-center justify-center rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-pink-700"
								disabled={loading}
							>
								Update Category
							</button>
						</div>
					</form>
						</div>
					</div>
				</div>
			</div>
		{/if}

		{:else if activeTab === 'constant-items'}
			<!-- Constant Items View -->
			<div class="p-4 sm:p-6">
				<div class="mb-4">
					<h3 class="text-base font-semibold text-gray-900 sm:text-lg">Constant Items</h3>
					<p class="mt-1 text-sm text-gray-500">Items that always appear on student request forms regardless of availability</p>
				</div>
				
				{#if constantItems.length === 0}
					<div class="py-12 text-center">
						<svg class="mx-auto h-24 w-24 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">No constant items configured</h3>
						<p class="mt-2 text-sm text-gray-500">Mark items as constant from the Items tab to have them always appear on student request forms.</p>
						<button 
							onclick={() => switchTab('all-items')}
							class="mt-4 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
						>
							<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
							</svg>
							Go to Items
						</button>
					</div>
				{:else}
					<!-- Mobile card list -->
					<div class="divide-y divide-gray-100 sm:hidden">
						{#each constantItems as item, i}
							<button
								class="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
								onclick={() => openModal(item)}
							>
								<div class="flex items-center gap-3">
									<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
										{i + 1}
									</span>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-semibold text-gray-900">{item.name}</p>
										<p class="truncate text-xs text-gray-500">{item.specification || item.category}</p>
										<div class="mt-1 flex flex-wrap items-center gap-1">
											<span class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Constant</span>
											<span class="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">{item.category}</span>
											{#if item.status === 'Low Stock' || item.status === 'Out of Stock'}
												<span class="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">{item.status}</span>
											{:else}
												<span class="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">{item.status}</span>
											{/if}
											<span class="text-[10px] text-gray-400">Qty: {item.quantity} · EOM: {item.eomCount}</span>
										</div>
									</div>
									<svg class="h-4 w-4 shrink-0 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
									</svg>
								</div>
							</button>
						{/each}
					</div>

					<!-- Desktop table -->
					<div class="hidden overflow-x-auto sm:block">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item Name</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Category</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Specification</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Current Count</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Max Per Request</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
									<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200 bg-white">
								{#each constantItems as item, i}
									<tr class="hover:bg-gray-50">
										<td class="whitespace-nowrap px-6 py-4">
											<div class="flex items-center gap-3">
												{#if item.picture}
													<img src={item.picture} alt={item.name} class="h-9 w-9 shrink-0 rounded object-cover" loading="lazy" />
												{:else}
													<div class="h-9 w-9 shrink-0 overflow-hidden rounded bg-gray-100">
														<ItemImagePlaceholder size="sm" />
													</div>
												{/if}
												<div class="text-sm font-medium text-gray-900">{item.name}</div>
											</div>
										</td>
										<td class="whitespace-nowrap px-6 py-4">
											<span class="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">{item.category}</span>
										</td>
										<td class="px-6 py-4 text-sm text-gray-700">{item.specification}</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{item.quantity}</td>
										<td class="whitespace-nowrap px-6 py-4">
											{#if item.maxQuantityPerRequest}
												<span class="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-800">
													<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
													</svg>
													{item.maxQuantityPerRequest}
												</span>
											{:else}
												<span class="text-xs text-gray-400">No limit</span>
											{/if}
										</td>
										<td class="whitespace-nowrap px-6 py-4">
											{#if item.status === 'Low Stock' || item.status === 'Out of Stock'}
												<span class="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
													<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
													{item.status}
												</span>
											{:else}
												<span class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
													<svg class="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
													Constant
												</span>
											{/if}
										</td>
										<td class="whitespace-nowrap px-6 py-4 text-sm">
											<div class="flex items-center gap-2">
												<button
													onclick={() => editItem(item)}
													class="text-pink-600 hover:text-pink-800"
													title="Edit item"
												>
													<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
													</svg>
												</button>
												<button
													onclick={() => toggleConstantStatus(item)}
													class="text-gray-600 hover:text-gray-800"
													title="Remove from constant items"
												>
													<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
													</svg>
												</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
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
						<svg class="mx-auto h-24 w-24 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
						</svg>
						<h3 class="mt-4 text-lg font-medium text-gray-900">All items are adequately stocked</h3>
						<p class="mt-2 text-sm text-gray-500">No items require immediate restocking.</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each lowStockItems as item}
							<div class="rounded-xl border border-red-200 bg-red-50 p-4">
								<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<div class="flex items-center gap-3">
										<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
											<svg class="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
											</svg>
										</div>
										<div>
											<h4 class="text-sm font-semibold text-gray-900">{item.name}</h4>
											<p class="text-xs text-gray-500">{item.category}</p>
										</div>
									</div>
									<div class="flex items-center justify-between gap-3 sm:justify-end">
										<span class="text-sm text-gray-600">Qty: <span class="font-semibold text-red-600">{item.quantity}</span></span>
										<button
											onclick={() => editItem(item)}
											class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 sm:px-4 sm:py-2 sm:text-sm"
										>
											Update Stock
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			
		{/if}
	</div>
{/if}
</div>

<!-- Add New Item / Edit Item Modal -->
{#if showAddItemModal}
	<div class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="add-item-modal-title">
		<div class="fixed inset-0 bg-black/40 transition-opacity" onclick={closeAddItemModal}></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative z-50 w-full max-w-2xl rounded-xl bg-white shadow-2xl">
				<!-- Modal Header -->
				<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
					<div>
						<h2 id="add-item-modal-title" class="text-lg font-semibold text-gray-900">{editingItemId ? 'Edit Item' : 'Add New Item'}</h2>
						<p class="mt-0.5 text-sm text-gray-500">Enter details for the {editingItemId ? 'updated' : 'new'} inventory item</p>
					</div>
					<button
						onclick={closeAddItemModal}
						class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
						aria-label="Close modal"
						disabled={loading}
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>

				<!-- Modal Body -->
				<div class="px-6 py-6 max-h-[75vh] overflow-y-auto">
					<form id="add-item-form" onsubmit={handleAddItem} class="space-y-5">
						<div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
							<div>
								<label for="itemName" class="block text-sm font-medium text-gray-700">Item Name *</label>
								<input
									type="text"
									id="itemName"
									bind:value={newItem.name}
									required
									class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
									placeholder="e.g., Chef Knife Set"
								/>
							</div>

							<div>
								<label for="modalCategory" class="block text-sm font-medium text-gray-700">Category *</label>
								<select
									id="modalCategory"
									bind:value={newItem.categoryId}
									onchange={(e) => {
										const target = e.target as HTMLSelectElement;
										const selectedCat = categories.find(c => c.id === target.value);
										if (selectedCat) newItem.category = selectedCat.name;
									}}
									required
									class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
								>
									<option value="">Select a category</option>
									{#each categories as category}
										<option value={category.id}>{category.name}</option>
									{/each}
								</select>
							</div>

							<div>
								<label for="modalSpecification" class="block text-sm font-medium text-gray-700">Specification</label>
								<input type="text" id="modalSpecification" bind:value={newItem.specification} class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500" placeholder="e.g., Stainless steel, 8-piece" />
							</div>

							<div>
								<label for="modalToolsOrEquipment" class="block text-sm font-medium text-gray-700">Tools / Equipment</label>
								<input type="text" id="modalToolsOrEquipment" bind:value={newItem.toolsOrEquipment} class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500" placeholder="e.g., Power adapter, Sheath" />
							</div>

							<div>
								<label for="modalQuantity" class="block text-sm font-medium text-gray-700">Current Count *</label>
								<input type="number" id="modalQuantity" bind:value={newItem.quantity} required min="0" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500" placeholder="0" />
							</div>

							<div>
								<label for="modalEomCount" class="block text-sm font-medium text-gray-700">EOM Count</label>
								<input type="number" id="modalEomCount" bind:value={newItem.eomCount} min="0" class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500" placeholder="0" />
							</div>

							<div>
								<label for="modalCondition" class="block text-sm font-medium text-gray-700">Condition</label>
								<select id="modalCondition" bind:value={newItem.condition} class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500">
									<option value="Excellent">Excellent</option>
									<option value="Good">Good</option>
									<option value="Fair">Fair</option>
									<option value="Poor">Poor</option>
									<option value="Damaged">Damaged</option>
								</select>
							</div>

							<div class="sm:col-span-2">
								<label for="modalLocation" class="block text-sm font-medium text-gray-700">Storage Location</label>
								<input type="text" id="modalLocation" bind:value={newItem.location} class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500" placeholder="e.g., Cabinet A, Shelf 2" />
							</div>
						</div>

						<!-- Constant Item Checkbox -->
						<div class="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
							<label class="flex items-start gap-3 cursor-pointer">
								<input
									type="checkbox"
									bind:checked={newItem.isConstant}
									class="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
								/>
								<div class="flex-1">
									<span class="text-sm font-medium text-gray-900">Mark as Constant Item</span>
									<p class="mt-0.5 text-xs text-gray-600">
										Constant items always appear on student request forms.
									</p>
								</div>
							</label>
							
							{#if newItem.isConstant}
								<div class="mt-3 border-t border-emerald-200 pt-3">
									<label for="maxQuantityPerRequest" class="block text-sm font-medium text-gray-900 mb-1">
										Maximum Quantity Per Request
										<span class="text-xs font-normal text-gray-500">(Optional)</span>
									</label>
									<input
										type="number"
										id="maxQuantityPerRequest"
										bind:value={newItem.maxQuantityPerRequest}
										min="1"
										step="1"
										placeholder="e.g., 5 (leave empty for unlimited)"
										class="block w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
									/>
									<p class="mt-1 text-xs text-gray-600">
										Set the maximum quantity students can request per transaction. Leave empty for unlimited requests.
									</p>
								</div>
							{/if}
						</div>

						<!-- Image Upload -->
						<div class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3" aria-live="polite">
							<button
								type="button"
								onclick={() => pictureInput?.click()}
								aria-label="Upload item image"
								class="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
								disabled={uploadingImage || loading}
							>
								{#if uploadingImage}
									<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
									Uploading...
								{:else}
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M16 3l-4 4-4-4"/></svg>
									Upload Image
								{/if}
							</button>
							<span class="flex-1 truncate text-sm text-gray-500">{newItem.pictureFile ? newItem.pictureFile.name : 'No file chosen'}</span>
							{#if newItem.picture}
								<img src={newItem.picture} alt="preview" class="h-12 w-12 rounded-lg object-cover border border-gray-200" />
								<button type="button" onclick={() => { try { URL.revokeObjectURL(newItem.picture) } catch(e){}; newItem.picture=''; newItem.pictureFile=null }} class="text-sm text-red-500 hover:text-red-700" aria-label="Remove image">Remove</button>
							{/if}
							<input id="modalPicture" type="file" accept="image/*" onchange={handlePictureChange} bind:this={pictureInput} class="hidden" />
						</div>
					</form>
				</div>

				<!-- Modal Footer -->
				<div class="flex items-center justify-end gap-2 sm:gap-3 border-t border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
					<button
						type="button"
						onclick={closeAddItemModal}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50 whitespace-nowrap"
						disabled={loading}
					>
						Cancel
					</button>
					<button
						type="submit"
						form="add-item-form"
						class="inline-flex items-center rounded-lg bg-pink-600 px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50 whitespace-nowrap"
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
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Import Modal -->
{#if showImportModal}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div class="fixed inset-0 bg-black/40" onclick={closeImportModal}></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative z-50 w-full max-w-4xl rounded-lg bg-white shadow-xl">
				<!-- Header -->
				<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
					<div>
						<h2 class="text-xl font-semibold text-gray-900">Import Inventory Items</h2>
						<p class="mt-1 text-sm text-gray-500">
							{#if importStep === 'upload'}
								Upload a CSV or Excel file to bulk import items. Use sheet tab name for category (e.g., "Hot Kitchen")
							{:else if importStep === 'preview'}
								Review and confirm import
							{:else}
								Import complete
							{/if}
						</p>
					</div>
					<button
						onclick={closeImportModal}
						class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
						disabled={importing}
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>

				<!-- Content -->
				<div class="px-6 py-6">
					{#if importStep === 'upload'}
						<!-- Upload Step -->
						<div class="space-y-6">
							<!-- Collapsible Format Guide -->
							<div class="rounded-lg border border-gray-200 bg-white overflow-hidden">
								<!-- Accordion Header -->
								<button
									type="button"
									onclick={() => { showFormatGuide = !showFormatGuide; }}
									class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
								>
									<div class="flex items-center gap-2.5">
										<span class="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex-shrink-0">
											<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
												<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
											</svg>
										</span>
										<span class="text-sm font-semibold text-gray-800">File Format Guide</span>
										<span class="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">Required reading</span>
									</div>
									<svg
										class="h-4 w-4 text-gray-400 transition-transform duration-200 {showFormatGuide ? 'rotate-180' : ''}"
										fill="none" stroke="currentColor" viewBox="0 0 24 24"
									>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
									</svg>
								</button>

								<!-- Accordion Body -->
								{#if showFormatGuide}
									<div class="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4 text-sm text-gray-700">

										<!-- Column reference -->
										<div>
											<p class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Column Reference — Excel / CSV</p>
											<div class="rounded-md border border-gray-200 overflow-hidden">
												<table class="min-w-full divide-y divide-gray-200 text-xs">
													<thead class="bg-gray-100">
														<tr>
															<th class="px-3 py-2 text-left font-semibold text-gray-600">Column</th>
															<th class="px-3 py-2 text-left font-semibold text-gray-600">Required</th>
															<th class="px-3 py-2 text-left font-semibold text-gray-600">Notes</th>
														</tr>
													</thead>
													<tbody class="bg-white divide-y divide-gray-100">
														<tr>
															<td class="px-3 py-2 font-medium text-gray-800">Name</td>
															<td class="px-3 py-2"><span class="inline-block rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">Required</span></td>
															<td class="px-3 py-2 text-gray-600">Item name — must be unique</td>
														</tr>
														<tr class="bg-gray-50">
															<td class="px-3 py-2 font-medium text-gray-800">Category</td>
															<td class="px-3 py-2"><span class="inline-block rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">Auto / Column</span></td>
															<td class="px-3 py-2 text-gray-600">Uses sheet tab name automatically, or add a Category column</td>
														</tr>
														<tr>
															<td class="px-3 py-2 font-medium text-gray-800">Specification</td>
															<td class="px-3 py-2"><span class="inline-block rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-xs font-medium">Optional</span></td>
															<td class="px-3 py-2 text-gray-600">Item specifications / description</td>
														</tr>
														<tr class="bg-gray-50">
															<td class="px-3 py-2 font-medium text-gray-800">Tools or Equipment</td>
															<td class="px-3 py-2"><span class="inline-block rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-xs font-medium">Optional</span></td>
															<td class="px-3 py-2 text-gray-600">Associated tools or companion equipment</td>
														</tr>
														<tr>
															<td class="px-3 py-2 font-medium text-gray-800">Current Count</td>
															<td class="px-3 py-2"><span class="inline-block rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-xs font-medium">Optional</span></td>
															<td class="px-3 py-2 text-gray-600">Current stock quantity — defaults to 1</td>
														</tr>
														<tr class="bg-gray-50">
															<td class="px-3 py-2 font-medium text-gray-800">EOM Count</td>
															<td class="px-3 py-2"><span class="inline-block rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-xs font-medium">Optional</span></td>
															<td class="px-3 py-2 text-gray-600">End-of-month count — defaults to 0</td>
														</tr>
														<tr>
															<td class="px-3 py-2 font-medium text-gray-800">Remarks</td>
															<td class="px-3 py-2"><span class="inline-block rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-xs font-medium">Optional</span></td>
															<td class="px-3 py-2 text-gray-600">Additional notes</td>
														</tr>
														<tr class="bg-gray-50">
															<td class="px-3 py-2 font-medium text-gray-800">Picture</td>
															<td class="px-3 py-2"><span class="inline-block rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-xs font-medium">Optional</span></td>
															<td class="px-3 py-2 text-gray-600">Image URL (https://…) or filename from ZIP</td>
														</tr>
													</tbody>
												</table>
											</div>
										</div>

										<!-- Tips row -->
										<div class="grid grid-cols-2 gap-3">
											<div class="rounded-md border border-purple-200 bg-purple-50 p-3">
												<p class="text-xs font-semibold text-purple-800 mb-1">💡 Pro Tip — Categories</p>
												<p class="text-xs text-purple-700">Name your Excel sheet tab as the category (e.g., "Hot Kitchen", "Baking Lab"). The sheet name is used automatically — no Category column needed.</p>
											</div>
											<div class="rounded-md border border-blue-200 bg-blue-50 p-3">
												<p class="text-xs font-semibold text-blue-800 mb-1">🖼 Image Support</p>
												<ul class="text-xs text-blue-700 space-y-1 mt-1">
													<li><strong>Embedded:</strong> Insert images directly into Excel cells</li>
													<li><strong>URL:</strong> Paste a direct image link (https://…)</li>
													<li><strong>ZIP:</strong> Bundle your Excel + image files in a .zip</li>
													<li class="text-blue-500">Supported: JPG, PNG, GIF, WebP</li>
												</ul>
											</div>
										</div>

									</div>
								{/if}
							</div>

							<!-- Template Download -->
							<div class="flex items-center justify-between rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4">
								<div class="flex items-center gap-3">
									<svg class="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
									</svg>
									<div>
										<p class="font-medium text-gray-900">Need a template?</p>
										<p class="text-sm text-gray-500">Download our sample CSV file to get started</p>
									</div>
								</div>
								<button
									onclick={downloadTemplate}
									class="inline-flex items-center gap-2 rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
									</svg>
									Download Template
								</button>
							</div>

							<!-- File Upload -->
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">
									Upload File
								</label>
								
								{#if !importFile}
									<!-- Upload Drop Zone -->
									<label 
										class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 cursor-pointer transition-all duration-200"
										class:border-emerald-500={isDraggingOver}
										class:bg-emerald-50={isDraggingOver}
										class:border-gray-300={!isDraggingOver}
										class:bg-gray-50={!isDraggingOver}
										class:hover:border-emerald-500={!isDraggingOver}
										class:hover:bg-emerald-50={!isDraggingOver}
										ondragenter={handleDragEnter}
										ondragover={handleDragOver}
										ondragleave={handleDragLeave}
										ondrop={handleDrop}
									>
										<svg 
											class="h-12 w-12 mb-3 transition-colors"
											class:text-emerald-500={isDraggingOver}
											class:text-gray-400={!isDraggingOver}
											fill="none" 
											stroke="currentColor" 
											viewBox="0 0 24 24"
										>
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
										</svg>
										<span 
											class="text-sm font-medium transition-colors"
											class:text-emerald-700={isDraggingOver}
											class:text-gray-700={!isDraggingOver}
										>
											{#if isDraggingOver}
												Drop file here
											{:else}
												Click to upload or drag and drop
											{/if}
										</span>
										<span class="text-xs text-gray-500 mt-1">CSV, XLSX, XLS, or ZIP files (with images)</span>
										<input
											type="file"
											accept=".csv,.xlsx,.xls,.zip"
											onchange={handleImportFileSelect}
											class="hidden"
										/>
									</label>
								{:else}
									<!-- File Preview Card -->
									<div class="bg-white border-2 border-emerald-500 rounded-lg p-4 transition-all">
										<div class="flex items-start gap-4">
											<!-- File Icon -->
											<div class="flex-shrink-0">
												{#if getFileIcon(importFile.name) === 'csv'}
													<div class="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
														<svg class="h-7 w-7 text-green-600" fill="currentColor" viewBox="0 0 20 20">
															<path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/>
														</svg>
													</div>
												{:else if getFileIcon(importFile.name) === 'excel'}
													<div class="h-12 w-12 rounded-lg bg-emerald-100 flex items-center justify-center">
														<svg class="h-7 w-7 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
															<path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/>
														</svg>
													</div>
												{:else if getFileIcon(importFile.name) === 'zip'}
													<div class="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
														<svg class="h-7 w-7 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
															<path d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4z"/>
														</svg>
													</div>
												{/if}
											</div>

											<!-- File Info -->
											<div class="flex-1 min-w-0">
												<div class="flex items-start justify-between gap-4">
													<div class="flex-1 min-w-0">
														<p class="text-sm font-medium text-gray-900 truncate" title={importFile.name}>
															{importFile.name}
														</p>
														<p class="text-xs text-gray-500 mt-1">
															{formatFileSize(importFile.size)}
														</p>
													</div>
													<button
														onclick={removeImportFile}
														class="flex-shrink-0 text-gray-400 hover:text-red-600 transition-colors"
														title="Remove file"
													>
														<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
															<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
														</svg>
													</button>
												</div>
												
												<!-- Success Indicator -->
												<div class="flex items-center gap-2 mt-3">
													<div class="flex-1 bg-emerald-100 rounded-full h-1.5">
														<div class="bg-emerald-600 h-1.5 rounded-full" style="width: 100%"></div>
													</div>
													<svg class="h-5 w-5 text-emerald-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
														<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
													</svg>
												</div>

												{#if importImageFiles.size > 0}
													<div class="flex items-center gap-2 mt-2 text-xs text-emerald-600">
														<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
															<path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
														</svg>
														<span>{importImageFiles.size} image(s) found in ZIP</span>
													</div>
												{/if}

												{#if importPreviewData.length > 0}
													<div class="flex items-center gap-2 mt-2 text-xs text-blue-600">
														<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
															<path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
															<path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/>
														</svg>
														<span>{importPreviewData.length} item(s) ready to import</span>
													</div>
												{/if}
											</div>
										</div>
									</div>
								{/if}
							</div>

							{#if importing}
								<div class="flex items-center justify-center gap-3 py-8">
									<div class="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent"></div>
									<span class="text-sm text-gray-600">Processing file...</span>
								</div>
							{/if}
						</div>

					{:else if importStep === 'preview'}
						<!-- Preview Step -->
						<div class="space-y-4">
							<!-- Import Progress (shown during import) -->
							{#if importing && importProgress.total > 0}
								<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
									<div class="flex items-center gap-3 mb-3">
										<div class="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
										<div class="flex-1">
											<p class="text-sm font-medium text-blue-900">{importProgress.message}</p>
											<p class="text-xs text-blue-600 mt-1">
												Progress: {importProgress.current} of {importProgress.total} items
											</p>
										</div>
									</div>
									<div class="w-full bg-blue-200 rounded-full h-2">
										<div 
											class="bg-blue-600 h-2 rounded-full transition-all duration-300"
											style="width: {(importProgress.current / importProgress.total) * 100}%"
										></div>
									</div>
								</div>
							{/if}

							<!-- Summary -->
							<div class="grid grid-cols-4 gap-4">
								<div class="rounded-lg bg-blue-50 p-4">
									<p class="text-sm text-blue-600 font-medium">Total Rows</p>
									<p class="text-2xl font-bold text-blue-900 mt-1">{importPreviewData.length}</p>
								</div>
								<div class="rounded-lg bg-green-50 p-4">
									<p class="text-sm text-green-600 font-medium">Create</p>
									<p class="text-2xl font-bold text-green-900 mt-1">{importPreviewData.filter(i => i._importAction === 'create').length}</p>
								</div>
								<div class="rounded-lg bg-emerald-50 p-4">
									<p class="text-sm text-emerald-600 font-medium">Update</p>
									<p class="text-2xl font-bold text-emerald-900 mt-1">{importPreviewData.filter(i => i._importAction === 'update').length}</p>
								</div>
								<div class="rounded-lg bg-amber-50 p-4">
									<p class="text-sm text-amber-600 font-medium">No Change</p>
									<p class="text-2xl font-bold text-amber-900 mt-1">{importPreviewData.filter(i => i._importAction === 'no-change').length}</p>
								</div>
							</div>
							<div class="mt-3 rounded-lg bg-red-50 p-4">
								<p class="text-sm text-red-600 font-medium">Errors</p>
								<p class="text-2xl font-bold text-red-900 mt-1">{importPreviewData.filter(i => i._importAction === 'error').length}</p>
								</div>

							{#if importErrors.length > 0}
								<div class="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
									<div class="flex">
										<svg class="h-5 w-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
										</svg>
										<div class="ml-3">
											<h3 class="text-sm font-medium text-yellow-900">Validation Errors</h3>
											<div class="mt-2 text-sm text-yellow-800 max-h-32 overflow-y-auto">
												<ul class="list-disc list-inside space-y-1">
													{#each importErrors.slice(0, 10) as error}
														<li>{error}</li>
													{/each}
													{#if importErrors.length > 10}
														<li class="text-yellow-700">...and {importErrors.length - 10} more errors</li>
													{/if}
												</ul>
											</div>
										</div>
									</div>
								</div>
							{/if}

							<!-- Preview Table -->
							<div class="border rounded-lg overflow-hidden">
								<div class="max-h-96 overflow-y-auto">
									<table class="min-w-full divide-y divide-gray-200">
										<thead class="bg-gray-50 sticky top-0">
											<tr>
												<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
												<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
												<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
												<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
												<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
												<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Image</th>
											</tr>
										</thead>
										<tbody class="bg-white divide-y divide-gray-200">
											{#each importPreviewData as item}
												<tr class={
													item._importAction === 'create' ? 'bg-green-50/40 hover:bg-green-50' :
													item._importAction === 'update' ? 'bg-emerald-50/40 hover:bg-emerald-50' :
													item._importAction === 'no-change' ? 'bg-amber-50/40 hover:bg-amber-50' :
													'bg-red-50'
												}>
													<td class="px-4 py-3 whitespace-nowrap">
														{#if item._importAction === 'create'}
															<span class="inline-flex items-center gap-1 text-green-600 text-xs">
																<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																	<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
																</svg>
																Create
															</span>
														{:else if item._importAction === 'update'}
															<span class="inline-flex items-center gap-1 text-emerald-700 text-xs" title={`Will update: ${item._changedFields?.join(', ') || 'changed fields'}`}>
																<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																	<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.778 7.778a1 1 0 01-1.414 0L3.293 10.26a1 1 0 111.414-1.414l3.515 3.515 7.071-7.071a1 1 0 011.414 0z" clip-rule="evenodd"/>
																</svg>
																Update
															</span>
														{:else if item._importAction === 'no-change'}
															<span class="inline-flex items-center gap-1 text-amber-700 text-xs" title="Existing item matches imported values">
																<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																	<path fill-rule="evenodd" d="M18 10A8 8 0 114 3.08V7a1 1 0 11-2 0V2a1 1 0 011-1h5a1 1 0 110 2H4.415A6 6 0 1016 10a1 1 0 112 0z" clip-rule="evenodd"/>
																</svg>
																No Change
															</span>
														{:else}
															<span class="inline-flex items-center gap-1 text-red-600 text-xs" title={item._errors.join(', ')}>
																<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																	<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
																</svg>
																Error
															</span>
														{/if}
													</td>
													<td class="px-4 py-3 text-sm text-gray-900">{item.name}</td>
													<td class="px-4 py-3 text-sm text-gray-600">
												{item.category}
												{#if item._categoryExists}
													<span class="ml-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">exists</span>
												{:else if item.category}
													<span class="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">new</span>
												{/if}
											</td>
													<td class="px-4 py-3 text-sm text-gray-900">{item.quantity}</td>
													<td class="px-4 py-3 text-sm text-gray-600">{item.condition}</td>
													<td class="px-4 py-3 whitespace-nowrap">
														{#if item._hasImage}
															{#if item._imageSource === 'url'}
																<button onclick={() => openImagePreview(item)} class="inline-flex items-center gap-1 text-blue-600 text-xs hover:text-blue-800 hover:underline cursor-pointer" title="Click to preview">
																	<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																		<path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
																	</svg>
																	URL
																</button>
															{:else if item._imageSource === 'zip'}
																<button onclick={() => openImagePreview(item)} class="inline-flex items-center gap-1 text-purple-600 text-xs hover:text-purple-800 hover:underline cursor-pointer" title="Click to preview">
																	<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																		<path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
																	</svg>
																	File
																</button>
															{:else if item._imageSource === 'excel'}
																<button onclick={() => openImagePreview(item)} class="inline-flex items-center gap-1 text-emerald-600 text-xs hover:text-emerald-800 hover:underline cursor-pointer" title="Click to preview">
																	<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																		<path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
																	</svg>
																	Excel
																</button>
															{/if}
														{:else}
															<span class="text-xs text-gray-400">—</span>
														{/if}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>
						</div>

					{:else if importStep === 'complete'}
						<!-- Complete Step -->
						<div class="text-center py-12">
							<svg class="mx-auto h-16 w-16 text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							<h3 class="text-lg font-medium text-gray-900 mb-2">Import Successful!</h3>
							<p class="text-sm text-gray-500">Items have been added to your inventory</p>
						</div>
					{/if}
				</div>

				<!-- Footer -->
				<div class="flex items-center justify-between border-t border-gray-200 px-6 py-4 bg-gray-50">
					<button
						onclick={closeImportModal}
						class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						disabled={importing}
					>
						{importStep === 'complete' ? 'Close' : 'Cancel'}
					</button>

					{#if importStep === 'upload' && importPreviewData.length > 0}
						<!-- Next button for upload step -->
						<button
							onclick={() => { importStep = 'preview'; }}
							class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700"
							disabled={importing}
						>
							Continue to Preview
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
							</svg>
						</button>
					{:else if importStep === 'preview'}
						<div class="flex gap-3">
							<button
								onclick={() => { importStep = 'upload'; importPreviewData = []; importErrors = []; }}
								class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
								disabled={importing}
							>
								Back
							</button>
							<button
								onclick={handleImportConfirm}
								class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700"
								disabled={importing || importPreviewData.filter(i => i._importAction === 'create' || i._importAction === 'update').length === 0}
							>
								{#if importing}
									<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
									Importing...
								{:else}
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
									</svg>
									Apply {importPreviewData.filter(i => i._importAction === 'create' || i._importAction === 'update').length} Changes
								{/if}
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Image preview lightbox for import review -->
{#if importPreviewImageUrl}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
		onclick={closeImagePreview}
	>
		<div class="relative max-w-2xl w-full mx-4" onclick={(e) => e.stopPropagation()}>
			<!-- Header -->
			<div class="flex items-center justify-between bg-white rounded-t-xl px-4 py-3">
				<p class="text-sm font-medium text-gray-800 truncate">{importPreviewImageName}</p>
				<button
					onclick={closeImagePreview}
					class="ml-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
					aria-label="Close preview"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</button>
			</div>
			<!-- Image -->
			<div class="bg-gray-50 rounded-b-xl flex items-center justify-center p-4 max-h-[70vh] overflow-hidden">
				<img
					src={importPreviewImageUrl}
					alt={importPreviewImageName}
					class="max-h-[65vh] max-w-full object-contain rounded"
				/>
			</div>
		</div>
	</div>
{/if}
