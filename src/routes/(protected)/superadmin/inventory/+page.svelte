<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import {
		Package,
		TrendingUp,
		AlertCircle,
		Info,
		Search,
		Download,
		RefreshCw,
		CheckCircle,
		Wifi,
		WifiOff,
		XCircle,
		AlertTriangle,
		BarChart3,
		Activity,
		Clock,
		Plus,
		Edit,
		Trash2,
		X,
		Upload,
		Star,
		FolderTree,
		Archive,
		Pin,
		PinOff
	} from 'lucide-svelte';
	import {
		inventoryItemsAPI,
		inventoryCategoriesAPI,
		uploadInventoryImage,
		type InventoryItem,
		type InventoryCategory,
		type CreateItemRequest,
		subscribeToInventoryChanges
	} from '$lib/api/inventory';
	import {
		fetchAnalytics,
		peekCachedAnalytics,
		subscribeToAnalyticsChanges,
		type AnalyticsReport
	} from '$lib/api/analyticsReports';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import InventorySkeletonLoader from '$lib/components/ui/InventorySkeletonLoader.svelte';
	import ActionMenu from '$lib/components/ui/ActionMenu.svelte';
	import type { ActionMenuItem, LucideIcon } from '$lib/components/ui/ActionMenu.types';

	let activeTab = $state<'stock' | 'usage' | 'obligations'>('stock');
	let sseConnected = $state(false);
	let loading = $state(true);

	// Data
	let allItems = $state<InventoryItem[]>([]);
	let categories = $state<InventoryCategory[]>([]);
	let analytics = $state<AnalyticsReport | null>(
		browser ? peekCachedAnalytics({ period: 'month' }) : null
	);
	let searchQuery = $state('');

	let _pollInterval: ReturnType<typeof setInterval> | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;

	function hydrateFromCache(): boolean {
		const cachedItems = inventoryItemsAPI.peekCachedList({ limit: 1000 });
		if (!cachedItems) return false;

		allItems = cachedItems.items;
		loading = false;
		return true;
	}

	function scheduleRefresh(forceRefresh = false): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			void loadAllData(false, forceRefresh);
		}, 250);
	}

	// Pagination
	let currentPage = $state(1);
	const itemsPerPage = 20;

	// Filtered and paginated items
	const filteredAllItems = $derived(
		allItems.filter(
			(i) =>
				!searchQuery ||
				i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				i.category.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	const totalPages = $derived(Math.max(1, Math.ceil(filteredAllItems.length / itemsPerPage)));
	const items = $derived(
		filteredAllItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
	);

	// Stats
	let lowStockCount = $derived(
		allItems.filter((i) => i.quantity - (i.currentCount || 0) < 5).length
	);

	let unsubscribeAnalytics: (() => void) | null = null;
	let unsubscribeInventory: (() => void) | null = null;

	onMount(() => {
		hydrateFromCache();
		void loadAllData(allItems.length === 0, false);

		unsubscribeAnalytics = subscribeToAnalyticsChanges(() => {
			sseConnected = true;
			scheduleRefresh(true);
		});

		unsubscribeInventory = subscribeToInventoryChanges((event) => {
			sseConnected = true;
			scheduleRefresh(true);
			const msgs: Record<string, string> = {
				item_created: 'A new item was added',
				item_updated: 'An item was updated',
				item_deleted: 'An item was removed'
			};
			toastStore.info(msgs[event.action] || 'Inventory updated', 'Live Sync');
		});

		setTimeout(() => (sseConnected = true), 1500);

		// --- 30-second polling fallback ---
		_pollInterval = setInterval(() => {
			void loadAllData(false, true);
		}, 30_000);

		// --- Refresh on tab/window focus ---
		const onFocus = () => {
			void loadAllData(false, true);
		};
		const onVisible = () => {
			if (document.visibilityState === 'visible') void loadAllData(false, true);
		};
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			unsubscribeAnalytics?.();
			unsubscribeInventory?.();
			if (_pollInterval !== null) clearInterval(_pollInterval);
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	async function loadAllData(showLoader = true, forceRefresh = true) {
		if (showLoader && allItems.length === 0) loading = true;
		try {
			const [itemsRes, analyticsRes, catsRes] = await Promise.all([
				inventoryItemsAPI.getAll({ limit: 1000, forceRefresh }),
				fetchAnalytics({ period: 'month', forceRefresh }),
				inventoryCategoriesAPI.getAll()
			]);
			allItems = itemsRes.items;
			analytics = analyticsRes;
			categories = catsRes.categories;
		} catch (e: any) {
			toastStore.error(e.message || 'Failed to load inventory data');
		} finally {
			loading = false;
		}
	}

	/**
	 * Handle page navigation
	 */
	function goToPage(pageNum: number): void {
		if (pageNum >= 1 && pageNum <= totalPages) {
			currentPage = pageNum;
			// Scroll to top of table
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	/**
	 * Handle search input (debounced)
	 */
	let searchTimeout: ReturnType<typeof setTimeout>;
	function handleSearch(query: string): void {
		searchQuery = query;
		currentPage = 1; // Reset to first page on search
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			// Search is client-side, no need to refetch
		}, 300);
	}

	function formatDate(d: string | Date | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function exportData() {
		toastStore.info('Preparing export...', 'Export');
		const headers = ['ID', 'Name', 'Category', 'Total Stock', 'Current Variance', 'Status'];
		const rows = allItems.map((i) => [
			i.id.slice(-6).toUpperCase(),
			`"${i.name}"`,
			`"${i.category}"`,
			i.currentCount ?? i.quantity,
			i.variance,
			i.status
		]);
		const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `inventory-export-${new Date().toISOString().split('T')[0]}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// ─── CRUD State ───────────────────────────────────────────────────────────

	// Item detail panel (click a row to open)
	let selectedItem = $state<InventoryItem | null>(null);
	let showFullImage = $state(false);

	function openDetail(item: InventoryItem) {
		selectedItem = item;
	}
	function closeDetail() {
		selectedItem = null;
		showFullImage = false;
	}
	function openFullImage() {
		showFullImage = true;
	}
	function closeFullImage() {
		showFullImage = false;
	}

	// Create / Edit modal
	let showItemModal = $state(false);
	let editingItem = $state<InventoryItem | null>(null);
	let itemModalLoading = $state(false);
	let uploadingImage = $state(false);

	const emptyForm = () => ({
		name: '',
		category: '',
		categoryId: '',
		specification: '',
		toolsOrEquipment: '',
		picture: '',
		pictureFile: null as File | null,
		quantity: 0,
		eomCount: 0,
		isrequired: false,
		maxQuantityPerRequest: undefined as number | undefined
	});

	let itemForm = $state(emptyForm());

	function openCreateModal() {
		editingItem = null;
		itemForm = emptyForm();
		showItemModal = true;
	}

	function openEditModal(item: InventoryItem) {
		editingItem = item;
		selectedItem = null; // close detail panel if open
		itemForm = {
			name: item.name,
			category: item.category,
			categoryId: item.categoryId ?? '',
			specification: item.specification ?? '',
			toolsOrEquipment: item.toolsOrEquipment ?? '',
			picture: item.picture ?? '',
			pictureFile: null,
			quantity: item.quantity,
			eomCount: item.eomCount ?? 0,
			isrequired: item.isrequired ?? false,
			maxQuantityPerRequest: item.maxQuantityPerRequest
		};
		showItemModal = true;
	}

	function closeItemModal() {
		showItemModal = false;
		editingItem = null;
		itemForm = emptyForm();
	}

	async function handlePictureChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			toastStore.error('Please select an image file');
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			toastStore.error('Image must be under 5 MB');
			return;
		}
		if (itemForm.picture.startsWith('blob:')) URL.revokeObjectURL(itemForm.picture);
		itemForm.pictureFile = file;
		itemForm.picture = URL.createObjectURL(file);
	}

	async function handleSaveItem(e: Event) {
		e.preventDefault();
		if (!itemForm.name.trim()) {
			toastStore.error('Item name is required');
			return;
		}
		if (!itemForm.category.trim()) {
			toastStore.error('Category is required');
			return;
		}
		if (itemForm.quantity < 0) {
			toastStore.error('Quantity cannot be negative');
			return;
		}

		itemModalLoading = true;
		try {
			let imageUrl = itemForm.picture.startsWith('blob:') ? '' : itemForm.picture;

			if (itemForm.pictureFile) {
				uploadingImage = true;
				const res = await uploadInventoryImage(itemForm.pictureFile);
				imageUrl = res.url;
				uploadingImage = false;
			}

			const payload: CreateItemRequest = {
				name: itemForm.name.trim(),
				category: itemForm.category.trim(),
				categoryId: itemForm.categoryId || undefined,
				specification: itemForm.specification.trim(),
				toolsOrEquipment: itemForm.toolsOrEquipment.trim(),
				picture: imageUrl || undefined,
				quantity: Number(itemForm.quantity),
				eomCount: Number(itemForm.eomCount),
				isrequired: itemForm.isrequired,
				maxQuantityPerRequest:
					itemForm.isrequired && itemForm.maxQuantityPerRequest
						? Number(itemForm.maxQuantityPerRequest)
						: undefined
			};

			if (editingItem) {
				const updated = await inventoryItemsAPI.update(editingItem.id, payload);
				allItems = allItems.map((i) => (i.id === editingItem!.id ? updated : i));
				toastStore.success(`"${updated.name}" updated successfully`, 'Item Updated');
			} else {
				const created = await inventoryItemsAPI.create(payload);
				allItems = [created, ...allItems];
				toastStore.success(`"${created.name}" added to inventory`, 'Item Created');
			}

			inventoryItemsAPI.invalidateCache();
			closeItemModal();
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to save item', 'Error');
		} finally {
			itemModalLoading = false;
			uploadingImage = false;
		}
	}

	async function handleDeleteItem(item: InventoryItem) {
		const confirmed = await confirmStore.danger(
			`Permanently delete "${item.name}"? This cannot be undone.`,
			'Remove Item',
			'Remove'
		);
		if (!confirmed) return;
		try {
			await inventoryItemsAPI.delete(item.id);
			allItems = allItems.filter((i) => i.id !== item.id);
			inventoryItemsAPI.invalidateCache();
			if (selectedItem?.id === item.id) closeDetail();
			toastStore.success(`"${item.name}" deleted`, 'Item Deleted');
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to delete item', 'Error');
		}
	}

	async function handleArchiveItem(item: InventoryItem) {
		const confirmed = await confirmStore.warning(
			`Archive "${item.name}"? It will be hidden from active inventory but can be restored later.`,
			'Archive Item',
			'Archive'
		);
		if (!confirmed) return;
		try {
			const updated = await inventoryItemsAPI.update(item.id, { archived: true });
			allItems = allItems.filter((i) => i.id !== item.id);
			inventoryItemsAPI.invalidateCache();
			if (selectedItem?.id === item.id) closeDetail();
			toastStore.success(`"${item.name}" archived`, 'Item Archived');
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to archive item', 'Error');
		}
	}

	// Keyboard: ESC closes modals / detail panel
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (showFullImage) {
				closeFullImage();
				return;
			}
			if (showItemModal) {
				closeItemModal();
				return;
			}
			if (selectedItem) {
				closeDetail();
				return;
			}
		}
	}

	// Input class helper
	const inputCls =
		'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20 transition';

	// Status badge helper — mirrors custodian logic
	function statusBadge(status: string): { cls: string; label: string } {
		switch (status) {
			case 'In Stock':
				return { cls: 'bg-emerald-100 text-emerald-800', label: 'In Stock' };
			case 'Low Stock':
				return { cls: 'bg-amber-100 text-amber-800', label: 'Low Stock' };
			case 'Out of Stock':
				return { cls: 'bg-red-100 text-red-800', label: 'Out of Stock' };
			case 'active':
				return { cls: 'bg-emerald-100 text-emerald-800', label: 'In Stock' };
			default:
				return { cls: 'bg-gray-100 text-gray-700', label: status || 'Unknown' };
		}
	}

	// ─── Derived lists (mirrors custodian) ───────────────────────────────────
	const activeItems = $derived(allItems.filter((i) => !i.archived));
	const lowStockItems = $derived(
		activeItems.filter((i) => i.status === 'Low Stock' || i.status === 'Out of Stock')
	);
	const requiredItems = $derived(activeItems.filter((i) => i.isrequired === true));

	// ─── Tab + filter state ───────────────────────────────────────────────────
	type MainTab = 'all-items' | 'required-items' | 'categories' | 'low-stock' | 'usage';
	let mainTab = $state<MainTab>('all-items');
	let selectedCategory = $state<InventoryCategory | null>(null);
	let sortOrder = $state<'az' | 'za'>('az');
	let query = $state('');
	const PAGE_SIZE = 20;
	let tablePage = $state(1);

	const filteredItems = $derived(
		activeItems.filter((item) => {
			const matchesCategory =
				!selectedCategory ||
				item.category?.toLowerCase().trim() === selectedCategory.name?.toLowerCase().trim();
			const q = query.toLowerCase();
			const matchesQuery = !q || item.name.toLowerCase().includes(q);
			return matchesCategory && matchesQuery;
		})
	);
	const sortedItems = $derived(
		[...filteredItems].sort((a, b) =>
			sortOrder === 'az' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
		)
	);
	const tablePages = $derived(Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE)));
	const displayItems = $derived(
		sortedItems.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE)
	);

	$effect(() => {
		filteredItems;
		sortOrder;
		tablePage = 1;
	});

	function switchTab(tab: MainTab) {
		mainTab = tab;
	}
	function clearCategoryFilter() {
		selectedCategory = null;
	}
	function openCategory(cat: InventoryCategory) {
		mainTab = 'all-items';
		selectedCategory = cat;
	}

	// ─── Toggle required status ───────────────────────────────────────────────
	async function handleTogglerequired(item: InventoryItem) {
		const newStatus = !item.isrequired;
		const confirmed = await confirmStore.confirm({
			type: newStatus ? 'info' : 'warning',
			title: newStatus ? 'Mark as required Item' : 'Remove from required Items',
			message: newStatus
				? `Mark "${item.name}" as a required item? It will always appear on student request forms.`
				: `Remove "${item.name}" from required items?`,
			confirmText: newStatus ? 'Mark as required' : 'Remove',
			cancelText: 'Cancel'
		});
		if (!confirmed) return;
		try {
			const updated = await inventoryItemsAPI.update(item.id, { isrequired: newStatus });
			allItems = allItems.map((i) => (i.id === item.id ? updated : i));
			if (selectedItem?.id === item.id) selectedItem = updated;
			toastStore.success(
				newStatus
					? `"${item.name}" is now a required item`
					: `"${item.name}" removed from required items`,
				'required Item Updated'
			);
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to update required status');
		}
	}

	// ─── Category management ──────────────────────────────────────────────────
	let showCategoryModal = $state(false);
	let showEditCategoryModal = $state(false);
	let editingCategory = $state<InventoryCategory | null>(null);
	let newCategoryName = $state('');
	let newCategoryDescription = $state('');
	let newCategoryPicture = $state('');
	let newCategoryPictureFile = $state<File | null>(null);
	let categoryPictureInput = $state<HTMLInputElement | null>(null);
	let editCategoryPictureInput = $state<HTMLInputElement | null>(null);
	let uploadingCategoryImage = $state(false);
	let openDropdownId = $state<string | null>(null);

	function toggleDropdown(id: string, e: Event) {
		e.stopPropagation();
		openDropdownId = openDropdownId === id ? null : id;
	}
	function closeDropdown() {
		openDropdownId = null;
	}

	async function handleCategoryPictureChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			toastStore.error('Please select an image file');
			return;
		}
		if (file.size > 10 * 1024 * 1024) {
			toastStore.error('Image must be under 10 MB');
			return;
		}
		if (newCategoryPicture.startsWith('blob:')) URL.revokeObjectURL(newCategoryPicture);
		newCategoryPictureFile = file;
		newCategoryPicture = URL.createObjectURL(file);
	}

	async function handleCreateCategory(e: Event) {
		e.preventDefault();
		if (!newCategoryName.trim()) {
			toastStore.error('Category name is required');
			return;
		}
		try {
			loading = true;
			let imageUrl = newCategoryPicture;
			if (newCategoryPictureFile && newCategoryPicture.startsWith('blob:')) {
				uploadingCategoryImage = true;
				const res = await uploadInventoryImage(newCategoryPictureFile);
				imageUrl = res.url;
				uploadingCategoryImage = false;
			}
			const created = await inventoryCategoriesAPI.create({
				name: newCategoryName,
				description: newCategoryDescription,
				picture: imageUrl
			});
			categories = [...categories, created];
			showCategoryModal = false;
			newCategoryName = '';
			newCategoryDescription = '';
			newCategoryPicture = '';
			newCategoryPictureFile = null;
			toastStore.success('Category created successfully');
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to create category');
		} finally {
			loading = false;
			uploadingCategoryImage = false;
		}
	}

	function openEditCategory(cat: InventoryCategory, e: Event) {
		e.stopPropagation();
		closeDropdown();
		editingCategory = cat;
		newCategoryName = cat.name;
		newCategoryDescription = cat.description || '';
		newCategoryPicture = cat.picture || '';
		newCategoryPictureFile = null;
		showEditCategoryModal = true;
	}

	async function handleEditCategory(e: Event) {
		e.preventDefault();
		if (!editingCategory || !newCategoryName.trim()) {
			toastStore.error('Category name is required');
			return;
		}
		try {
			loading = true;
			let imageUrl = newCategoryPicture;
			if (newCategoryPictureFile && newCategoryPicture.startsWith('blob:')) {
				uploadingCategoryImage = true;
				const res = await uploadInventoryImage(newCategoryPictureFile);
				imageUrl = res.url;
				uploadingCategoryImage = false;
			}
			const updated = await inventoryCategoriesAPI.update(editingCategory.id, {
				name: newCategoryName,
				description: newCategoryDescription,
				picture: imageUrl
			});
			categories = categories.map((c) => (c.id === editingCategory!.id ? updated : c));
			showEditCategoryModal = false;
			editingCategory = null;
			newCategoryName = '';
			newCategoryDescription = '';
			newCategoryPicture = '';
			newCategoryPictureFile = null;
			toastStore.success('Category updated successfully');
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to update category');
		} finally {
			loading = false;
			uploadingCategoryImage = false;
		}
	}

	async function deleteCategory(cat: InventoryCategory, e: Event) {
		e.stopPropagation();
		closeDropdown();
		if (cat.itemCount > 0) {
			toastStore.error(
				`Cannot delete "${cat.name}" — it has ${cat.itemCount} item(s). Reassign or delete items first.`
			);
			return;
		}
		const confirmed = await confirmStore.danger(
			`Remove category "${cat.name}"?`,
			'Remove Category',
			'Remove'
		);
		if (!confirmed) return;
		try {
			loading = true;
			await inventoryCategoriesAPI.delete(cat.id);
			categories = categories.filter((c) => c.id !== cat.id);
			toastStore.success('Category deleted successfully');
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to delete category');
		} finally {
			loading = false;
		}
	}

	// ─── Import (stub — opens modal placeholder) ──────────────────────────────
	// Full import logic lives in the custodian page; superadmin uses the same
	// API endpoints so a future task can lift the import engine here.
	let showImportModal = $state(false);

	function getCurrentCount(quantity: number, donations = 0): number {
		return quantity + donations;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>Inventory Overview | CHTM Cooks Superadmin</title>
</svelte:head>

<div class="w-full min-w-0 space-y-4">
	<!-- Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Inventory Overview</h1>
			<p class="mt-1 text-sm text-gray-500">
				Comprehensive view of equipment inventory, usage, and replacement needs
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				onclick={() => (showImportModal = true)}
				class="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none sm:px-4"
				disabled={loading}
			>
				<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
					/>
				</svg>
				<span class="hidden sm:inline">Import Items</span>
				<span class="sm:hidden">Import</span>
			</button>
			<button
				onclick={openCreateModal}
				class="inline-flex items-center rounded-lg bg-pink-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-pink-700 focus:ring-2 focus:ring-pink-500 focus:outline-none sm:px-4"
				disabled={loading}
			>
				<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4v16m8-8H4"
					/>
				</svg>
				<span class="hidden sm:inline">Add New Item</span>
				<span class="sm:hidden">Add Item</span>
			</button>
		</div>
	</div>

	{#if loading && allItems.length === 0}
		<InventorySkeletonLoader view="all-items" />
	{:else}
		<!-- High Level Stats — original superadmin cards -->
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<div class="rounded-lg bg-white p-3 shadow sm:p-5">
				<div class="flex items-center justify-between gap-2">
					<div class="min-w-0">
						<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Total Unique Items</p>
						<p class="mt-1 text-2xl font-semibold text-gray-900 sm:mt-2 sm:text-3xl">
							{allItems.length}
						</p>
						<p class="mt-0.5 text-xs text-gray-500">
							Across {new Set(allItems.map((i) => i.category)).size} categories
						</p>
					</div>
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 sm:h-12 sm:w-12"
					>
						<Package size={18} class="text-gray-500 sm:hidden" />
						<Package size={24} class="hidden text-gray-500 sm:block" />
					</div>
				</div>
			</div>
			<div class="rounded-lg bg-white p-3 shadow sm:p-5">
				<div class="flex items-center justify-between gap-2">
					<div class="min-w-0">
						<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">
							Total Physical Stock
						</p>
						<p class="mt-1 text-2xl font-semibold text-emerald-600 sm:mt-2 sm:text-3xl">
							{allItems
								.reduce((acc, curr) => acc + (curr.currentCount ?? curr.quantity), 0)
								.toLocaleString()}
						</p>
						<p class="mt-0.5 text-xs text-gray-500">Total tracked units</p>
					</div>
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 sm:h-12 sm:w-12"
					>
						<BarChart3 size={18} class="text-emerald-600 sm:hidden" />
						<BarChart3 size={24} class="hidden text-emerald-600 sm:block" />
					</div>
				</div>
			</div>
			<div class="rounded-lg bg-white p-3 shadow sm:p-5">
				<div class="flex items-center justify-between gap-2">
					<div class="min-w-0">
						<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Low Stock Alerts</p>
						<p
							class="mt-1 text-2xl font-semibold sm:mt-2 sm:text-3xl {lowStockItems.length > 0
								? 'text-amber-600'
								: 'text-gray-900'}"
						>
							{lowStockItems.length}
						</p>
						<p class="mt-0.5 text-xs text-gray-500">Items nearing depletion</p>
					</div>
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 sm:h-12 sm:w-12"
					>
						<AlertTriangle size={18} class="text-amber-500 sm:hidden" />
						<AlertTriangle size={24} class="hidden text-amber-500 sm:block" />
					</div>
				</div>
			</div>
			<div class="rounded-lg bg-white p-3 shadow sm:p-5">
				<div class="flex items-center justify-between gap-2">
					<div class="min-w-0">
						<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">required Items</p>
						<p class="mt-1 text-2xl font-semibold text-amber-600 sm:mt-2 sm:text-3xl">
							{requiredItems.length}
						</p>
						<p class="mt-0.5 text-xs text-gray-500">Always on request forms</p>
					</div>
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 sm:h-12 sm:w-12"
					>
						<Star size={18} class="text-amber-600 sm:hidden" />
						<Star size={24} class="hidden text-amber-600 sm:block" />
					</div>
				</div>
			</div>
		</div>

		<!-- Tabs -->
		<div class="border-b border-gray-200 bg-white">
			<nav class="-mb-px flex" aria-label="Inventory tabs">
				{#each [{ id: 'all-items', label: 'Stock Levels', icon: Package }, { id: 'required-items', label: 'required Items', icon: Star }, { id: 'categories', label: 'Categories', icon: FolderTree }, { id: 'usage', label: 'Usage Statistics', icon: Activity }] as tab}
					<button
						onclick={() => switchTab(tab.id as MainTab)}
						class="flex flex-1 items-center justify-center gap-1 border-b-2 px-1 py-3 text-[11px] font-medium whitespace-nowrap transition-colors sm:gap-2 sm:text-sm {mainTab ===
						tab.id
							? 'border-pink-600 text-pink-600'
							: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
					>
						<tab.icon size={14} class="shrink-0 sm:hidden" aria-hidden="true" />
						<tab.icon size={16} class="hidden shrink-0 sm:block" aria-hidden="true" />
						<span class="hidden sm:inline">{tab.label}</span>
						<span class="sm:hidden">{tab.label.split(' ')[0]}</span>
					</button>
				{/each}
			</nav>
		</div>

		<!-- Tab Content -->
		<div class="rounded-b-lg bg-white shadow">
			{#if mainTab === 'all-items'}
				<div class="p-4 sm:p-6">
					<div class="mb-4 flex flex-col gap-3">
						{#if selectedCategory}
							<div class="flex items-center gap-2">
								<span
									class="inline-flex items-center rounded-full bg-pink-100 px-3 py-1 text-sm font-medium text-pink-800"
									>Showing: {selectedCategory.name}</span
								>
								<button
									onclick={clearCategoryFilter}
									class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
									>Clear</button
								>
							</div>
						{/if}
						<div class="flex gap-2">
							<div class="relative flex-1">
								<input
									type="text"
									placeholder="Search items..."
									bind:value={query}
									class="w-full rounded-lg border border-gray-300 py-2 pr-3 pl-9 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
								/>
								<svg
									class="absolute top-2.5 left-3 h-4 w-4 text-gray-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
									/></svg
								>
							</div>
							<select
								bind:value={sortOrder}
								class="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
							>
								<option value="az">A – Z</option>
								<option value="za">Z – A</option>
							</select>
						</div>
					</div>

					{#if displayItems.length === 0}
						<div
							class="flex items-center justify-center rounded-lg bg-gray-50"
							style="min-height: 600px;"
						>
							<div class="px-4 text-center">
								<div
									class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pink-100"
								>
									<Package size={32} class="text-pink-600" />
								</div>
								<h3 class="mt-6 text-lg font-semibold text-gray-900">No items found</h3>
								<p class="mx-auto mt-2 max-w-sm text-sm text-gray-600">
									{#if query}No items match your search.{:else if selectedCategory}No items in this
										category.{:else}Add your first inventory item to get started.{/if}
								</p>
								{#if !selectedCategory && !query}
									<button
										onclick={openCreateModal}
										class="mt-6 inline-flex items-center gap-2 rounded-lg bg-pink-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-pink-700"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M12 4v16m8-8H4"
											/></svg
										>
										Add Your First Item
									</button>
								{/if}
							</div>
						</div>
					{:else}
						<!-- Desktop table -->
						<div class="hidden overflow-x-auto sm:block" style="min-height: 600px;">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Item Name</th
										>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Category</th
										>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Specification</th
										>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Tools / Equipment</th
										>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Current Count</th
										>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Status</th
										>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 bg-white">
									{#each displayItems as item, i}
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
										<tr
											class="cursor-pointer transition-colors hover:bg-gray-50"
											onclick={() => openDetail(item)}
											role="button"
											tabindex="0"
											onkeydown={(e) => e.key === 'Enter' && openDetail(item)}
										>
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="flex items-center gap-3">
													<span
														class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700"
														>{(tablePage - 1) * PAGE_SIZE + i + 1}</span
													>
													<div class="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-100">
														{#if item.picture}
															<img
																src={item.picture}
																alt={item.name}
																class="h-full w-full object-cover"
																loading="lazy"
															/>
														{:else}
															<div class="flex h-full w-full items-center justify-center">
																<Package size={18} class="text-gray-400" />
															</div>
														{/if}
													</div>
													<div class="flex flex-col gap-0.5">
														{#if item.isrequired}
															<span
																class="inline-flex w-fit items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-purple-800 uppercase ring-1 ring-purple-200"
															>
																<svg class="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20"
																	><path
																		d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
																	/></svg
																>
																required
															</span>
														{/if}
														<div class="text-sm font-medium text-gray-900">{item.name}</div>
													</div>
												</div>
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span
													class="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800"
													>{item.category}</span
												>
											</td>
											<td class="px-6 py-4 text-sm text-gray-700">{item.specification || '—'}</td>
											<td class="px-6 py-4 text-sm text-gray-700">{item.toolsOrEquipment || '—'}</td
											>
											<td class="px-6 py-4 text-sm font-medium whitespace-nowrap text-gray-900"
												>{item.currentCount ??
													getCurrentCount(item.quantity, item.donations ?? 0)}</td
											>
											<td class="px-6 py-4 whitespace-nowrap">
												{#if item.status === 'Low Stock' || item.status === 'Out of Stock'}
													<span
														class="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800"
													>
														<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"
															><path
																fill-rule="evenodd"
																d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
																clip-rule="evenodd"
															/></svg
														>
														{item.status}
													</span>
												{:else}
													<span
														class="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800"
													>
														<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"
															><path
																fill-rule="evenodd"
																d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
																clip-rule="evenodd"
															/></svg
														>
														{item.status}
													</span>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						<!-- Mobile card list -->
						<div class="divide-y divide-gray-100 sm:hidden">
							{#each displayItems as item, i}
								<button
									class="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50"
									onclick={() => openDetail(item)}
								>
									<div class="flex items-center gap-3">
										<span
											class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600"
											>{(tablePage - 1) * PAGE_SIZE + i + 1}</span
										>
										<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
											{#if item.picture}
												<img
													src={item.picture}
													alt={item.name}
													class="h-full w-full object-cover"
													loading="lazy"
												/>
											{:else}
												<div class="flex h-full w-full items-center justify-center">
													<Package size={20} class="text-gray-400" />
												</div>
											{/if}
										</div>
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-semibold text-gray-900">{item.name}</p>
											<p class="truncate text-xs text-gray-500">
												{item.specification || item.category}
											</p>
											<div class="mt-1 flex flex-wrap items-center gap-1">
												{#if item.isrequired}<span
														class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800"
														>required</span
													>{/if}
												<span
													class="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800"
													>{item.category}</span
												>
												{#if item.status === 'Low Stock' || item.status === 'Out of Stock'}
													<span
														class="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
														>{item.status}</span
													>
												{:else}
													<span
														class="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700"
														>{item.status}</span
													>
												{/if}
											</div>
										</div>
										<svg
											class="h-4 w-4 shrink-0 text-gray-300"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M9 5l7 7-7 7"
											/></svg
										>
									</div>
								</button>
							{/each}
						</div>

						<!-- Pagination -->
						{#if tablePages > 1}
							<div
								class="flex items-center justify-between border-t border-gray-200 px-4 py-3 sm:px-6"
							>
								<div class="text-sm text-gray-500">
									Showing {(tablePage - 1) * PAGE_SIZE + 1}–{Math.min(
										tablePage * PAGE_SIZE,
										sortedItems.length
									)} of {sortedItems.length} items
								</div>
								<nav class="flex items-center gap-1" aria-label="Pagination">
									<button
										onclick={() => (tablePage = Math.max(1, tablePage - 1))}
										disabled={tablePage === 1}
										class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-sm text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
										aria-label="Previous page"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M15 19l-7-7 7-7"
											/></svg
										>
									</button>
									{#each Array.from({ length: tablePages }, (_, i) => i + 1) as page}
										{#if tablePages <= 7 || page === 1 || page === tablePages || Math.abs(page - tablePage) <= 1}
											<button
												onclick={() => (tablePage = page)}
												class="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors {tablePage ===
												page
													? 'bg-pink-600 text-white shadow-sm'
													: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
												aria-label="Page {page}"
												aria-current={tablePage === page ? 'page' : undefined}>{page}</button
											>
										{:else if (page === tablePage - 2 || page === tablePage + 2) && tablePages > 7}
											<span
												class="inline-flex h-8 w-8 items-center justify-center text-sm text-gray-400"
												>…</span
											>
										{/if}
									{/each}
									<button
										onclick={() => (tablePage = Math.min(tablePages, tablePage + 1))}
										disabled={tablePage === tablePages}
										class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-sm text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
										aria-label="Next page"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M9 5l7 7-7 7"
											/></svg
										>
									</button>
								</nav>
							</div>
						{/if}
					{/if}
				</div>
			{/if}
			{#if mainTab === 'required-items'}
				<div class="p-4 sm:p-6">
					<div class="mb-4">
						<h3 class="text-base font-semibold text-gray-900 sm:text-lg">required Items</h3>
						<p class="mt-1 text-sm text-gray-500">
							Items that always appear on student request forms regardless of availability
						</p>
					</div>

					{#if requiredItems.length === 0}
						<div
							class="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-white"
							style="min-height: 600px;"
						>
							<div class="px-4 text-center">
								<div
									class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100"
								>
									<svg
										class="h-8 w-8 text-emerald-600"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
										/>
									</svg>
								</div>
								<h3 class="mt-6 text-lg font-semibold text-gray-900">
									No required items configured
								</h3>
								<p class="mx-auto mt-2 max-w-sm text-sm text-gray-600">
									Mark items as required from the Stock Levels tab to have them always appear on
									student request forms.
								</p>
								<button
									onclick={() => switchTab('all-items')}
									class="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:outline-none"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M15 19l-7-7 7-7"
										/>
									</svg>
									Go to Stock Levels
								</button>
							</div>
						</div>
					{:else}
						<!-- Mobile card list -->
						<div class="divide-y divide-gray-100 sm:hidden">
							{#each requiredItems as item, i}
								<button
									class="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
									onclick={() => openDetail(item)}
								>
									<div class="flex items-center gap-3">
										<span
											class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600"
											>{i + 1}</span
										>
										<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
											{#if item.picture}
												<img
													src={item.picture}
													alt={item.name}
													class="h-full w-full object-cover"
													loading="lazy"
												/>
											{:else}
												<div class="flex h-full w-full items-center justify-center">
													<Package size={20} class="text-gray-400" />
												</div>
											{/if}
										</div>
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-semibold text-gray-900">{item.name}</p>
											<p class="truncate text-xs text-gray-500">
												{item.specification || item.category}
											</p>
											<div class="mt-1 flex flex-wrap items-center gap-1">
												<span
													class="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-800 ring-1 ring-purple-200"
													>required</span
												>
												<span
													class="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800"
													>{item.category}</span
												>
												{#if item.status === 'Low Stock' || item.status === 'Out of Stock'}
													<span
														class="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
														>{item.status}</span
													>
												{:else}
													<span
														class="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700"
														>{item.status}</span
													>
												{/if}
												<span class="text-[10px] text-gray-400"
													>Qty: {item.quantity} · EOM: {item.eomCount}</span
												>
											</div>
										</div>
										<svg
											class="h-4 w-4 shrink-0 text-gray-300"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M9 5l7 7-7 7"
											/></svg
										>
									</div>
								</button>
							{/each}
						</div>

						<!-- Desktop table -->
						<div class="hidden overflow-x-auto sm:block" style="min-height: 600px;">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Item Name</th
										>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Category</th
										>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Specification</th
										>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Current Count</th
										>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Max Per Request</th
										>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Status</th
										>
										<th
											class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Actions</th
										>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 bg-white">
									{#each requiredItems as item, i}
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
										<tr
											class="cursor-pointer transition-colors hover:bg-gray-50"
											onclick={() => openDetail(item)}
											role="button"
											tabindex="0"
											onkeydown={(e) => e.key === 'Enter' && openDetail(item)}
										>
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="flex items-center gap-3">
													<div class="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-gray-100">
														{#if item.picture}
															<img
																src={item.picture}
																alt={item.name}
																class="h-full w-full object-cover"
																loading="lazy"
															/>
														{:else}
															<div class="flex h-full w-full items-center justify-center">
																<Package size={16} class="text-gray-400" />
															</div>
														{/if}
													</div>
													<div class="flex flex-col gap-0.5">
														<span
															class="inline-flex w-fit items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-purple-800 uppercase ring-1 ring-purple-200"
														>
															<svg class="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20"
																><path
																	d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
																/></svg
															>
															required
														</span>
														<div class="text-sm font-medium text-gray-900">{item.name}</div>
													</div>
												</div>
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span
													class="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800"
													>{item.category}</span
												>
											</td>
											<td class="px-6 py-4 text-sm text-gray-700">{item.specification || '—'}</td>
											<td class="px-6 py-4 text-sm font-medium whitespace-nowrap text-gray-900"
												>{item.currentCount ??
													getCurrentCount(item.quantity, item.donations ?? 0)}</td
											>
											<td class="px-6 py-4 whitespace-nowrap">
												{#if item.maxQuantityPerRequest}
													<span
														class="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-800"
													>
														{item.maxQuantityPerRequest}
													</span>
												{:else}
													<span class="text-xs text-gray-400">No limit</span>
												{/if}
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												{#if item.status === 'Low Stock' || item.status === 'Out of Stock'}
													<span
														class="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800"
													>
														<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"
															><path
																fill-rule="evenodd"
																d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
																clip-rule="evenodd"
															/></svg
														>
														{item.status}
													</span>
												{:else}
													<span
														class="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800"
													>
														<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"
															><path
																fill-rule="evenodd"
																d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
																clip-rule="evenodd"
															/></svg
														>
														{item.status}
													</span>
												{/if}
											</td>
											<td
												class="px-6 py-4 text-sm whitespace-nowrap"
												onclick={(e) => e.stopPropagation()}
											>
												<div class="flex items-center gap-2">
													<button
														onclick={() => openEditModal(item)}
														class="rounded p-1 text-pink-600 transition-colors hover:bg-pink-50 hover:text-pink-800"
														title="Edit item"
														aria-label="Edit {item.name}"
													>
														<Edit size={16} />
													</button>
													<button
														onclick={() => handleTogglerequired(item)}
														class="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
														title="Remove from required items"
														aria-label="Remove {item.name} from required items"
													>
														<X size={16} />
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
			{/if}
			{#if mainTab === 'categories'}
				<div class="p-4 sm:p-6">
					<div class="mb-4 flex items-center justify-between gap-3">
						<h3 class="text-base font-semibold text-gray-900 sm:text-lg">Item Categories</h3>
						<button
							onclick={() => (showCategoryModal = true)}
							class="inline-flex shrink-0 items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 sm:px-4 sm:py-2 sm:text-sm"
							disabled={loading}
						>
							<svg class="mr-1.5 h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 4v16m8-8H4"
								/></svg
							>
							Add Category
						</button>
					</div>
					{#if categories.length === 0}
						<div class="py-12 text-center">
							<FolderTree size={48} class="mx-auto text-pink-600" />
							<h3 class="mt-4 text-lg font-medium text-gray-900">No categories yet</h3>
							<p class="mt-2 text-sm text-gray-500">
								Create a category to organize your inventory items.
							</p>
							<button
								onclick={() => (showCategoryModal = true)}
								class="mt-4 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
							>
								<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 4v16m8-8H4"
									/></svg
								>
								Add Your First Category
							</button>
						</div>
					{:else}
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{#each categories as category}
								<div
									onclick={() => openCategory(category)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											openCategory(category);
										}
									}}
									role="button"
									tabindex="0"
									aria-label="Open category {category.name}"
									class="relative cursor-pointer rounded-lg border border-gray-200 p-3 transition-all hover:border-emerald-500 hover:shadow-md sm:p-4"
								>
									<div class="flex items-center justify-between gap-2">
										<div class="min-w-0 flex-1">
											<h4 class="truncate text-sm font-semibold text-gray-900 sm:text-base">
												{category.name}
											</h4>
											<p class="mt-0.5 text-xs text-gray-500">{category.itemCount} items</p>
											{#if category.description}<p class="mt-0.5 truncate text-xs text-gray-400">
													{category.description}
												</p>{/if}
										</div>
										<div class="flex shrink-0 items-center gap-2">
											{#if category.picture}
												<img
													src={category.picture}
													alt={category.name}
													class="h-9 w-9 rounded-full object-cover sm:h-10 sm:w-10"
												/>
											{:else}
												<span
													class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 sm:h-10 sm:w-10"
												>
													<Package size={18} />
												</span>
											{/if}
											<div class="relative">
												<button
													onclick={(e) => toggleDropdown(category.id, e)}
													class="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
													aria-label="Category options"
												>
													<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"
														><path
															d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
														/></svg
													>
												</button>
												{#if openDropdownId === category.id}
													<div
														class="ring-opacity-5 absolute right-0 z-30 mt-2 w-48 rounded-lg bg-white shadow-lg ring-1 ring-black"
													>
														<div class="py-1">
															<button
																onclick={(e) => openEditCategory(category, e)}
																class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
															>
																<Edit size={14} class="text-gray-500" /> Edit Category
															</button>
															<button
																onclick={(e) => deleteCategory(category, e)}
																class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm {category.itemCount >
																0
																	? 'cursor-not-allowed text-gray-400'
																	: 'text-red-600 hover:bg-red-50'}"
																disabled={category.itemCount > 0}
															>
																<Trash2 size={14} /> Remove Category
																{#if category.itemCount > 0}<span class="ml-auto text-xs"
																		>(has items)</span
																	>{/if}
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
			{/if}

			{#if mainTab === 'usage'}
				<div class="p-6">
					{#if analytics}
						<div class="mb-6 flex items-center justify-between">
							<h3 class="text-lg font-bold text-gray-900">Most Borrowed Items</h3>
							<span class="text-sm text-gray-500">Past 30 Days</span>
						</div>
						<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
							{#each analytics.inventory.mostBorrowedItems.slice(0, 6) as item, i}
								<div
									class="relative flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 transition hover:bg-gray-100 hover:shadow-sm"
								>
									<div
										class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pink-100 text-lg font-bold text-pink-700"
									>
										#{i + 1}
									</div>
									<div>
										<h4 class="font-bold text-gray-900">{item.name}</h4>
										<p class="mb-1 text-xs text-gray-500">{item.category}</p>
										<span
											class="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 shadow-sm"
										>
											<TrendingUp size={12} class="text-emerald-500" />
											{item.totalBorrows} borrows
										</span>
									</div>
								</div>
							{:else}
								<p
									class="text-sm text-gray-500 col-span-full py-8 text-center border-2 border-dashed border-gray-200 rounded-xl"
								>
									No usage statistics available for this period.
								</p>
							{/each}
						</div>

						<div class="mt-8 grid gap-6 lg:grid-cols-2">
							<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
								<h3 class="mb-4 font-bold text-gray-900">Request Turnaround Averages</h3>
								<div class="space-y-4">
									<div class="flex items-center justify-between">
										<span class="text-sm text-gray-600">Approval Time</span>
										<span class="font-bold text-gray-900"
											>{analytics.borrowRequests.turnaround.avgApprovalHours.toFixed(1)} hrs</span
										>
									</div>
									<div class="h-2 w-full rounded-full bg-gray-200">
										<div
											class="h-2 rounded-full bg-blue-500"
											style="width: {Math.min(
												100,
												(analytics.borrowRequests.turnaround.avgApprovalHours / 24) * 100
											)}%"
										></div>
									</div>
									<div class="mt-4 flex items-center justify-between">
										<span class="text-sm text-gray-600">Release Time</span>
										<span class="font-bold text-gray-900"
											>{analytics.borrowRequests.turnaround.avgReleaseHours.toFixed(1)} hrs</span
										>
									</div>
									<div class="h-2 w-full rounded-full bg-gray-200">
										<div
											class="h-2 rounded-full bg-emerald-500"
											style="width: {Math.min(
												100,
												(analytics.borrowRequests.turnaround.avgReleaseHours / 24) * 100
											)}%"
										></div>
									</div>
								</div>
							</div>
							<div
								class="flex flex-col justify-center rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
							>
								<div class="text-center">
									<h3 class="mb-2 font-bold text-gray-900">Overall Inventory Status</h3>
									<div
										class="mb-4 inline-flex h-32 w-32 items-center justify-center rounded-full border-8 border-pink-100"
									>
										<div class="text-center">
											<p class="text-2xl font-bold text-pink-600">
												{analytics.borrowRequests.statusBreakdown.find(
													(s) => s.status === 'borrowed'
												)?.count || 0}
											</p>
											<p class="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
												Active<br />Loans
											</p>
										</div>
									</div>
									<div class="mt-2 grid grid-cols-2 gap-4">
										<div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
											<p class="text-xl font-bold text-gray-900">
												{analytics.borrowRequests.statusBreakdown.find(
													(s) => s.status === 'pending_instructor'
												)?.count || 0}
											</p>
											<p class="text-xs text-gray-500">Pending</p>
										</div>
										<div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
											<p class="text-xl font-bold text-gray-900">
												{analytics.borrowRequests.overdueCount || 0}
											</p>
											<p class="text-xs text-red-500">Overdue</p>
										</div>
									</div>
								</div>
							</div>
						</div>
					{:else}
						<div class="py-16 text-center">
							<Activity size={40} class="mx-auto mb-3 text-gray-300" />
							<p class="text-sm text-gray-500">Usage statistics are loading…</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
<!-- ─── Item Detail Slide-over ────────────────────────────────────────────────── -->
{#if selectedItem}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<button
			type="button"
			class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
			onclick={closeDetail}
			aria-label="Close modal"
			tabindex="-1"
		></button>
		<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
			<div
				class="relative mx-0 w-full max-w-2xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:mx-auto sm:max-w-4xl sm:rounded-3xl"
			>
				<!-- Header -->
				<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
					<div class="px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
						<div class="flex items-start gap-3 sm:gap-4">
							{#if selectedItem.picture}
								<button
									type="button"
									onclick={openFullImage}
									class="group relative shrink-0 cursor-zoom-in transition-all"
									title="Click to view full size"
								>
									<div class="relative h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16">
										<img
											src={selectedItem.picture}
											alt={selectedItem.name}
											class="h-full w-full rounded-xl object-cover shadow-lg ring-2 ring-pink-200 sm:rounded-2xl"
											loading="lazy"
										/>
										<div
											class="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 transition-colors group-hover:bg-black/30 sm:rounded-2xl"
										>
											<svg
												class="h-4 w-4 text-white opacity-0 drop-shadow-lg transition-opacity group-hover:opacity-100 sm:h-5 sm:w-5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2.5"
													d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
												/>
											</svg>
										</div>
									</div>
								</button>
							{:else}
								<div
									class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg sm:h-14 sm:w-14 sm:rounded-2xl lg:h-16 lg:w-16"
								>
									<Package size={28} class="text-white" />
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<h2 class="text-base font-bold text-gray-900 sm:text-lg lg:text-xl">
									{selectedItem.name}
								</h2>
								<p class="mt-0.5 text-xs text-gray-500 sm:text-sm">{selectedItem.category}</p>
								<div class="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
									<span
										class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 shadow-sm ring-1 ring-black/5 sm:px-2.5 sm:py-1 {selectedItem.status ===
										'In Stock'
											? 'bg-green-100 text-green-800'
											: selectedItem.status === 'Low Stock'
												? 'bg-amber-100 text-amber-800'
												: 'bg-red-100 text-red-800'}"
									>
										<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
										<span class="text-[10px] font-bold sm:text-xs">{selectedItem.status}</span>
									</span>
									{#if selectedItem.isrequired}
										<span
											class="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-purple-800 shadow-sm ring-1 ring-purple-200 sm:px-2.5 sm:py-1"
										>
											<Star class="h-2.5 w-2.5 fill-current sm:h-3 sm:w-3" />
											<span class="text-[10px] font-bold sm:text-xs">required</span>
										</span>
									{/if}
								</div>
							</div>
							<button
								onclick={closeDetail}
								aria-label="Close modal"
								class="shrink-0 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 sm:rounded-xl sm:p-2"
							>
								<X size={20} />
							</button>
						</div>
					</div>
				</div>

				<!-- Content -->
				<div class="max-h-[calc(100vh-180px)] overflow-y-auto sm:max-h-[70vh]">
					<div class="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
						<div class="space-y-5 sm:space-y-6 lg:space-y-8">
							<!-- Item Details -->
							<div>
								<h3
									class="mb-3 flex items-center gap-2 text-xs font-bold tracking-wider text-gray-900 uppercase sm:mb-4 sm:text-sm"
								>
									<div class="h-1 w-1 rounded-full bg-pink-500"></div>
									Item Details
								</h3>
								<div class="grid grid-cols-2 gap-2 lg:gap-3">
									<div
										class="group rounded-lg border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:rounded-xl sm:p-4"
									>
										<div class="mb-1.5 flex items-center gap-1.5 sm:mb-2">
											<svg
												class="h-3 w-3 text-pink-500 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
												/>
											</svg>
											<p
												class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
											>
												Category
											</p>
										</div>
										<p class="truncate text-xs font-bold text-gray-900 sm:text-sm">
											{selectedItem.category}
										</p>
									</div>
									<div
										class="group rounded-lg border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:rounded-xl sm:p-4"
									>
										<div class="mb-1.5 flex items-center gap-1.5 sm:mb-2">
											<svg
												class="h-3 w-3 text-pink-500 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
												/>
											</svg>
											<p
												class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
											>
												Specification
											</p>
										</div>
										<p class="truncate text-xs font-bold text-gray-900 sm:text-sm">
											{selectedItem.specification || '—'}
										</p>
									</div>
									<div
										class="group rounded-lg border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:rounded-xl sm:p-4"
									>
										<div class="mb-1.5 flex items-center gap-1.5 sm:mb-2">
											<svg
												class="h-3 w-3 text-pink-500 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
												/>
											</svg>
											<p
												class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
											>
												Tools / Equipment
											</p>
										</div>
										<p class="truncate text-xs font-bold text-gray-900 sm:text-sm">
											{selectedItem.toolsOrEquipment || '—'}
										</p>
									</div>
									<div
										class="group rounded-lg border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:rounded-xl sm:p-4"
									>
										<div class="mb-1.5 flex items-center gap-1.5 sm:mb-2">
											<svg
												class="h-3 w-3 text-pink-500 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
												/>
											</svg>
											<p
												class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
											>
												Status
											</p>
										</div>
										<p class="truncate text-xs font-bold text-gray-900 sm:text-sm">
											{selectedItem.status}
										</p>
									</div>
								</div>
							</div>
							<!-- Stock Information -->
							<div>
								<h3
									class="mb-3 flex items-center gap-2 text-xs font-bold tracking-wider text-gray-900 uppercase sm:mb-4 sm:text-sm"
								>
									<div class="h-1 w-1 rounded-full bg-pink-500"></div>
									Stock Information
								</h3>
								<div class="grid grid-cols-3 gap-2 lg:gap-3">
									<div
										class="rounded-lg border border-gray-200 bg-linear-to-br from-white to-gray-50 p-2.5 sm:rounded-xl sm:p-3 lg:p-4"
									>
										<div class="mb-1 flex items-center gap-1 sm:mb-1.5 sm:gap-1.5">
											<div
												class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-100 sm:h-6 sm:w-6"
											>
												<Package size={12} class="text-blue-600" />
											</div>
											<p
												class="text-[8px] font-bold tracking-tight text-gray-500 uppercase sm:text-[9px] lg:text-xs"
											>
												Current
											</p>
										</div>
										<p class="text-lg font-bold text-gray-900 sm:text-xl lg:text-2xl">
											{selectedItem.currentCount ??
												getCurrentCount(selectedItem.quantity, selectedItem.donations ?? 0)}
										</p>
									</div>
									<div
										class="rounded-lg border border-gray-200 bg-linear-to-br from-white to-gray-50 p-2.5 sm:rounded-xl sm:p-3 lg:p-4"
									>
										<div class="mb-1 flex items-center gap-1 sm:mb-1.5 sm:gap-1.5">
											<div
												class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-purple-100 sm:h-6 sm:w-6"
											>
												<Clock size={12} class="text-purple-600" />
											</div>
											<p
												class="text-[8px] font-bold tracking-tight text-gray-500 uppercase sm:text-[9px] lg:text-xs"
											>
												EOM
											</p>
										</div>
										<p class="text-lg font-bold text-gray-900 sm:text-xl lg:text-2xl">
											{selectedItem.eomCount}
										</p>
									</div>
									<div
										class="rounded-lg border border-gray-200 bg-linear-to-br from-white to-gray-50 p-2.5 sm:rounded-xl sm:p-3 lg:p-4"
									>
										<div class="mb-1 flex items-center gap-1 sm:mb-1.5 sm:gap-1.5">
											<div
												class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md sm:h-6 sm:w-6 {selectedItem.variance >
												0
													? 'bg-green-100'
													: selectedItem.variance < 0
														? 'bg-red-100'
														: 'bg-gray-100'}"
											>
												<TrendingUp
													size={12}
													class={selectedItem.variance > 0
														? 'text-green-600'
														: selectedItem.variance < 0
															? 'text-red-600'
															: 'text-gray-600'}
												/>
											</div>
											<p
												class="text-[8px] font-bold tracking-tight text-gray-500 uppercase sm:text-[9px] lg:text-xs"
											>
												Variance
											</p>
										</div>
										<p
											class="text-lg font-bold sm:text-xl lg:text-2xl {selectedItem.variance > 0
												? 'text-green-600'
												: selectedItem.variance < 0
													? 'text-red-600'
													: 'text-gray-900'}"
										>
											{selectedItem.variance > 0 ? '+' : ''}{selectedItem.variance}
										</p>
									</div>
								</div>
							</div>
							{#if selectedItem.status === 'Low Stock' || selectedItem.status === 'Out of Stock'}
								<div
									class="rounded-xl border-2 border-amber-200 bg-linear-to-br from-amber-50 to-amber-100/50 p-4 sm:rounded-2xl sm:p-5"
								>
									<div class="flex gap-2.5 sm:gap-3">
										<div
											class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl {selectedItem.status ===
											'Out of Stock'
												? 'bg-red-500'
												: 'bg-amber-500'}"
										>
											<AlertTriangle size={18} class="text-white" />
										</div>
										<div class="min-w-0 flex-1">
											<p
												class="text-xs font-bold sm:text-sm {selectedItem.status === 'Out of Stock'
													? 'text-red-900'
													: 'text-amber-900'}"
											>
												{selectedItem.status === 'Out of Stock'
													? 'Out of Stock'
													: 'Low Stock Alert'}
											</p>
											<p
												class="mt-1 text-xs sm:text-sm {selectedItem.status === 'Out of Stock'
													? 'text-red-800'
													: 'text-amber-800'} leading-relaxed"
											>
												{#if selectedItem.status === 'Out of Stock'}This item is currently out of
													stock. Consider restocking.{:else}Stock levels are running low. Consider
													restocking soon.{/if}
											</p>
										</div>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Footer -->
				<div class="sticky bottom-0 border-t border-gray-200 bg-white">
					<div class="px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5">
						<div class="flex items-center justify-end gap-2">
							<ActionMenu
								side="left"
								align="right"
								triggerLabel="More actions for {selectedItem.name}"
								items={[
									{
										label: 'Edit Item',
										icon: Edit as unknown as LucideIcon,
										action: () => {
											if (selectedItem) openEditModal(selectedItem);
										},
										variant: 'default' as const
									},
									{
										label: selectedItem.isrequired ? 'Remove required' : 'Mark required',
										icon: (selectedItem.isrequired ? PinOff : Pin) as unknown as LucideIcon,
										action: () => {
											if (selectedItem) handleTogglerequired(selectedItem);
										},
										variant: 'default' as const
									},
									{
										label: 'Archive',
										icon: Archive as unknown as LucideIcon,
										action: () => {
											if (selectedItem) handleArchiveItem(selectedItem);
										},
										variant: 'warning' as const
									},
									{
										label: 'Remove',
										icon: Trash2 as unknown as LucideIcon,
										action: () => {
											if (selectedItem) handleDeleteItem(selectedItem);
										},
										variant: 'danger' as const,
										divider: true
									}
								] satisfies ActionMenuItem[]}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
<!-- ─── Full Screen Image Lightbox ──────────────────────────────────────────── -->
{#if showFullImage && selectedItem?.picture}
	<div class="fixed inset-0 z-60 flex items-center justify-center p-4">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 bg-black/90" onclick={closeFullImage}></div>
		<div class="relative z-61 max-h-[90vh] max-w-[90vw]">
			<button
				type="button"
				onclick={closeFullImage}
				class="absolute -top-12 right-0 text-white transition-colors hover:text-gray-300"
				aria-label="Close image (Esc)"
			>
				<X size={32} />
			</button>
			<img
				src={selectedItem.picture}
				alt={selectedItem.name}
				class="max-h-[90vh] max-w-full rounded-lg shadow-2xl"
			/>
		</div>
	</div>
{/if}
<!-- ─── Add / Edit Item Modal ────────────────────────────────────────────────── -->
{#if showItemModal}
	<div
		class="fixed inset-0 z-50 overflow-y-auto"
		role="dialog"
		aria-modal="true"
		aria-labelledby="item-modal-title"
	>
		<div
			class="fixed inset-0 cursor-default bg-black/40 backdrop-blur-sm transition-opacity"
			role="button"
			tabindex="0"
			aria-label="Close modal"
			onclick={closeItemModal}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					closeItemModal();
				}
			}}
		></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="animate-scaleIn relative z-50 w-full max-w-2xl rounded-xl bg-white shadow-2xl">
				<!-- Modal Header -->
				<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
					<div>
						<h2 id="item-modal-title" class="text-lg font-semibold text-gray-900">
							{editingItem ? 'Edit Item' : 'Add New Item'}
						</h2>
						<p class="mt-0.5 text-sm text-gray-500">
							Enter details for the {editingItem ? 'updated' : 'new'} inventory item
						</p>
					</div>
					<button
						onclick={closeItemModal}
						class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
						aria-label="Close modal"
						disabled={itemModalLoading}
					>
						<X size={20} />
					</button>
				</div>

				<!-- Modal Body -->
				<div class="max-h-[75vh] overflow-y-auto px-6 py-6">
					<form id="item-form" onsubmit={handleSaveItem} class="space-y-5">
						<div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
							<div>
								<label for="itemName" class="block text-sm font-medium text-gray-700"
									>Item Name *</label
								>
								<input
									type="text"
									id="itemName"
									bind:value={itemForm.name}
									required
									class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
									placeholder="e.g., Chef Knife Set"
								/>
							</div>
							<div>
								<label for="modalCategory" class="block text-sm font-medium text-gray-700"
									>Category *</label
								>
								{#if categories.length > 0}
									<select
										id="modalCategory"
										bind:value={itemForm.categoryId}
										onchange={(e) => {
											const cat = categories.find(
												(c) => c.id === (e.target as HTMLSelectElement).value
											);
											if (cat) itemForm.category = cat.name;
										}}
										required
										class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
									>
										<option value="">Select a category</option>
										{#each categories as cat}
											<option value={cat.id}>{cat.name}</option>
										{/each}
									</select>
								{:else}
									<input
										type="text"
										id="modalCategory"
										bind:value={itemForm.category}
										required
										class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
										placeholder="e.g., Stock Room"
									/>
								{/if}
							</div>
							<div>
								<label for="modalSpec" class="block text-sm font-medium text-gray-700"
									>Specification</label
								>
								<input
									type="text"
									id="modalSpec"
									bind:value={itemForm.specification}
									class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
									placeholder="e.g., Stainless steel, 8-piece"
								/>
							</div>
							<div>
								<label for="modalTools" class="block text-sm font-medium text-gray-700"
									>Tools / Equipment</label
								>
								<input
									type="text"
									id="modalTools"
									bind:value={itemForm.toolsOrEquipment}
									class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
									placeholder="e.g., Power adapter, Sheath"
								/>
							</div>
							<div>
								<label for="modalQty" class="block text-sm font-medium text-gray-700"
									>Current Count *</label
								>
								<input
									type="number"
									id="modalQty"
									bind:value={itemForm.quantity}
									required
									min="0"
									class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
									placeholder="0"
								/>
							</div>
							<div>
								<label for="modalEom" class="block text-sm font-medium text-gray-700"
									>EOM Count</label
								>
								<input
									type="number"
									id="modalEom"
									bind:value={itemForm.eomCount}
									min="0"
									class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
									placeholder="0"
								/>
							</div>
						</div>

						<!-- required Item -->
						<div class="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
							<label class="flex cursor-pointer items-start gap-3">
								<input
									type="checkbox"
									bind:checked={itemForm.isrequired}
									class="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
								/>
								<div class="flex-1">
									<span class="text-sm font-medium text-gray-900">Mark as required Item</span>
									<p class="mt-0.5 text-xs text-gray-600">
										required items always appear on student request forms.
									</p>
								</div>
							</label>
							{#if itemForm.isrequired}
								<div class="mt-3 border-t border-emerald-200 pt-3">
									<label for="maxQtyPerReq" class="mb-1 block text-sm font-medium text-gray-900"
										>Maximum Quantity Per Request <span class="text-xs font-normal text-gray-500"
											>(Optional)</span
										></label
									>
									<input
										type="number"
										id="maxQtyPerReq"
										bind:value={itemForm.maxQuantityPerRequest}
										min="1"
										step="1"
										placeholder="e.g., 5 (leave empty for unlimited)"
										class="block w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
									/>
									<p class="mt-1 text-xs text-gray-600">Leave empty for unlimited requests.</p>
								</div>
							{/if}
						</div>

						<!-- Image Upload -->
						<div
							class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
							aria-live="polite"
						>
							<label
								for="modalPicture"
								class="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gray-700 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:ring-2 focus:ring-gray-500 focus:outline-none disabled:opacity-50"
							>
								{#if uploadingImage}
									<RefreshCw size={16} class="animate-spin" /> Uploading...
								{:else}
									<Upload size={16} /> Upload Image
								{/if}
								<input
									id="modalPicture"
									type="file"
									accept="image/*"
									onchange={handlePictureChange}
									class="sr-only"
									disabled={uploadingImage || itemModalLoading}
								/>
							</label>
							<span class="flex-1 truncate text-sm text-gray-500"
								>{itemForm.pictureFile ? itemForm.pictureFile.name : 'No file chosen'}</span
							>
							{#if itemForm.picture}
								<img
									src={itemForm.picture}
									alt="preview"
									class="h-12 w-12 rounded-lg border border-gray-200 object-cover"
								/>
								<button
									type="button"
									onclick={() => {
										try {
											URL.revokeObjectURL(itemForm.picture);
										} catch (e) {}
										itemForm.picture = '';
										itemForm.pictureFile = null;
									}}
									class="text-sm text-red-500 hover:text-red-700"
									aria-label="Remove image">Remove</button
								>
							{/if}
						</div>
					</form>
				</div>

				<!-- Modal Footer -->
				<div
					class="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4"
				>
					<button
						type="button"
						onclick={closeItemModal}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium whitespace-nowrap text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 sm:text-sm"
						disabled={itemModalLoading}>Cancel</button
					>
					<button
						type="submit"
						form="item-form"
						class="inline-flex items-center rounded-lg bg-pink-600 px-4 py-2 text-xs font-medium whitespace-nowrap text-white shadow-sm hover:bg-pink-700 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 sm:text-sm"
						disabled={itemModalLoading || uploadingImage}
					>
						{#if itemModalLoading}
							<RefreshCw size={16} class="mr-2 animate-spin" />
						{:else}
							<CheckCircle size={16} class="mr-2" />
						{/if}
						{editingItem ? 'Update Item' : 'Add Item'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
<!-- ─── Add Category Modal ───────────────────────────────────────────────────── -->
{#if showCategoryModal}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-sm"
			role="button"
			tabindex="0"
			aria-label="Close"
			onclick={() => (showCategoryModal = false)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					showCategoryModal = false;
				}
			}}
		></div>
		<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
			<div
				class="relative z-50 w-full max-w-md rounded-t-2xl border border-gray-100 bg-white shadow-2xl sm:rounded-2xl"
			>
				<div class="border-b border-gray-200 px-4 py-3 sm:px-5 sm:py-4">
					<h3 class="text-base font-semibold text-gray-900 sm:text-lg">Add New Category</h3>
					<p class="mt-1 text-xs text-gray-500">Create a category to organize inventory items.</p>
				</div>
				<div class="max-h-[70vh] overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
					<form onsubmit={handleCreateCategory} class="space-y-3">
						<div>
							<label for="catName" class="block text-sm font-medium text-gray-700"
								>Category Name *</label
							>
							<input
								type="text"
								id="catName"
								bind:value={newCategoryName}
								required
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
								placeholder="e.g., Cookware"
							/>
						</div>
						<div>
							<label for="catDesc" class="block text-sm font-medium text-gray-700"
								>Description</label
							>
							<input
								type="text"
								id="catDesc"
								bind:value={newCategoryDescription}
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
								placeholder="Optional description"
							/>
						</div>
						<div>
							<label for="catImgInput" class="mb-2 block text-sm font-medium text-gray-700"
								>Category Image</label
							>
							<div
								class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5"
							>
								<button
									type="button"
									onclick={() => categoryPictureInput?.click()}
									class="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-pink-700"
									disabled={uploadingCategoryImage || loading}
								>
									{#if uploadingCategoryImage}<RefreshCw
											size={14}
											class="animate-spin"
										/>{:else}<Upload size={14} />{/if}
									Upload Image
								</button>
								<span class="min-w-0 flex-1 truncate text-xs text-gray-600"
									>{newCategoryPictureFile ? newCategoryPictureFile.name : 'No file chosen'}</span
								>
								{#if newCategoryPicture}
									<img
										src={newCategoryPicture}
										alt="preview"
										class="h-14 w-14 rounded-lg border border-gray-200 object-cover"
									/>
									<button
										type="button"
										onclick={() => {
											try {
												URL.revokeObjectURL(newCategoryPicture);
											} catch (e) {}
											newCategoryPicture = '';
											newCategoryPictureFile = null;
										}}
										class="text-xs text-red-500 hover:text-red-700">Remove</button
									>
								{/if}
								<input
									id="catImgInput"
									type="file"
									accept="image/*"
									onchange={handleCategoryPictureChange}
									bind:this={categoryPictureInput}
									class="hidden"
								/>
							</div>
						</div>
						<div class="flex flex-col-reverse gap-1.5 pt-1.5 sm:flex-row sm:justify-end">
							<button
								type="button"
								onclick={() => {
									showCategoryModal = false;
									newCategoryName = '';
									newCategoryDescription = '';
									if (newCategoryPicture.startsWith('blob:')) {
										try {
											URL.revokeObjectURL(newCategoryPicture);
										} catch (e) {}
									}
									newCategoryPicture = '';
									newCategoryPictureFile = null;
								}}
								class="inline-flex min-w-27 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
								>Cancel</button
							>
							<button
								type="submit"
								class="inline-flex min-w-27 items-center justify-center rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-pink-700"
								disabled={loading}>Create Category</button
							>
						</div>
					</form>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- ─── Edit Category Modal ──────────────────────────────────────────────────── -->
{#if showEditCategoryModal && editingCategory}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-sm"
			role="button"
			tabindex="0"
			aria-label="Close"
			onclick={() => (showEditCategoryModal = false)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					showEditCategoryModal = false;
				}
			}}
		></div>
		<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
			<div
				class="relative z-50 w-full max-w-md rounded-t-2xl border border-gray-100 bg-white shadow-2xl sm:rounded-2xl"
			>
				<div class="border-b border-gray-200 px-4 py-3 sm:px-5 sm:py-4">
					<h3 class="text-base font-semibold text-gray-900 sm:text-lg">Edit Category</h3>
					<p class="mt-1 text-xs text-gray-500">Update category details.</p>
				</div>
				<div class="max-h-[70vh] overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
					<form onsubmit={handleEditCategory} class="space-y-3">
						<div>
							<label for="editCatName" class="block text-sm font-medium text-gray-700"
								>Category Name *</label
							>
							<input
								type="text"
								id="editCatName"
								bind:value={newCategoryName}
								required
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
								placeholder="e.g., Cookware"
							/>
						</div>
						<div>
							<label for="editCatDesc" class="block text-sm font-medium text-gray-700"
								>Description</label
							>
							<input
								type="text"
								id="editCatDesc"
								bind:value={newCategoryDescription}
								class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
								placeholder="Optional description"
							/>
						</div>
						<div>
							<label for="editCatImgInput" class="mb-2 block text-sm font-medium text-gray-700"
								>Category Image</label
							>
							<div
								class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5"
							>
								<button
									type="button"
									onclick={() => editCategoryPictureInput?.click()}
									class="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-pink-700"
									disabled={uploadingCategoryImage || loading}
								>
									{#if uploadingCategoryImage}<RefreshCw
											size={14}
											class="animate-spin"
										/>{:else}<Upload size={14} />{/if}
									Upload Image
								</button>
								<span class="min-w-0 flex-1 truncate text-xs text-gray-600"
									>{newCategoryPictureFile ? newCategoryPictureFile.name : 'No file chosen'}</span
								>
								{#if newCategoryPicture}
									<img
										src={newCategoryPicture}
										alt="preview"
										class="h-14 w-14 rounded-lg border border-gray-200 object-cover"
									/>
									<button
										type="button"
										onclick={() => {
											try {
												if (newCategoryPicture.startsWith('blob:'))
													URL.revokeObjectURL(newCategoryPicture);
											} catch (e) {}
											newCategoryPicture = editingCategory?.picture || '';
											newCategoryPictureFile = null;
										}}
										class="text-xs text-red-500 hover:text-red-700">Remove</button
									>
								{/if}
								<input
									id="editCatImgInput"
									type="file"
									accept="image/*"
									onchange={handleCategoryPictureChange}
									bind:this={editCategoryPictureInput}
									class="hidden"
								/>
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
									if (newCategoryPicture.startsWith('blob:')) {
										try {
											URL.revokeObjectURL(newCategoryPicture);
										} catch (e) {}
									}
									newCategoryPicture = '';
									newCategoryPictureFile = null;
								}}
								class="inline-flex min-w-27 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
								>Cancel</button
							>
							<button
								type="submit"
								class="inline-flex min-w-27 items-center justify-center rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-pink-700"
								disabled={loading}>Save Changes</button
							>
						</div>
					</form>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- ─── Import Placeholder Modal ─────────────────────────────────────────────── -->
{#if showImportModal}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-sm"
			role="button"
			tabindex="0"
			aria-label="Close"
			onclick={() => (showImportModal = false)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					showImportModal = false;
				}
			}}
		></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative z-50 w-full max-w-md rounded-xl bg-white shadow-2xl">
				<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
					<div>
						<h2 class="text-lg font-semibold text-gray-900">Import Inventory Items</h2>
						<p class="mt-0.5 text-sm text-gray-500">Bulk import via CSV or Excel</p>
					</div>
					<button
						onclick={() => (showImportModal = false)}
						class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
						aria-label="Close"><X size={20} /></button
					>
				</div>
				<div class="px-6 py-8 text-center">
					<div
						class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100"
					>
						<svg
							class="h-8 w-8 text-emerald-600"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
							/></svg
						>
					</div>
					<h3 class="text-base font-semibold text-gray-900">Bulk Import</h3>
					<p class="mx-auto mt-2 max-w-xs text-sm text-gray-500">
						Use the Custodian Inventory page for full CSV/Excel import with image support. The same
						inventory data is shared across all roles.
					</p>
					<button
						onclick={() => (showImportModal = false)}
						class="mt-6 inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						>Close</button
					>
				</div>
			</div>
		</div>
	</div>
{/if}
