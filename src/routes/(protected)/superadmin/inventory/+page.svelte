<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { browser } from '$app/environment';
	import type { InventoryItem, InventoryCategory } from '$lib/api/inventory';
	import {
		inventoryItemsAPI,
		inventoryCategoriesAPI,
		uploadInventoryImage,
		subscribeToInventoryChanges
	} from '$lib/api/inventory';
	import { donationsAPI } from '$lib/api/donations';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import { inventoryStore } from '$lib/stores/inventory';
	import InventorySkeletonLoader from '$lib/components/ui/InventorySkeletonLoader.svelte';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import {
		Package,
		FolderTree,
		AlertTriangle,
		Star,
		Archive,
		Trash2,
		Edit,
		Sliders,
		Download,
		Activity,
		TrendingUp,
		Clock
	} from 'lucide-svelte';
	import ActionMenu from '$lib/components/ui/ActionMenu.svelte';
	import ExportModal from '$lib/components/custodian/ExportModal.svelte';
	import {
		fetchAnalytics,
		peekCachedAnalytics,
		subscribeToAnalyticsChanges,
		type AnalyticsReport
	} from '$lib/api/analyticsReports';

	type Tab = 'all-items' | 'categories' | 'usage';

	let activeTab = $state<Tab>('all-items');
	let requiredFilter = $state<'all' | 'required' | 'regular'>('all');
	let statusFilter = $state<'all' | 'in-stock' | 'low-stock' | 'out-of-stock'>('all');
	let showAddItemModal = $state(false);

	// Stock adjustment modal states
	let showAdjustStockModal = $state(false);
	let adjustingItem = $state<InventoryItem | null>(null);
	let adjustmentType = $state<'add' | 'subtract'>('add');
	let adjustmentQuantity = $state<number>(1);
	let adjustmentReason = $state<string>('');
	let adjustStockLoading = $state(false);

	// Export modal state
	let showExportModal = $state(false);
	let isExporting = $state(false);

	// Check for cached data before mounting to avoid unnecessary loading states
	const cachedStore = browser ? get(inventoryStore) : null;
	const hasCachedData =
		cachedStore && cachedStore.items.length > 0 && inventoryStore.isItemsCacheValid();

	// Data from store with client-side caching
	let items = $state<InventoryItem[]>(hasCachedData ? cachedStore!.items : []);
	let categories = $state<InventoryCategory[]>(hasCachedData ? cachedStore!.categories : []);
	let analytics = $state<AnalyticsReport | null>(
		browser ? peekCachedAnalytics({ period: 'month' }) : null
	);
	let loading = $state(false); // Only show skeleton if no cached data
	let uploadingImage = $state(false);
	let initialLoadComplete = $state(true); // Mark as complete if we have cached data

	let cardsLoading = $state(!hasCachedData);
	let itemsTabLoading = $state(!hasCachedData);
	let categoriesTabLoading = $state(!hasCachedData);
	let usageStatsLoading = $state(!hasCachedData);
	let inFlightLoadId = 0;
	let firstPageResponse: any = null;

	async function fetchItemsPage(page: number, forceRefresh: boolean) {
		const cacheValid = inventoryStore.isItemsCacheValid();
		if (!forceRefresh && cacheValid && page === 1) {
			const storeData = get(inventoryStore);
			items = storeData.items;
			firstPageResponse = {
				items: storeData.items,
				total: storeData.items.length,
				page: 1,
				limit: INVENTORY_FETCH_PAGE_SIZE,
				pages: 1
			};
			return firstPageResponse;
		}

		const response = await inventoryItemsAPI.getAll({
			page,
			limit: INVENTORY_FETCH_PAGE_SIZE,
			includeArchived: true,
			forceRefresh
		});

		if (page === 1) {
			firstPageResponse = response;
			items = response.items;
		} else {
			const existingIds = new Set(items.map((i) => i.id));
			const newItems = response.items.filter((i) => !existingIds.has(i.id));
			items = [...items, ...newItems];
		}

		inventoryStore.setItems(items);
		return response;
	}

	async function loadInventoryProgressive(shouldForceRefresh: boolean) {
		const loadId = ++inFlightLoadId;
		try {
			// Step 1: Load the cards (categories + page 1 items)
			await Promise.allSettled([
				loadCategories(shouldForceRefresh),
				fetchItemsPage(1, shouldForceRefresh)
			]);

			if (loadId !== inFlightLoadId) return;
			cardsLoading = false;

			// Step 2: Load/display the items tab
			itemsTabLoading = false;

			// Step 3: Load/display the categories tab
			categoriesTabLoading = false;

			// Step 4: Load usage statistics (analytics)
			try {
				const analyticsRes = await fetchAnalytics({ period: 'month', forceRefresh: shouldForceRefresh });
				if (loadId === inFlightLoadId) {
					analytics = analyticsRes;
				}
			} catch (err) {
				console.error('[SUPERADMIN-INVENTORY] Failed to fetch analytics:', err);
			}
			if (loadId !== inFlightLoadId) return;
			usageStatsLoading = false;

			// Load the remaining pages of items sequentially in the background
			const totalPagesCount = firstPageResponse?.pages ?? 1;
			const cacheValid = inventoryStore.isItemsCacheValid();
			if (totalPagesCount > 1 && !(!shouldForceRefresh && cacheValid)) {
				for (let p = 2; p <= totalPagesCount; p++) {
					if (loadId !== inFlightLoadId) return;
					await fetchItemsPage(p, shouldForceRefresh);
				}
			}
		} catch (err) {
			console.error('[INVENTORY-SSE] Progressive load error:', err);
		} finally {
			if (loadId === inFlightLoadId) {
				loading = false;
				initialLoadComplete = true;
				cardsLoading = false;
				itemsTabLoading = false;
				categoriesTabLoading = false;
				usageStatsLoading = false;
			}
		}
	}

	// Real-time refresh state
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let refreshInFlight = $state(false);
	let pendingRefresh = $state(false);
	let lastEventReceived = $state<string | null>(null);
	let lastRefreshTime = $state<string | null>(null);

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
		isrequired: false,
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
	let importAmbiguousImageNames = $state<Set<string>>(new Set());
	let importProgress = $state({ current: 0, total: 0, message: '' });
	let isDraggingOver = $state(false);

	let selectedImportFields = $state({
		name: true,
		category: true,
		specification: true,
		toolsOrEquipment: true,
		quantity: true,     // Current Count
		eomCount: true,
		variance: true,     // Variance
		donations: true,
		picture: true       // Image
	});

	function toggleAllImportFields(val: boolean) {
		selectedImportFields.name = val;
		selectedImportFields.category = val;
		selectedImportFields.specification = val;
		selectedImportFields.toolsOrEquipment = val;
		selectedImportFields.quantity = val;
		selectedImportFields.eomCount = val;
		selectedImportFields.variance = val;
		selectedImportFields.donations = val;
		selectedImportFields.picture = val;
	}

	let processedImportPreviewData = $derived.by(() => {
		return importPreviewData.map((item) => {
			const isSelected = item._selected !== false;
			if (!item._valid) return { ...item, _selected: isSelected };

			if (!isSelected) {
				return {
					...item,
					_selected: false,
					_importAction: 'skip',
					_changedFields: []
				};
			}

			if (item._importAction === 'create') return { ...item, _selected: true };

			// Recalculate action and changed fields based on user toggles
			const newChangedFields: string[] = [];
			
			if (selectedImportFields.category && item._provided.category) {
				const existing = items.find(existingItem => existingItem.id === item._existingItemId);
				if (existing && normalizeKeyPart(existing.category) !== normalizeKeyPart(item.category)) {
					newChangedFields.push('category');
				}
			}
			if (selectedImportFields.toolsOrEquipment && item._provided.toolsOrEquipment) {
				const existing = items.find(existingItem => existingItem.id === item._existingItemId);
				if (existing && normalizeKeyPart(existing.toolsOrEquipment || '') !== normalizeKeyPart(item.toolsOrEquipment || '')) {
					newChangedFields.push('tools/equipment');
				}
			}
			if (selectedImportFields.quantity && item._provided.quantity) {
				const existing = items.find(existingItem => existingItem.id === item._existingItemId);
				if (existing && (existing.quantity ?? 0) !== item.quantity) {
					newChangedFields.push('quantity');
				}
			}
			if (selectedImportFields.eomCount && item._provided.eomCount) {
				const existing = items.find(existingItem => existingItem.id === item._existingItemId);
				if (existing && (existing.eomCount ?? 0) !== item.eomCount) {
					newChangedFields.push('eomCount');
				}
			}
			if (selectedImportFields.donations && item._provided.donations) {
				const existing = items.find(existingItem => existingItem.id === item._existingItemId);
				if (existing && (existing.donations ?? 0) !== item.donations) {
					newChangedFields.push('donations');
				}
			}
			if (selectedImportFields.picture && item._hasImage) {
				const existing = items.find(existingItem => existingItem.id === item._existingItemId);
				if (existing) {
					if (item._imageSource === 'url') {
						if ((existing.picture || '') !== item._pictureRef) {
							newChangedFields.push('picture');
						}
					} else {
						newChangedFields.push('picture');
					}
				}
			}

			const existing = items.find(existingItem => existingItem.id === item._existingItemId);
			if (existing && existing.archived) {
				newChangedFields.push('archived->active');
			}

			const action = newChangedFields.length > 0 ? 'update' : 'no-change';
			return {
				...item,
				_selected: true,
				_importAction: action,
				_changedFields: newChangedFields
			};
		});
	});

	let allRowsSelected = $derived(
		importPreviewData.length > 0 && importPreviewData.every((i) => i._selected !== false)
	);

	function toggleAllRows(e: Event) {
		const checked = (e.target as HTMLInputElement).checked;
		for (const item of importPreviewData) {
			item._selected = checked;
		}
	}

	$effect(() => {
		if (showImportModal) {
			toggleAllImportFields(true);
		}
	});
	let importPreviewImageUrl = $state<string | null>(null); // lightbox for import preview
	let importPreviewImageName = $state<string>('');
	let showFormatGuide = $state(false); // collapsible format guide
	const INVENTORY_FETCH_PAGE_SIZE = 500;
	const IMPORT_BATCH_SIZE = 100;
	const IMPORT_UPDATE_CONCURRENCY = 6;
	const IMPORT_PARSE_YIELD_EVERY = 150;
	const IMPORT_RECOMMENDED_FILE_SIZE_BYTES = 25 * 1024 * 1024;
	const IMPORT_RECOMMENDED_FILE_SIZE_LABEL = '25 MB';
	const IMPORT_HARD_FILE_SIZE_BYTES = 512 * 1024 * 1024;
	const IMPORT_HARD_FILE_SIZE_LABEL = '512 MB';
	let importSessionId = 0;

	// Load data on component mount
	onMount(() => {
		console.log('[INVENTORY-SSE]  Component mounted, loading data...');
		console.log('[INVENTORY-SSE]  Has cached data:', hasCachedData);

		// Check if we should force refresh based on navigation
		const shouldForceRefresh = !inventoryStore.isItemsCacheValid();

		if (shouldForceRefresh) {
			console.log('[INVENTORY-SSE]  Cache invalid, forcing refresh');
			inventoryStore.invalidateAll();
		} else {
			console.log('[INVENTORY-SSE]  Cache valid, using cached data');
		}

		// Load data using progressive loading flow
		loadInventoryProgressive(shouldForceRefresh);

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

	/**
	 * Refresh inventory data (debounced, prevents concurrent refreshes)
	 * Industry-standard pattern used by Shopify, Stripe, etc.
	 */
	async function refreshInventory(): Promise<void> {
		console.log('[INVENTORY-SSE] 🔄 refreshInventory called, refreshInFlight:', refreshInFlight);
		console.log('[INVENTORY-SSE] 📊 Current items count BEFORE refresh:', items.length);

		if (refreshInFlight) {
			console.log('[INVENTORY-SSE] ⏸️ Already refreshing, setting pendingRefresh=true');
			pendingRefresh = true;
			return;
		}

		refreshInFlight = true;
		try {
			console.log('[INVENTORY-SSE] 🗑️ Invalidating cache...');
			// Invalidate store cache to force fresh data
			inventoryStore.invalidateAll();

			const stats = inventoryStore.getStats();
			console.log('[INVENTORY-SSE] 📊 Cache stats after invalidation:', stats);

			console.log('[INVENTORY-SSE] 📥 Fetching fresh data from API (bypassing all caches)...');

			// Fetch fresh data directly without using cache
			const [freshItems, categoriesResponse, analyticsRes] = await Promise.all([
				fetchAllInventoryItems(true, true),
				inventoryCategoriesAPI.getAll({ includeArchived: true }),
				fetchAnalytics({ period: 'month', forceRefresh: true }).catch((err) => {
					console.error('[SUPERADMIN-INVENTORY] Failed to refresh analytics:', err);
					return null;
				})
			]);

			console.log('[INVENTORY-SSE] ✅ Fresh data received from API');
			console.log('[INVENTORY-SSE] 📦 Fresh items count:', freshItems.length);
			console.log('[INVENTORY-SSE] 📦 Current items count BEFORE assignment:', items.length);

			// Update reactive state immediately
			// This triggers Svelte's reactivity system
			items = freshItems;
			categories = categoriesResponse.categories;
			if (analyticsRes) {
				analytics = analyticsRes;
			}

			console.log('[INVENTORY-SSE] 📦 Current items count AFTER assignment:', items.length);

			// Update cache with fresh data
			inventoryStore.setItems(freshItems);
			inventoryStore.setCategories(categoriesResponse.categories);

			// Update last refresh time
			lastRefreshTime = new Date().toLocaleTimeString();

			console.log('[INVENTORY-SSE] ✅ Reactive state and cache updated');
			if (items.length > 0) {
				const firstItem = items[0];
				console.log('[INVENTORY-SSE] 📦 First item details:', {
					name: firstItem.name,
					quantity: firstItem.quantity,
					donations: firstItem.donations,
					currentCount: firstItem.currentCount,
					id: firstItem.id
				});
			}

			// Force a small delay to ensure reactivity propagates
			await new Promise((resolve) => setTimeout(resolve, 50));
			console.log('[INVENTORY-SSE] ✅ Reactivity propagation complete');
		} catch (error) {
			console.error('[INVENTORY-SSE] ❌ Failed to refresh inventory:', error);
		} finally {
			refreshInFlight = false;
			if (pendingRefresh) {
				console.log('[INVENTORY-SSE] 🔁 Pending refresh detected, running again...');
				pendingRefresh = false;
				await refreshInventory();
			}
		}
	}

	/**
	 * Optimistically update a single item without refetching all data
	 * This provides instant UI updates without loading states
	 */
	async function updateSingleItem(itemId: string): Promise<void> {
		console.log('[INVENTORY-SSE] 🎯 Updating single item:', itemId);

		try {
			// Fetch just the updated item
			const updatedItem = await inventoryItemsAPI.getById(itemId);
			if (!updatedItem) {
				console.warn('[INVENTORY-SSE] ⚠️ Item not found:', itemId);
				return;
			}
			console.log('[INVENTORY-SSE] ✅ Fetched updated item:', updatedItem.name);

			// Find and update the item in the array
			const index = items.findIndex((item) => item.id === itemId);
			if (index !== -1) {
				console.log('[INVENTORY-SSE] 📝 Updating item at index:', index);
				console.log('[INVENTORY-SSE] 📊 Old values:', {
					quantity: items[index].quantity,
					donations: items[index].donations,
					currentCount: items[index].currentCount
				});
				console.log('[INVENTORY-SSE] 📊 New values:', {
					quantity: updatedItem.quantity,
					donations: updatedItem.donations,
					currentCount: updatedItem.currentCount
				});

				// Create new array with updated item to trigger reactivity
				items = [...items.slice(0, index), updatedItem, ...items.slice(index + 1)];

				// Update cache
				inventoryStore.setItems(items);

				console.log('[INVENTORY-SSE] ✅ Item updated successfully');
			} else {
				console.log('[INVENTORY-SSE] ⚠️ Item not found in current list, doing full refresh');
				// Item not found (might be new), do full refresh
				await refreshInventory();
			}
		} catch (error) {
			console.error('[INVENTORY-SSE] ❌ Failed to update single item:', error);
			// Fallback to full refresh on error
			await refreshInventory();
		}
	}

	/**
	 * Schedule a debounced refresh (250ms delay)
	 * Prevents excessive API calls when multiple events arrive quickly
	 */
	function scheduleRefresh(): void {
		console.log('[INVENTORY-SSE] ⏱️ Scheduling refresh (250ms debounce)...');
		if (refreshTimer !== null) {
			console.log('[INVENTORY-SSE] ⏱️ Clearing existing refresh timer');
			clearTimeout(refreshTimer);
		}
		refreshTimer = setTimeout(() => {
			console.log('[INVENTORY-SSE] ⏱️ Debounce timer fired, calling refreshInventory()');
			refreshTimer = null;
			refreshInventory();
		}, 250);
	}

	// ─── TEST FUNCTIONS (for debugging) ───────────────────────────────────────

	/**
	 * Test function: Manually trigger a refresh
	 * Usage in browser console: window.testInventoryRefresh()
	 */
	function testInventoryRefresh() {
		console.log('[TEST] 🧪 Manual refresh triggered');
		refreshInventory();
	}

	/**
	 * Test function: Check current inventory state
	 * Usage in browser console: window.testInventoryState()
	 */
	function testInventoryState() {
		console.log('[TEST] 📊 Current inventory state:');
		console.log('[TEST] Items count:', items.length);
		console.log('[TEST] Categories count:', categories.length);
		console.log('[TEST] Loading:', loading);
		console.log('[TEST] RefreshInFlight:', refreshInFlight);
		console.log('[TEST] PendingRefresh:', pendingRefresh);
		console.log('[TEST] Cache stats:', inventoryStore.getStats());
		if (items.length > 0) {
			console.log(
				'[TEST] First 3 items:',
				items.slice(0, 3).map((i) => ({
					name: i.name,
					quantity: i.quantity,
					donations: i.donations,
					currentCount: i.currentCount
				}))
			);
		}
	}

	/**
	 * Test function: Force invalidate cache
	 * Usage in browser console: window.testInvalidateCache()
	 */
	function testInvalidateCache() {
		console.log('[TEST] 🗑️ Manually invalidating cache');
		inventoryStore.invalidateAll();
		console.log('[TEST] Cache stats after invalidation:', inventoryStore.getStats());
	}

	/**
	 * Test function: Test single item update
	 * Usage in browser console: window.testUpdateItem('ITEM_ID')
	 */
	function testUpdateItem(itemId: string) {
		console.log('[TEST] 🎯 Testing single item update for:', itemId);
		updateSingleItem(itemId);
	}

	// Expose test functions to window for debugging
	if (typeof window !== 'undefined') {
		(window as any).testInventoryRefresh = testInventoryRefresh;
		(window as any).testInventoryState = testInventoryState;
		(window as any).testInvalidateCache = testInvalidateCache;
		(window as any).testUpdateItem = testUpdateItem;
	}

	// Real-time inventory updates via SSE
	onMount(() => {
		console.log('[INVENTORY-SSE] 🚀 Setting up SSE subscriptions...');

		const unsub = subscribeToInventoryChanges(
			(event) => {
				const timestamp = new Date().toLocaleTimeString();
				lastEventReceived = `Inventory: ${event.action} at ${timestamp}`;
				console.log('[INVENTORY-SSE] 📡 Inventory change event received:', event);
				console.log('[INVENTORY-SSE] 📡 Event details:', {
					action: event.action,
					entityType: event.entityType,
					entityId: event.entityId,
					entityName: event.entityName,
					occurredAt: event.occurredAt
				});

				// For item updates, do optimistic single-item update
				if (
					event.entityType === 'item' &&
					(event.action === 'item_updated' || event.action === 'item_created')
				) {
					console.log('[INVENTORY-SSE] 🎯 Performing optimistic single-item update');
					updateSingleItem(event.entityId);
				} else {
					// For other actions (delete, archive, category changes), do full refresh
					console.log('[INVENTORY-SSE] 🔄 Performing full refresh for action:', event.action);
					scheduleRefresh();
				}
			},
			{
				onConnect: () => {
					console.log('[INVENTORY-SSE] ✅ Inventory SSE connected');
				},
				onDisconnect: () => {
					console.log('[INVENTORY-SSE] ⚠️ Inventory SSE disconnected');
				},
				onError: (error) => {
					console.error('[INVENTORY-SSE] ❌ Inventory SSE error:', error);
				}
			}
		);

		// Also listen to donation stream to cover cases where donation events
		// are published on the donation channel before/alongside inventory channel.
		const unsubDonations = donationsAPI.subscribeToChanges(() => {
			const timestamp = new Date().toLocaleTimeString();
			lastEventReceived = `Donation at ${timestamp}`;
			console.log('[INVENTORY-SSE] 📡 Donation change event received (donations stream)');
			console.log('[INVENTORY-SSE] 📡 Triggering inventory refresh from donation event');
			// Donations don't include item ID, so we need to do full refresh
			scheduleRefresh();
		});

		console.log('[INVENTORY-SSE] ✅ SSE subscriptions established');
		console.log('[INVENTORY-SSE] 📊 Subscription functions:', {
			inventoryUnsub: typeof unsub,
			donationsUnsub: typeof unsubDonations
		});

		return () => {
			console.log('[INVENTORY-SSE] 🛑 Cleaning up SSE subscriptions');
			unsub();
			try {
				unsubDonations();
			} catch {}
			if (refreshTimer !== null) clearTimeout(refreshTimer);
		};
	});

	function delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function yieldToMainThread(): Promise<void> {
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}

	async function runWithConcurrency<T>(
		entries: T[],
		concurrency: number,
		handler: (entry: T, index: number) => Promise<void>
	): Promise<void> {
		if (entries.length === 0) return;
		let nextIndex = 0;
		const workerCount = Math.max(1, Math.min(concurrency, entries.length));
		const workers = Array.from({ length: workerCount }, async () => {
			while (true) {
				const current = nextIndex;
				nextIndex += 1;
				if (current >= entries.length) break;
				await handler(entries[current], current);
			}
		});
		await Promise.all(workers);
	}

	function normalizeKeyPart(value: string | undefined | null): string {
		return (value || '').toLowerCase().trim();
	}

	function getItemCompositeKey(name: string, specification: string | undefined | null): string {
		return `${normalizeKeyPart(name)}|${normalizeKeyPart(specification)}`;
	}

	function getCurrentCount(quantity: number, donations = 0): number {
		return quantity + donations;
	}

	async function fetchAllInventoryItems(
		includeArchived = true,
		forceRefresh = false
	): Promise<InventoryItem[]> {
		console.log('[INVENTORY-SSE] 🔄 fetchAllInventoryItems called, forceRefresh:', forceRefresh);

		const allItems: InventoryItem[] = [];
		let page = 1;

		while (true) {
			console.log('[INVENTORY-SSE] 📄 Fetching page', page, 'with forceRefresh:', forceRefresh);

			const response = await inventoryItemsAPI.getAll({
				page,
				limit: INVENTORY_FETCH_PAGE_SIZE,
				includeArchived,
				forceRefresh
			});

			allItems.push(...response.items);
			console.log('[INVENTORY-SSE] 📄 Page', page, 'fetched:', response.items.length, 'items');

			if (page >= response.pages || response.items.length === 0) {
				break;
			}

			page += 1;
		}

		console.log('[INVENTORY-SSE] ✅ All pages fetched, total items:', allItems.length);
		return allItems;
	}

	async function createInventoryItemWithRetry(
		itemData: any,
		maxRetries = 5
	): Promise<InventoryItem> {
		let attempt = 0;

		while (true) {
			try {
				return await inventoryItemsAPI.createForImport(itemData);
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

	async function updateInventoryItemWithRetry(
		itemId: string,
		itemData: any,
		maxRetries = 5
	): Promise<InventoryItem> {
		let attempt = 0;

		while (true) {
			try {
				return await inventoryItemsAPI.updateForImport(itemId, itemData);
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
	 * Industry-standard loading pattern with proper skeleton states
	 * @param forceRefresh - If true, bypasses cache and fetches fresh data
	 */
	async function loadItems(forceRefresh = false) {
		console.log('[INVENTORY-SSE] 📥 loadItems called, forceRefresh:', forceRefresh);

		try {
			// Use cached items when still fresh to avoid refetching on route return.
			const cacheValid = inventoryStore.isItemsCacheValid();
			console.log('[INVENTORY-SSE] 🔍 Cache valid:', cacheValid);

			if (!forceRefresh && cacheValid) {
				console.log('[INVENTORY-SSE]  Using cached items');
				const storeData = get(inventoryStore);
				items = storeData.items;
				console.log('[INVENTORY-SSE]  Loaded from cache:', items.length, 'items');
				return;
			}

			console.log('[INVENTORY-SSE]  Fetching fresh items from API...');
			inventoryStore.setLoading(true);

			const freshItems = await fetchAllInventoryItems(true, forceRefresh);

			console.log('[INVENTORY-SSE]  Loaded items from API:', freshItems.length);

			// Update reactive state immediately
			items = freshItems;

			if (items.length > 0) {
				console.log(
					'[INVENTORY-SSE]  First item:',
					items[0].name,
					'quantity:',
					items[0].quantity,
					'donations:',
					items[0].donations,
					'currentCount:',
					items[0].currentCount
				);
			}

			// Update cache with fresh data
			inventoryStore.setItems(freshItems);
			console.log('[INVENTORY-SSE]  Cache updated with fresh items');
		} catch (err: any) {
			console.error('[INVENTORY-SSE] ❌ Error loading items:', err);
			toastStore.error(err.message || 'Failed to load items');
		} finally {
			inventoryStore.setLoading(false);
		}
	}

	/**
	 * Load all categories from API (with client-side caching)
	 * Industry-standard loading pattern with proper skeleton states
	 * @param forceRefresh - If true, bypasses cache and fetches fresh data
	 */
	async function loadCategories(forceRefresh = false) {
		console.log('[INVENTORY-SSE]  loadCategories called, forceRefresh:', forceRefresh);

		try {
			// Check if cache is still valid (unless force refresh)
			const cacheValid = inventoryStore.isCategoriesCacheValid();
			console.log('[INVENTORY-SSE]  Categories cache valid:', cacheValid);

			if (!forceRefresh && cacheValid) {
				console.log('[INVENTORY-SSE]  Using cached categories');
				// Use cached data
				const storeData = get(inventoryStore);
				categories = storeData.categories;
				return;
			}

			console.log('[INVENTORY-SSE]  Fetching fresh categories from API...');

			const response = await inventoryCategoriesAPI.getAll({ includeArchived: true });
			categories = response.categories;

			console.log('[INVENTORY-SSE]  Loaded categories from API:', categories.length);

			// Update cache
			inventoryStore.setCategories(response.categories);
			console.log('[INVENTORY-SSE]  Categories cache updated');
		} catch (err: any) {
			console.error('[INVENTORY-SSE] Error loading categories:', err);
			toastStore.error(err.message || 'Failed to load categories');
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
			try {
				URL.revokeObjectURL(newItem.picture);
			} catch (err) {}
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
			try {
				URL.revokeObjectURL(newCategoryPicture);
			} catch (err) {}
		}

		newCategoryPictureFile = file;
		newCategoryPicture = URL.createObjectURL(file);
	}

	function getItemStatus(item: InventoryItem): 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Archived' {
		if (item.archived) return 'Archived';
		const total = (item.quantity ?? 0) + (item.donations ?? 0);
		if (total === 0) return 'Out of Stock';
		if (total <= 5) return 'Low Stock';
		return 'In Stock';
	}

	const activeItems = $derived(items.filter((item) => !item.archived));
	const lowStockItems = $derived(
		activeItems.filter((item) => {
			const status = getItemStatus(item);
			return status === 'Low Stock' || status === 'Out of Stock';
		})
	);
	const requiredItems = $derived(activeItems.filter((item) => item.isrequired === true));

	function switchTab(tab: Tab) {
		activeTab = tab;
		currentPage = 1;
		query = '';
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
	let pictureInput = $state<HTMLInputElement | null>(null);

	// Selected category filter for viewing category-specific items
	let selectedCategory = $state<InventoryCategory | null>(null);
	// sort order for items list: 'az' or 'za'
	let sortOrder = $state('az');
	// search query
	let query = $state('');

	// reactive filtered + sorted items for display (use rune-style $derived)
	const PAGE_SIZE = 10;
	let currentPage = $state(1);

	const filteredItems = $derived(
		items.filter((item) => {
			const isActive = !item.archived;
			const q = query.toLowerCase().trim();

			// Case-insensitive category matching with trim for robustness
			const matchesCategory =
				!selectedCategory ||
				item.category?.toLowerCase()?.trim() === selectedCategory?.name?.toLowerCase()?.trim();
			const matchesQuery =
				!q ||
				(item.name || '').toLowerCase().includes(q) ||
				(item.specification || '').toLowerCase().includes(q) ||
				(item.description || '').toLowerCase().includes(q) ||
				(item.id || '').toLowerCase().includes(q);

			// Required status filter
			let matchesRequired = true;
			if (requiredFilter === 'required') {
				matchesRequired = item.isrequired === true;
			} else if (requiredFilter === 'regular') {
				matchesRequired = item.isrequired !== true;
			}

			// Stock status filter
			let matchesStatus = true;
			const itemStatus = getItemStatus(item);
			
			if (statusFilter === 'in-stock') {
				matchesStatus = itemStatus === 'In Stock';
			} else if (statusFilter === 'low-stock') {
				matchesStatus = itemStatus === 'Low Stock';
			} else if (statusFilter === 'out-of-stock') {
				matchesStatus = itemStatus === 'Out of Stock';
			}

			return isActive && matchesCategory && matchesQuery && matchesRequired && matchesStatus;
		})
	);
	const sortedItems = $derived(
		[...filteredItems].sort((a, b) =>
			sortOrder === 'az' 
				? (a.name || '').localeCompare(b.name || '') 
				: (b.name || '').localeCompare(a.name || '')
		)
	);
	const totalPages = $derived(Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE)));
	const displayItems = $derived(
		sortedItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
	);


	// Debug logging for display items
	$effect(() => {
		if (displayItems.length > 0) {
			console.log('[DEBUG] Display items count:', displayItems.length);
			try {
				// Snapshot to avoid logging $state proxies in devtools
				const first = displayItems[0] ? JSON.parse(JSON.stringify(displayItems[0])) : null;
				console.log('[DEBUG] First display item:', first);
				console.log('[DEBUG] First display item picture:', first?.picture ?? null);
				console.log('[DEBUG] Picture type:', typeof first?.picture);
				console.log('[DEBUG] Picture value:', JSON.stringify(first?.picture));
			} catch (err) {
				console.warn('[DEBUG] Failed to snapshot display item for logging', err);
			}
		}
	});

	// Reset to page 1 when filters change
	$effect(() => {
		filteredItems;
		sortOrder;
		currentPage = 1;
	});


	const displayCategories = $derived(
		categories
			.filter((category) => {
				const q = (query || '').toLowerCase();
				return (
					!q ||
					(category.name || '').toLowerCase().includes(q) ||
					(category.description || '').toLowerCase().includes(q)
				);
			})
			.sort((a, b) =>
				sortOrder === 'az' 
					? (a.name || '').localeCompare(b.name || '') 
					: (b.name || '').localeCompare(a.name || '')
			)
	);

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

	function openAdjustStock(item: InventoryItem) {
		adjustingItem = item;
		adjustmentType = 'add';
		adjustmentQuantity = 1;
		adjustmentReason = '';
		showAdjustStockModal = true;
	}

	function closeAdjustStock() {
		showAdjustStockModal = false;
		adjustingItem = null;
	}

	async function handleAdjustStock() {
		const targetItem = adjustingItem;
		if (!targetItem) return;
		if (adjustmentQuantity <= 0) {
			toastStore.error('Quantity must be greater than 0');
			return;
		}

		adjustStockLoading = true;
		try {
			let newQuantity = targetItem.quantity;
			if (adjustmentType === 'add') {
				newQuantity += adjustmentQuantity;
			} else {
				if (newQuantity < adjustmentQuantity) {
					toastStore.error('Cannot subtract more than current stock quantity');
					adjustStockLoading = false;
					return;
				}
				newQuantity -= adjustmentQuantity;
			}

			const updatedItem = await inventoryItemsAPI.update(targetItem.id, {
				quantity: newQuantity,
				adjustmentType: adjustmentType,
				adjustmentReason: adjustmentReason
			});

			const itemIndex = items.findIndex((i) => i.id === targetItem.id);
			if (itemIndex !== -1) {
				items[itemIndex] = updatedItem;
				items = [...items];
			}
			if (selectedItem && selectedItem.id === targetItem.id) {
				selectedItem = updatedItem;
			}

			inventoryStore.setItems(items);
			toastStore.success(`Successfully adjusted stock for "${targetItem.name}"`);
			closeAdjustStock();
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to adjust stock');
			console.error('Error adjusting stock:', err);
		} finally {
			adjustStockLoading = false;
		}
	}

	function toggleMenu(e: Event) {
		e?.stopPropagation?.();
		showMenu = !showMenu;
	}

	async function handleExportConfirm(selections: {
		sheets: string[];
		columns: string[];
		categories: string[];
		specifications: string[];
		tools: string[];
	}) {
		isExporting = true;
		try {
			const params = new URLSearchParams();
			params.append('sheets', selections.sheets.join(','));
			params.append('columns', selections.columns.join(','));
			if (selections.categories.length > 0) {
				params.append('categories', selections.categories.join(','));
			}
			if (selections.specifications.length > 0) {
				params.append('specifications', selections.specifications.join(','));
			}
			if (selections.tools.length > 0) {
				params.append('tools', selections.tools.join(','));
			}

			const response = await fetch(`/api/inventory/export?${params.toString()}`);

			if (!response.ok) {
				throw new Error('Failed to generate export');
			}

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `chtm-cooks-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			toastStore.success('Inventory export completed');
			showExportModal = false;
		} catch (err: any) {
			console.error('Export error:', err);
			toastStore.error(err.message || 'Failed to export inventory');
		} finally {
			isExporting = false;
		}
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
			const operationLoading = loading; // Store current loading state
			loading = true;
			const updatedItem = await inventoryItemsAPI.update(item.id, { archived: true });

			// Optimistic update: Remove archived item from local array immediately
			const itemIndex = items.findIndex((i) => i.id === item.id);
			if (itemIndex !== -1) {
				items.splice(itemIndex, 1);
				items = [...items];
			}

			// Update category count
			if (item.categoryId) {
				const categoryIndex = categories.findIndex((c) => c.id === item.categoryId);
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

			// Restore loading state if it wasn't loading before
			if (!operationLoading) {
				loading = false;
			}
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to archive item');
			console.error('Error archiving item:', err);
			loading = false;
		}
	}

	async function handleAddItem(e: Event) {
		e.preventDefault();

		try {
			const operationLoading = loading; // Store current loading state
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
				isrequired: newItem.isrequired,
				maxQuantityPerRequest:
					newItem.isrequired && newItem.maxQuantityPerRequest
						? Number(newItem.maxQuantityPerRequest)
						: undefined
			};

			let savedItem: InventoryItem;
			if (wasEditing) {
				// Update existing item
				savedItem = await inventoryItemsAPI.update(editingItemId!, itemData);

				// Optimistic update: Update item in local array
				const itemIndex = items.findIndex((i) => i.id === editingItemId);
				if (itemIndex !== -1) {
					items[itemIndex] = savedItem;
					items = [...items];
				}
			} else {
				// Create new item
				savedItem = await inventoryItemsAPI.create(itemData);

				// Optimistic update: Add new item to local array immediately
				items = [...items, savedItem];

				// Update category count
				if (savedItem.categoryId) {
					const categoryIndex = categories.findIndex((c) => c.id === savedItem.categoryId);
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

			// Restore loading state if it wasn't loading before
			if (!operationLoading) {
				loading = false;
			}
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to save item');
			console.error('Error saving item:', err);
			loading = false;
		} finally {
			uploadingImage = false;
		}
	}

	function resetForm() {
		// Revoke object URL if exists
		if (newItem.picture && newItem.picture.startsWith('blob:')) {
			try {
				URL.revokeObjectURL(newItem.picture);
			} catch (err) {}
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
			isrequired: false,
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
			isrequired: item.isrequired || false,
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
		console.log(
			'Items in this category:',
			items
				.filter(
					(item) =>
						!item.archived &&
						item.category?.toLowerCase()?.trim() === category.name?.toLowerCase()?.trim()
				)
				.map((i) => i.name)
		);
	}

	async function togglerequiredStatus(item: InventoryItem) {
		const newStatus = !item.isrequired;

		// Confirm action with user
		const confirmed = await confirmStore.confirm({
			type: newStatus ? 'info' : 'warning',
			title: newStatus ? 'Mark as Required Item' : 'Remove from Required Items',
			message: newStatus
				? `Mark "${item.name}" as a Required item? It will always appear on student request forms regardless of availability.`
				: `Remove "${item.name}" from Required items? Students will need to manually add it to their requests.`,
			confirmText: newStatus ? 'Mark as Required' : 'Remove',
			cancelText: 'Cancel'
		});

		if (!confirmed) {
			return;
		}

		try {
			const operationLoading = loading; // Store current loading state
			loading = true;
			const updatedItem = await inventoryItemsAPI.update(item.id, { isrequired: newStatus });

			// Optimistic update: Update item in local array
			const itemIndex = items.findIndex((i) => i.id === item.id);
			if (itemIndex !== -1) {
				items[itemIndex] = updatedItem;
				items = [...items];
			}

			// Update store with current arrays
			inventoryStore.setItems(items);

			toastStore.success(
				newStatus
					? `"${item.name}" is now a Required item and will always appear on student request forms`
					: `"${item.name}" removed from Required items`,
				'Required Item Updated'
			);

			// Restore loading state if it wasn't loading before
			if (!operationLoading) {
				loading = false;
			}
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to update required status', 'Update Failed');
			console.error('Error updating required status:', err);
			loading = false;
		}
	}

	function clearCategoryFilter() {
		selectedCategory = null;
	}

	async function deleteItem(item: InventoryItem) {
		const confirmed = await confirmStore.danger(
			`Are you sure you want to remove "${item.name}"? This action cannot be undone.`,
			'Remove Item',
			'Remove',
			'Cancel'
		);

		if (!confirmed) return;

		try {
			const operationLoading = loading; // Store current loading state
			loading = true;

			// Delete from API
			await inventoryItemsAPI.delete(item.id);

			// Optimistic update: Immediately remove from arrays
			const itemIndex = items.findIndex((i) => i.id === item.id);
			if (itemIndex !== -1) {
				items.splice(itemIndex, 1); // Modify array in place for reactivity
				items = [...items];
			}

			// Update category counts
			if (item.categoryId) {
				const categoryIndex = categories.findIndex((c) => c.id === item.categoryId);
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

			// Restore loading state if it wasn't loading before
			if (!operationLoading) {
				loading = false;
			}
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to delete item');
			console.error('Error deleting item:', err);
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
	let categoryPictureInput = $state<HTMLInputElement | null>(null);
	let editCategoryPictureInput = $state<HTMLInputElement | null>(null);
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

			const updatedCategory = await inventoryCategoriesAPI.update(editingCategory?.id, {
				name: newCategoryName,
				description: newCategoryDescription,
				picture: imageUrl
			});

			// Optimistic update: Update category in local array immediately
			const categoryIndex = categories.findIndex((c) => c.id === editingCategory?.id);
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
			toastStore.error(
				`Cannot delete "${category.name}" - it contains ${category.itemCount} item(s). Please reassign or delete items first.`
			);
			return;
		}

		const confirmed = await confirmStore.danger(
			`Are you sure you want to remove category "${category.name}"?`,
			'Remove Category',
			'Remove',
			'Cancel'
		);

		if (!confirmed) return;

		try {
			loading = true;
			await inventoryCategoriesAPI.delete(category.id);

			// Optimistic update: Immediately remove from array
			const categoryIndex = categories.findIndex((c) => c.id === category.id);
			if (categoryIndex !== -1) {
				categories.splice(categoryIndex, 1); // Modify array in place for reactivity
			}

			toastStore.success(
				'Category deleted successfully. Recoverable for 30 days from History page.'
			);

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
		if (importing || importFile || importPreviewData.length > 0 || importProgress.total > 0) {
			showImportModal = true;
			return;
		}

		importSessionId += 1;
		showImportModal = true;
		importStep = 'upload';
		importFile = null;
		importPreviewData = [];
		importErrors = [];
		importAmbiguousImageNames = new Set();
	}

	function closeImportModal() {
		if (importing) {
			showImportModal = false;
			toastStore.info(
				'Import continues in the background. Reopen Import Items to view progress.',
				'Import Running'
			);
			return;
		}

		importSessionId += 1;
		showImportModal = false;
		importPreviewImageUrl = null;
		importPreviewImageName = '';
		importFile = null;
		importPreviewData = [];
		importErrors = [];
		importStep = 'upload';
		importImageFiles = new Map();
		importAmbiguousImageNames = new Set();
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

	function isImportSessionActive(sessionId: number): boolean {
		return sessionId === importSessionId;
	}

	async function validateImportFile(file: File): Promise<boolean> {
		const validExtensions = ['.csv', '.xlsx', '.xls', '.zip'];
		const fileName = file.name.toLowerCase();
		const isValidType = validExtensions.some((ext) => fileName.endsWith(ext));

		if (!isValidType) {
			toastStore.error('Please upload a CSV, Excel, or ZIP file (.csv, .xlsx, .xls, .zip)');
			return false;
		}

		if (file.size > IMPORT_HARD_FILE_SIZE_BYTES) {
			toastStore.error(
				`File is extremely large (${formatFileSize(file.size)}). For stability, uploads above ${IMPORT_HARD_FILE_SIZE_LABEL} are blocked.`
			);
			return false;
		}

		if (file.size > IMPORT_RECOMMENDED_FILE_SIZE_BYTES) {
			const proceed = await confirmStore.warning(
				`This file is ${formatFileSize(file.size)}. Large imports are supported but may take longer to process. Continue?`,
				'Large Import File',
				'Continue',
				'Cancel'
			);

			if (!proceed) {
				toastStore.info(
					`Import cancelled. Recommended size is ${IMPORT_RECOMMENDED_FILE_SIZE_LABEL} for faster processing.`
				);
				return false;
			}
		}

		return true;
	}

	function removeImportFile() {
		importFile = null;
		importPreviewData = [];
		importErrors = [];
		importImageFiles = new Map();
		importAmbiguousImageNames = new Set();
	}

	async function handleImportFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];

		if (!file) return;
		if (!(await validateImportFile(file))) return;

		const fileName = file.name.toLowerCase();
		const sessionId = ++importSessionId;

		importFile = file;

		// Handle ZIP files differently
		if (fileName.endsWith('.zip')) {
			await parseZipFile(file, sessionId);
		} else {
			await parseImportFile(file, sessionId);
		}
	}

	async function parseZipFile(file: File, sessionId: number) {
		try {
			if (!isImportSessionActive(sessionId)) return;
			importing = true;
			importErrors = [];
			importPreviewData = [];
			importImageFiles.clear();
			importImageFiles = new Map();
			importAmbiguousImageNames = new Set();
			const duplicateBaseNames = new Set<string>();

			// Import JSZip dynamically
			const JSZip = (await import('jszip')).default;
			if (!isImportSessionActive(sessionId)) return;
			const zip = new JSZip();
			const contents = await zip.loadAsync(file);
			if (!isImportSessionActive(sessionId)) return;

			// Find CSV or Excel file
			let dataFile: any = null;
			let dataFileName = '';

			for (const [fileName, zipEntry] of Object.entries(contents.files)) {
				if (
					!zipEntry.dir &&
					(fileName.toLowerCase().endsWith('.csv') ||
						fileName.toLowerCase().endsWith('.xlsx') ||
						fileName.toLowerCase().endsWith('.xls'))
				) {
					dataFile = zipEntry;
					dataFileName = fileName;
					break;
				}
			}

			if (!dataFile) {
				if (!isImportSessionActive(sessionId)) return;
				importErrors = ['No CSV or Excel file found in ZIP archive'];
				return;
			}

			// Extract images
			for (const [fileName, zipEntry] of Object.entries(contents.files)) {
				if (!zipEntry.dir && /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
					const blob = await zipEntry.async('blob');
					const normalizedPath = fileName.replace(/\\/g, '/').toLowerCase();
					const baseName = normalizedPath.split('/').pop() || normalizedPath;
					const imageFile = new File([blob], baseName, { type: blob.type || 'image/jpeg' });

					// Keep full relative path for precise matching when CSV supplies folder paths.
					importImageFiles.set(normalizedPath, imageFile);

					// Keep base filename for simple matching; track duplicates to avoid silent overwrites.
					if (!importImageFiles.has(baseName)) {
						importImageFiles.set(baseName, imageFile);
					} else {
						duplicateBaseNames.add(baseName);
					}
				}
			}

			if (duplicateBaseNames.size > 0) {
				importAmbiguousImageNames = duplicateBaseNames;
				toastStore.warning(
					`${duplicateBaseNames.size} duplicate image filename(s) detected in ZIP. Use unique names or folder-qualified paths in the Picture column to match all images correctly.`
				);
			}

			// Parse data file
			if (dataFileName.toLowerCase().endsWith('.csv')) {
				// Parse CSV
				const csvText = await dataFile.async('text');
				if (!isImportSessionActive(sessionId)) return;
				await parseCSVText(csvText, undefined, undefined, { sessionId });
			} else {
				// Parse all sheets in Excel file
				const XLSX = await import('xlsx');
				if (!isImportSessionActive(sessionId)) return;
				const arrayBuffer = await dataFile.async('arraybuffer');
				if (!isImportSessionActive(sessionId)) return;
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
						csvLineToExcelRows: xlsxNonEmptyRows,
						sessionId
					});
					if (!isImportSessionActive(sessionId)) return;
					appended = true;
				}

				if (isImportSessionActive(sessionId) && importPreviewData.length > 0) {
					toastStore.success(
						`Parsed ${importPreviewData.length} items from ${workbook.SheetNames.length} sheet(s). ${importErrors.length > 0 ? `${importErrors.length} rows have errors.` : 'Click Continue to preview.'}`
					);
				}
			}

			if (isImportSessionActive(sessionId)) {
				toastStore.success(`Found ${importImageFiles.size} image(s) in ZIP file`);
			}
		} catch (err: any) {
			if (!isImportSessionActive(sessionId)) return;
			importErrors = [`Failed to parse ZIP file: ${err.message}`];
			toastStore.error(`Failed to parse ZIP file: ${err.message}`);
			console.error('ZIP parse error:', err);
		} finally {
			if (isImportSessionActive(sessionId)) {
				importing = false;
			}
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

	async function extractEmbeddedImagesFromExcel(
		data: ArrayBuffer,
		sheetName: string
	): Promise<Map<number, File>> {
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
				const mime =
					ext === 'jpg' || ext === 'jpeg'
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

				// Convert to proper ArrayBuffer for File constructor
				const arrayBuffer =
					bytes.buffer instanceof ArrayBuffer ? bytes.buffer : bytes.slice().buffer;
				const embeddedFile = new File([arrayBuffer], `excel-row-${excelRowNumber}.${ext}`, {
					type: mime
				});
				imagesByRow.set(excelRowNumber, embeddedFile);
			}
		} catch (err) {
			console.warn('Could not extract embedded images from Excel:', err);
		}
		return imagesByRow;
	}

	async function parseImportFile(file: File, sessionId: number) {
		try {
			if (!isImportSessionActive(sessionId)) return;
			importing = true;
			importErrors = [];
			importPreviewData = [];
			importImageFiles.clear();
			importAmbiguousImageNames = new Set();

			const fileName = file.name.toLowerCase();

			// Handle Excel files
			if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
				const XLSX = await import('xlsx');
				if (!isImportSessionActive(sessionId)) return;

				const data = await file.arrayBuffer();
				if (!isImportSessionActive(sessionId)) return;
				const workbook = XLSX.read(data, { type: 'array' });

				let appended = false;
				for (const sheetName of workbook.SheetNames) {
					const worksheet = workbook.Sheets[sheetName];
					if (!worksheet || !worksheet['!ref']) continue;

					const xlsxNonEmptyRows = getNonEmptyExcelRows(worksheet, XLSX);
					// Extract images keyed by their 1-based Excel row number.
					// Later, parseCSVText resolves each CSV line back to this row number.
					const imagesByExcelRow = await extractEmbeddedImagesFromExcel(data, sheetName);

					// Convert to CSV and parse
					const csvText = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
					if (!csvText.trim()) continue;

					await parseCSVText(csvText, sheetName, imagesByExcelRow, {
						append: appended,
						silent: true,
						csvLineToExcelRows: xlsxNonEmptyRows,
						sessionId
					});
					if (!isImportSessionActive(sessionId)) return;
					appended = true;
				}

				if (isImportSessionActive(sessionId) && importPreviewData.length > 0) {
					toastStore.success(
						`Parsed ${importPreviewData.length} items from ${workbook.SheetNames.length} sheet(s). ${importErrors.length > 0 ? `${importErrors.length} rows have errors.` : 'Click Continue to preview.'}`
					);
				}
			} else {
				// Handle CSV files
				const text = await file.text();
				if (!isImportSessionActive(sessionId)) return;
				await parseCSVText(text, undefined, undefined, { sessionId });
			}
		} catch (err: any) {
			if (!isImportSessionActive(sessionId)) return;
			importErrors = [`Failed to parse file: ${err.message}`];
			toastStore.error(`Failed to parse file: ${err.message}`);
			console.error('File parse error:', err);
		} finally {
			if (isImportSessionActive(sessionId)) {
				importing = false;
			}
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
		if (!(await validateImportFile(file))) return;

		const fileName = file.name.toLowerCase();
		const sessionId = ++importSessionId;

		importFile = file;

		// Handle ZIP files differently
		if (fileName.endsWith('.zip')) {
			await parseZipFile(file, sessionId);
		} else {
			await parseImportFile(file, sessionId);
		}
	}

	async function parseCSVText(
		text: string,
		categoryFromSheet?: string,
		embeddedImagesByExcelRow?: Map<number, File>,
		options?: {
			append?: boolean;
			silent?: boolean;
			csvLineToExcelRows?: number[];
			sessionId?: number;
		}
	) {
		try {
			const sessionId = options?.sessionId;
			if (typeof sessionId === 'number' && !isImportSessionActive(sessionId)) return;
			importing = true;

			const append = options?.append === true;
			const silent = options?.silent === true;
			const existingPreview = append ? importPreviewData : [];
			const existingErrors = append ? importErrors : [];

			if (!append) {
				importErrors = [];
				importPreviewData = [];
			}

			const lines = text.split(/\r?\n/).map((line) => line.replace(/^\uFEFF/, ''));

			if (lines.length < 2) {
				if (typeof sessionId === 'number' && !isImportSessionActive(sessionId)) return;
				importErrors = ['File is empty or contains no data rows'];
				toastStore.error('File is empty or contains no data rows');
				return;
			}

			// Parse CSV (handle both comma and semicolon separators)
			const separator = text.includes(';') && !text.includes(',') ? ';' : ',';

			const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

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
					v === 'donations' ||
					v === 'donation' ||
					v === 'eom count' ||
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
				importErrors = [
					'Could not detect the header row. Ensure one row contains columns like Name, Specification, Current Count, and Donations.'
				];
				toastStore.error('Could not detect header row in file');
				return;
			}

			const dataLineIndexes = Array.from(
				{ length: lines.length - (headerLineIndex + 1) },
				(_, offset) => headerLineIndex + 1 + offset
			).filter((lineIndex) => {
				const values = parseCSVLine(lines[lineIndex], separator);
				return values.length > 0 && values.some((v) => v.trim() !== '');
			});

			const nonEmptyLineIndexes = Array.from(
				{ length: lines.length },
				(_, lineIndex) => lineIndex
			).filter((lineIndex) => {
				const values = parseCSVLine(lines[lineIndex], separator);
				return values.length > 0 && values.some((v) => v.trim() !== '');
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
				} else if (
					(header === 'category' || header.includes('category')) &&
					headerMap.category === undefined
				) {
					headerMap.category = index;
				} else if (
					(header === 'eom count' || header.replace(/\s+/g, '') === 'eomcount') &&
					headerMap.eomcount === undefined
				) {
					headerMap.eomcount = index;
				} else if (
					(header === 'donations' || header === 'donation') &&
					headerMap.donations === undefined
				) {
					headerMap.donations = index;
				} else if (
					(header === 'current count' ||
						header.replace(/\s+/g, '') === 'currentcount' ||
						header === 'quantity' ||
						header === 'qty' ||
						header === 'count') &&
					headerMap.quantity === undefined
				) {
					headerMap.quantity = index;
				} else if (
					(header === 'specification' || header === 'spec') &&
					headerMap.specification === undefined
				) {
					headerMap.specification = index;
				} else if (
					(header === 'tools or equipment' ||
						header === 'tools/equipment' ||
						header === 'tools' ||
						header === 'equipment') &&
					headerMap.toolsorequipment === undefined
				) {
					headerMap.toolsorequipment = index;
				} else if (
					(header === 'picture' || header === 'image' || header === 'photo') &&
					headerMap.picture === undefined
				) {
					headerMap.picture = index;
				} else if (
					(header === 'remarks' ||
						header === 'remark' ||
						header === 'notes' ||
						header === 'note') &&
					headerMap.remarks === undefined
				) {
					headerMap.remarks = index;
				} else if (
					(header === 'location' || header === 'storage location' || header === 'storage') &&
					headerMap.location === undefined
				) {
					headerMap.location = index;
				} else if (
					(header === 'min stock' ||
						header === 'minimum stock' ||
						header === 'reorder point' ||
						header === 'reorder level') &&
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
			const categoryNameSet = new Set(categories.map((c) => normalizeKeyPart(c.name)));
			const existingInventoryByCompositeKey = new Map<string, InventoryItem>();
			for (const existingItem of items) {
				existingInventoryByCompositeKey.set(
					getItemCompositeKey(existingItem.name, existingItem.specification),
					existingItem
				);
			}
			const seenKeys = new Set<string>(
				existingPreview.map((row: any) => getItemCompositeKey(row.name, row.specification))
			); // track name+specification composites across the full import preview

			// Start from the line after the header row
			for (let i = headerLineIndex + 1; i < lines.length; i++) {
				if ((i - headerLineIndex) % IMPORT_PARSE_YIELD_EVERY === 0) {
					if (typeof sessionId === 'number' && !isImportSessionActive(sessionId)) return;
					await yieldToMainThread();
				}

				const values = parseCSVLine(lines[i], separator);
				const nonEmptyPosition = lineIndexToNonEmptyPosition.get(i);
				const sourceRowNumber =
					typeof nonEmptyPosition === 'number'
						? (options?.csvLineToExcelRows?.[nonEmptyPosition] ?? i + 1)
						: i + 1;

				// Skip completely empty lines
				if (values.length === 0 || values.every((v) => !v.trim())) {
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
				const donationsValue = valueAt('donations');
				const minStockValue = valueAt('minstock');
				const locationValue = valueAt('location');
				let pictureRef = valueAt('picture');
				const rawPictureRef = pictureRef;
				const remarks = valueAt('remarks');
				const category = categoryFromSheet || rawCategory;

				const providedFlags = {
					category:
						!!categoryFromSheet || (headerMap['category'] !== undefined && rawCategory !== ''),
					quantity: headerMap['quantity'] !== undefined && quantityValue !== '',
					specification: headerMap['specification'] !== undefined && specification !== '',
					toolsOrEquipment: headerMap['toolsorequipment'] !== undefined && toolsorequipment !== '',
					eomCount: headerMap['eomcount'] !== undefined && eomcount !== '',
					donations: headerMap['donations'] !== undefined && donationsValue !== '',
					minStock: headerMap['minstock'] !== undefined && minStockValue !== '',
					location: headerMap['location'] !== undefined && locationValue !== '',
					picture: headerMap['picture'] !== undefined && pictureRef !== '',
					remarks: headerMap['remarks'] !== undefined && remarks !== ''
				};

				// Skip rows without a name - they're not valid items
				if (!name || name.trim() === '') {
					errors.push(`Row ${sourceRowNumber}: Name is required`);
					continue;
				}

				// Validate row
				const rowErrors: string[] = [];
				if (!category) rowErrors.push('Category is required (use sheet name or Category column)');

				if (rawPictureRef) {
					const normalizedPictureRef = rawPictureRef.replace(/\\/g, '/').toLowerCase();
					const pictureBaseName = normalizedPictureRef.split('/').pop() || normalizedPictureRef;
					if (
						importAmbiguousImageNames.has(pictureBaseName) &&
						!normalizedPictureRef.includes('/')
					) {
						rowErrors.push(
							'Picture filename is duplicated in ZIP. Use folder-qualified path in Picture column or unique filenames.'
						);
					}
				}

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
				const existingInventoryItem = existingInventoryByCompositeKey.get(compositeKey);
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

				const parsedDonations = providedFlags.donations ? parseInt(donationsValue, 10) : 0;
				if (providedFlags.donations && (isNaN(parsedDonations) || parsedDonations < 0)) {
					rowErrors.push('Donations must be a valid number');
				}

				const parsedMinStock = providedFlags.minStock ? parseInt(minStockValue, 10) : 0;
				if (providedFlags.minStock && (isNaN(parsedMinStock) || parsedMinStock < 0)) {
					// Min Stock validation removed - property not in InventoryItem type
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
						}
					}
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
							.map((ext) => pictureRef + ext)
							.find((fileName) => importImageFiles.has(fileName.toLowerCase()));

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
				let importAction: 'create' | 'update' | 'no-change' | 'error' =
					rowErrors.length > 0 ? 'error' : 'create';

				if (existingInventoryItem && rowErrors.length === 0) {
					if (
						providedFlags.category &&
						normalizeKeyPart(existingInventoryItem.category) !== normalizedCategory
					)
						changedFields.push('category');
					if (
						providedFlags.toolsOrEquipment &&
						normalizeKeyPart(existingInventoryItem.toolsOrEquipment || '') !== normalizedTools
					)
						changedFields.push('tools/equipment');
					if (providedFlags.quantity && (existingInventoryItem.quantity ?? 0) !== quantity)
						changedFields.push('quantity');
					if (providedFlags.eomCount && (existingInventoryItem.eomCount ?? 0) !== parsedEomCount)
						changedFields.push('eomCount');
					if (providedFlags.donations && (existingInventoryItem.donations ?? 0) !== parsedDonations)
						changedFields.push('donations');
					if (existingInventoryItem.archived) changedFields.push('archived->active');

					if (hasImage) {
						if (imageSource === 'url') {
							if ((existingInventoryItem.picture || '') !== pictureRef)
								changedFields.push('picture');
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
					donations: parsedDonations,
					specification: specification || '',
					toolsOrEquipment: toolsorequipment || '',
					eomCount: providedFlags.eomCount ? parsedEomCount : undefined,
					remarks: remarks || '',
					currentCount: getCurrentCount(quantity, parsedDonations),
					_rowNumber: sourceRowNumber,
					_errors: rowErrors,
					_valid: rowErrors.length === 0,
					_pictureRef: pictureRef,
					_hasImage: hasImage,
					_imageSource: imageSource,
					_categoryExists: categoryNameSet.has(normalizedCategory),
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

			if (typeof sessionId === 'number' && !isImportSessionActive(sessionId)) return;
			importPreviewData = parsedData;
			importErrors = errors;

			// Show success toast
			if (parsedData.length > 0 && !silent) {
				toastStore.success(
					`Parsed ${parsedData.length} items. ${errors.length > 0 ? `${errors.length} rows have errors.` : 'Click Continue to preview.'}`
				);
			}
		} catch (err: any) {
			const sessionId = options?.sessionId;
			if (typeof sessionId === 'number' && !isImportSessionActive(sessionId)) return;
			importErrors = [`Failed to parse file: ${err.message}`];
			toastStore.error(`Failed to parse file: ${err.message}`);
			console.error('Import parse error:', err);
		} finally {
			const sessionId = options?.sessionId;
			if (typeof sessionId === 'number' && !isImportSessionActive(sessionId)) return;
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
		const validItems = processedImportPreviewData.filter((item) => item._valid && item._selected !== false);
		const actionableItems = processedImportPreviewData.filter(
			(item) => item._importAction === 'create' || item._importAction === 'update'
		);
		const noChangeCount = processedImportPreviewData.filter(
			(item) => item._importAction === 'no-change'
		).length;

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

			// Collect unique categories from import data
			const uniqueCategories = [...new Set(validItems.map((item) => item.category))];
			const categoriesByName = new Map(categories.map((c) => [normalizeKeyPart(c.name), c]));

			// Create missing categories first
			const categoryMap = new Map<string, InventoryCategory>();

			for (const categoryName of uniqueCategories) {
				const normalizedCategoryName = normalizeKeyPart(categoryName);
				const existing = categoriesByName.get(normalizedCategoryName);
				if (existing) {
					categoryMap.set(normalizedCategoryName, existing);
				} else {
					// Create new category
					try {
						importProgress.message = `Creating category: ${categoryName}...`;
						const newCategory = await inventoryCategoriesAPI.create({
							name: categoryName,
							description: `Auto-created from import`
						});
						categories.push(newCategory);
						categoriesByName.set(normalizedCategoryName, newCategory);
						categoryMap.set(normalizedCategoryName, newCategory);
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

			// Pre-upload unique local images concurrently to optimize performance (only if selectedImportFields.picture is true)
			const localImageRefsToUpload = new Set<string>();
			if (selectedImportFields.picture) {
				for (const item of validItems) {
					if (item._hasImage && (item._imageSource === 'zip' || item._imageSource === 'excel')) {
						const ref = item._pictureRef.toLowerCase();
						if (importImageFiles.has(ref)) {
							localImageRefsToUpload.add(ref);
						}
					}
				}
			}

			const uploadedImagesMap = new Map<string, string>();
			const localImageRefsArray = [...localImageRefsToUpload];
			let imagesUploadedCount = 0;

			if (localImageRefsArray.length > 0) {
				await runWithConcurrency(
					localImageRefsArray,
					6, // Safe, industry-standard concurrency factor
					async (ref) => {
						const imageFile = importImageFiles.get(ref);
						if (imageFile) {
							try {
								imagesUploadedCount++;
								importProgress.message = `Uploading image ${imagesUploadedCount}/${localImageRefsArray.length}: ${imageFile.name}...`;
								const uploadResult = await uploadInventoryImage(imageFile);
								uploadedImagesMap.set(ref, uploadResult.url);
							} catch (err: any) {
								console.error(`Failed to upload image for ${ref}:`, err);
							}
						}
					}
				);
			}

			const preparedCreateItems: Array<{ rowNumber: number; name: string; data: any }> = [];
			const preparedUpdateItems: Array<{ rowNumber: number; name: string; id: string; data: any }> =
				[];

			// Reset progress count for database operations
			importProgress.current = 0;

			for (const item of validItems) {
				try {
					importProgress.current++;
					importProgress.message = `Preparing ${item.name} (${importProgress.current}/${importProgress.total})`;

					// Get category from map (already exists or just created)
					const category = categoryMap.get(item.category.toLowerCase());

					// Handle image url resolution
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
							// Resolve to pre-uploaded image URL
							const ref = item._pictureRef.toLowerCase();
							pictureUrl = uploadedImagesMap.get(ref) || '';
						}
					}

					const itemData = {
						name: item.name,
						category: category?.name || item.category,
						categoryId: category?.id,
						specification: item.specification || '',
						toolsOrEquipment: item.toolsOrEquipment || '',
						quantity: item.quantity,
						donations: item.donations ?? 0,
						eomCount: item.eomCount,
						minStock: item.minStock,
						location: item.location || ''
					};

					const importKey = getItemCompositeKey(itemData.name, itemData.specification);
					const existingItem = existingItemsByKey.get(importKey);

					if (existingItem) {
						const updateData: any = {};
						const provided = item._provided || {};

						if (
							selectedImportFields.category &&
							provided.category &&
							(existingItem.category || '') !== (itemData.category || '')
						) {
							updateData.category = itemData.category;
						}
						if (
							selectedImportFields.category &&
							provided.category &&
							(existingItem.categoryId || '') !== (itemData.categoryId || '')
						) {
							updateData.categoryId = itemData.categoryId;
						}
						if (
							selectedImportFields.toolsOrEquipment &&
							provided.toolsOrEquipment &&
							(existingItem.toolsOrEquipment || '') !== (itemData.toolsOrEquipment || '')
						) {
							updateData.toolsOrEquipment = itemData.toolsOrEquipment;
						}
						if (
							selectedImportFields.quantity &&
							provided.quantity &&
							(existingItem.quantity ?? 0) !== (itemData.quantity ?? 0)
						) {
							updateData.quantity = itemData.quantity;
						}
						if (
							selectedImportFields.eomCount &&
							provided.eomCount &&
							(existingItem.eomCount ?? 0) !== (itemData.eomCount ?? 0)
						) {
							updateData.eomCount = itemData.eomCount;
						}
						if (
							selectedImportFields.donations &&
							provided.donations &&
							(existingItem.donations ?? 0) !== (itemData.donations ?? 0)
						) {
							updateData.donations = itemData.donations;
						}

						if (existingItem.archived) {
							updateData.archived = false;
						}

						// Replace image only when a new image is provided, is different, and picture is selected.
						if (
							selectedImportFields.picture &&
							pictureUrl &&
							pictureUrl !== existingItem.picture
						) {
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

			await runWithConcurrency(
				preparedUpdateItems,
				IMPORT_UPDATE_CONCURRENCY,
				async (entry, index) => {
					try {
						importProgress.message = `Updating items (${index + 1}/${preparedUpdateItems.length})`;
						await updateInventoryItemWithRetry(entry.id, entry.data);
						updatedCount++;
					} catch (updateErr: any) {
						console.error(`Failed to update row ${entry.rowNumber} (${entry.name}):`, updateErr);
						failCount++;
					}
				}
			);

			for (let i = 0; i < preparedCreateItems.length; i += IMPORT_BATCH_SIZE) {
				const batch = preparedCreateItems.slice(i, i + IMPORT_BATCH_SIZE);
				const batchNumber = Math.floor(i / IMPORT_BATCH_SIZE) + 1;
				const totalBatches = Math.ceil(preparedCreateItems.length / IMPORT_BATCH_SIZE);
				importProgress.message = `Creating batch ${batchNumber}/${totalBatches}...`;

				try {
					const response = await inventoryItemsAPI.bulkCreate({
						items: batch.map((entry) => entry.data)
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
					console.error(
						`Bulk batch ${batchNumber} failed, falling back to per-item import`,
						batchErr
					);

					await runWithConcurrency(batch, IMPORT_UPDATE_CONCURRENCY, async (entry) => {
						try {
							await createInventoryItemWithRetry(entry.data);
							createdCount++;
						} catch (singleErr: any) {
							console.error(
								`Fallback failed for row ${entry.rowNumber} (${entry.name}):`,
								singleErr
							);
							failCount++;
						}
					});
				}
			}

			const successCount = createdCount + updatedCount;

			if (successCount > 0) {
				// Complete cache reset
				inventoryStore.reset();

				// Clear all filters
				selectedCategory = null;
				query = '';

				// Delay to ensure database writes are fully committed
				await new Promise((resolve) => setTimeout(resolve, 150));

				// Force complete reload with direct API calls
				try {
					loading = true;

					// Direct API calls bypassing cache
					const [allFetchedItems, categoriesResponse] = await Promise.all([
						fetchAllInventoryItems(true),
						inventoryCategoriesAPI.getAll({ includeArchived: true })
					]);

					items = allFetchedItems;
					categories = categoriesResponse.categories;

					// Update store cache
					inventoryStore.setItems(allFetchedItems);
					inventoryStore.setCategories(categoriesResponse.categories);
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
				toastStore.warning(
					`Import complete: ${createdCount} created, ${updatedCount} updated, ${failCount} failed`
				);
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
		const template = `Name,Specification,Tools or Equipment,Picture,Current Count,Donations,EOM Count,Remarks
Chef Knife,8-inch stainless steel,Knife sheath,https://example.com/knife.jpg,10,2,10,Sharp and ready
Mixing Bowl,Stainless steel 5L,,,5,0,5,Ready to use
Kitchen Stove,4-burner with oven,Gas regulator,,2,1,2,Station 1`;

		const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = 'inventory_import_template.csv';
		link.click();
		URL.revokeObjectURL(link.href);

		toastStore.success(
			'Template downloaded! Name your Excel sheet tab as the category (e.g., "Hot Kitchen")'
		);
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
			{@const status = getItemStatus(selectedItem)}
			<div class="fixed inset-0 z-50 overflow-y-auto">
				<button
					type="button"
					class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
					onclick={closeModal}
					aria-label="Close modal"
					tabindex="-1"
				></button>
				<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
					<div
						class="animate-scaleIn relative mx-0 w-full max-w-2xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:mx-auto sm:max-w-4xl sm:rounded-3xl"
					>
						<!-- Header -->
						<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
							<div class="px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
								<div class="flex items-start gap-3 sm:gap-4">
									<!-- Item Image as Icon -->
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
											class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30 sm:h-14 sm:w-14 sm:rounded-2xl lg:h-16 lg:w-16"
										>
											<svg
												class="h-6 w-6 text-white sm:h-7 sm:w-7 lg:h-8 lg:w-8"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2.5"
													d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
												/>
											</svg>
										</div>
									{/if}
 
									<div class="min-w-0 flex-1">
										<h2 class="text-base font-bold text-gray-900 sm:text-lg lg:text-xl">
											{selectedItem.name}
										</h2>
										<p class="mt-0.5 text-xs text-gray-500 sm:text-sm">{selectedItem.category}</p>
										<div class="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
											<span
												class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 shadow-sm ring-1 ring-black/5 sm:px-2.5 sm:py-1 {status ===
												'In Stock'
													? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10'
													: status === 'Low Stock'
														? 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/15'
														: 'bg-red-50 text-red-700 ring-1 ring-red-600/10'}"
											>
												<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
												<span class="text-[10px] font-bold sm:text-xs">{status}</span>
											</span>
											{#if selectedItem.isrequired}
												<span
													class="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-purple-800 shadow-sm ring-1 ring-purple-200 sm:px-2.5 sm:py-1"
												>
													<Star class="h-2.5 w-2.5 fill-current sm:h-3 sm:w-3" />
													<span class="text-[10px] font-bold sm:text-xs">Required</span>
												</span>
											{/if}
										</div>
									</div>

									<button
										onclick={closeModal}
										aria-label="Close modal"
										class="shrink-0 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 sm:rounded-xl sm:p-2"
									>
										<svg
											class="h-5 w-5 sm:h-6 sm:w-6"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
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
													{status}
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
										<div class="grid grid-cols-2 gap-2 lg:gap-3">
											<div
												class="group rounded-lg border border-gray-200 bg-linear-to-br from-white to-gray-50 p-2.5 transition-all hover:border-pink-200 hover:shadow-md sm:rounded-xl sm:p-3 lg:p-4"
											>
												<div class="mb-1 flex items-center gap-1 sm:mb-1.5 sm:gap-1.5">
													<div
														class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-100 sm:h-6 sm:w-6 sm:rounded-lg lg:h-8 lg:w-8"
													>
														<svg
															class="h-2.5 w-2.5 text-blue-600 sm:h-3 sm:w-3 lg:h-4 lg:w-4"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
															/>
														</svg>
													</div>
													<p
														class="text-[8px] leading-tight font-bold tracking-tight text-gray-500 uppercase sm:text-[9px] lg:text-xs"
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
												class="group rounded-lg border border-gray-200 bg-linear-to-br from-white to-gray-50 p-2.5 transition-all hover:border-pink-200 hover:shadow-md sm:rounded-xl sm:p-3 lg:p-4"
											>
												<div class="mb-1 flex items-center gap-1 sm:mb-1.5 sm:gap-1.5">
													<div
														class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-purple-100 sm:h-6 sm:w-6 sm:rounded-lg lg:h-8 lg:w-8"
													>
														<svg
															class="h-2.5 w-2.5 text-purple-600 sm:h-3 sm:w-3 lg:h-4 lg:w-4"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
															/>
														</svg>
													</div>
													<p
														class="text-[8px] leading-tight font-bold tracking-tight text-gray-500 uppercase sm:text-[9px] lg:text-xs"
													>
														EOM
													</p>
												</div>
												<p class="text-lg font-bold text-gray-900 sm:text-xl lg:text-2xl">
													{selectedItem.eomCount}
												</p>
											</div>

											<div
												class="group rounded-lg border border-gray-200 bg-linear-to-br from-white to-gray-50 p-2.5 transition-all hover:border-pink-200 hover:shadow-md sm:rounded-xl sm:p-3 lg:p-4"
											>
												<div class="mb-1.5 flex items-center gap-1.5 sm:mb-2 sm:gap-2">
													<div
														class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-8 sm:w-8 sm:rounded-xl lg:h-10 lg:w-10 {selectedItem.variance >
														0
															? 'bg-green-100'
															: selectedItem.variance < 0
																? 'bg-red-100'
																: 'bg-gray-100'}"
													>
														<svg
															class="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4 {selectedItem.variance >
															0
																? 'text-green-600'
																: selectedItem.variance < 0
																	? 'text-red-600'
																	: 'text-gray-600'}"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
															/>
														</svg>
													</div>
													<p
														class="text-[8px] leading-tight font-bold tracking-tight text-gray-500 uppercase sm:text-[9px] lg:text-xs"
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

									<!-- Low Stock Warning -->
									{#if status === 'Low Stock' || status === 'Out of Stock'}
										<div
											class="rounded-xl border-2 border-amber-200 bg-linear-to-br from-amber-50 to-amber-100/50 p-4 sm:rounded-2xl sm:p-5"
										>
											<div class="flex gap-2.5 sm:gap-3">
												<div
													class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl {status ===
													'Out of Stock'
														? 'bg-red-500'
														: 'bg-amber-500'}"
												>
													<AlertTriangle class="h-4 w-4 text-white sm:h-5 sm:w-5" />
												</div>
												<div class="min-w-0 flex-1">
													<p
														class="text-xs font-bold sm:text-sm {status ===
														'Out of Stock'
															? 'text-red-900'
															: 'text-amber-900'}"
													>
														{status === 'Out of Stock'
															? 'Out of Stock'
															: 'Low Stock Alert'}
													</p>
													<p
														class="mt-1 text-xs sm:mt-1.5 sm:text-sm {status ===
														'Out of Stock'
															? 'text-red-800'
															: 'text-amber-800'} leading-relaxed"
													>
														{#if status === 'Out of Stock'}
															This item is currently out of stock. Consider restocking or marking as
															unavailable for requests.
														{:else}
															Stock levels are running low. Consider restocking this item soon to
															maintain availability.
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
								<div class="flex items-center justify-end">
									<ActionMenu
										align="right"
										side="top"
										triggerLabel="Actions"
										items={[
											{
												label: selectedItem?.isrequired ? 'Remove Required' : 'Mark Required',
												icon: Star,
												variant: 'purple',
												action: () => {
													if (selectedItem) togglerequiredStatus(selectedItem);
												}
											},
											{
												label: 'Adjust Stock',
												icon: Sliders,
												variant: 'default',
												action: () => {
													if (selectedItem) openAdjustStock(selectedItem);
												}
											},
											{
												label: 'Edit Item',
												icon: Edit,
												variant: 'default',
												action: () => {
													if (selectedItem) editItem(selectedItem);
												}
											},
											{
												label: 'Archive',
												icon: Archive,
												variant: 'warning',
												action: () => {
													if (selectedItem) archiveItem(selectedItem);
												}
											},
											{
												label: 'Delete',
												icon: Trash2,
												variant: 'danger',
												action: () => {
													if (selectedItem) deleteItem(selectedItem);
												}
											}
										]}
									/>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Full Screen Image Modal -->
		{#if showFullImage && selectedItem?.picture}
			<div class="fixed inset-0 z-60 flex items-center justify-center p-4">
				<div
					class="fixed inset-0 bg-black/90"
					role="button"
					tabindex="0"
					aria-label="Close full image"
					onclick={closeFullImage}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							closeFullImage();
						}
					}}
				></div>
				<div class="relative z-61 max-h-[90vh] max-w-[90vw]">
					<button
						onclick={closeFullImage}
						class="absolute -top-12 right-0 text-white transition-colors hover:text-gray-300"
						title="Close (Esc)"
					>
						<svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
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
				onclick={() => (showExportModal = true)}
				class="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none sm:px-4"
				disabled={isExporting || loading}
			>
				<Download class="mr-1.5 h-4 w-4" />
				<span class="hidden sm:inline">Export</span>
				<span class="sm:hidden">Export</span>
			</button>
			<button
				onclick={openAddItemModal}
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

	<!-- Global Skeleton Loading State -->
	{#if false}
		<InventorySkeletonLoader
			view={activeTab === 'categories' ? 'categories' : 'all-items'}
		/>
	{:else}
		<!-- Stats Overview -->
		{#if cardsLoading}
			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4 animate-pulse">
				{#each Array(4) as _}
					<div class="rounded-lg bg-white p-3 shadow sm:p-5 h-20 sm:h-28">
						<div class="flex items-center justify-between gap-2 h-full">
							<div class="space-y-2 flex-1">
								<div class="h-4 bg-gray-200 rounded w-2/3"></div>
								<div class="h-6 bg-gray-200 rounded w-1/3"></div>
							</div>
							<div class="h-9 w-9 sm:h-12 sm:w-12 bg-gray-200 rounded-full"></div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<button
					type="button"
					onclick={() => {
						switchTab('all-items');
						requiredFilter = 'all';
						statusFilter = 'all';
						selectedCategory = null;
						query = '';
					}}
					class="w-full text-left rounded-lg bg-white p-3 shadow sm:p-5 hover:shadow-md hover:border-pink-200/50 hover:bg-gray-50/50 border border-transparent transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-pink-500/20 cursor-pointer"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Total Items</p>
							<p class="mt-1 text-2xl font-semibold text-gray-900 sm:mt-2 sm:text-3xl">
								{activeItems.length}
							</p>
						</div>
						<div
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 sm:h-12 sm:w-12"
						>
							<Package size={18} class="text-blue-600 sm:hidden" />
							<Package size={24} class="hidden text-blue-600 sm:block" />
						</div>
					</div>
				</button>
				<button
					type="button"
					onclick={() => {
						if (activeTab !== 'categories') {
							switchTab('categories');
						} else {
							switchTab('all-items');
						}
					}}
					class="w-full text-left rounded-lg bg-white p-3 shadow sm:p-5 hover:shadow-md hover:border-pink-200/50 hover:bg-gray-50/50 border border-transparent transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-pink-500/20 cursor-pointer"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Categories</p>
							<p class="mt-1 text-2xl font-semibold text-gray-900 sm:mt-2 sm:text-3xl">
								{categories.length}
							</p>
						</div>
						<div
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 sm:h-12 sm:w-12"
						>
							<FolderTree size={18} class="text-purple-600 sm:hidden" />
							<FolderTree size={24} class="hidden text-purple-600 sm:block" />
						</div>
					</div>
				</button>
				<button
					type="button"
					onclick={() => {
						switchTab('all-items');
						statusFilter = 'low-stock';
						requiredFilter = 'all';
					}}
					class="w-full text-left rounded-lg bg-white p-3 shadow sm:p-5 hover:shadow-md hover:border-pink-200/50 hover:bg-gray-50/50 border border-transparent transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-pink-500/20 cursor-pointer"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Low Stock</p>
							<p class="mt-1 text-2xl font-semibold text-red-600 sm:mt-2 sm:text-3xl">
								{lowStockItems.length}
							</p>
						</div>
						<div
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 sm:h-12 sm:w-12"
						>
							<AlertTriangle size={18} class="text-red-600 sm:hidden" />
							<AlertTriangle size={24} class="hidden text-red-600 sm:block" />
						</div>
					</div>
				</button>
				<button
					type="button"
					onclick={() => {
						switchTab('all-items');
						requiredFilter = 'required';
						statusFilter = 'all';
					}}
					class="w-full text-left rounded-lg bg-white p-3 shadow sm:p-5 hover:shadow-md hover:border-pink-200/50 hover:bg-gray-50/50 border border-transparent transition-all duration-200 active:scale-98 focus:outline-none focus:ring-2 focus:ring-pink-500/20 cursor-pointer"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="truncate text-xs font-medium text-gray-600 sm:text-sm">Required Items</p>
							<p class="mt-1 text-2xl font-semibold text-amber-600 sm:mt-2 sm:text-3xl">
								{requiredItems.length}
							</p>
						</div>
						<div
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 sm:h-12 sm:w-12"
						>
							<Star size={18} class="text-amber-600 sm:hidden" />
							<Star size={24} class="hidden text-amber-600 sm:block" />
						</div>
					</div>
				</button>
			</div>
		{/if}

		<!-- Tabs Navigation -->
		<div class="border-b border-gray-200 bg-white">
			<nav class="-mb-px flex" aria-label="Inventory tabs">
				<button
					onclick={() => switchTab('all-items')}
					class="flex flex-1 items-center justify-center gap-1 border-b-2 px-1 py-3 text-[11px] font-medium whitespace-nowrap transition-colors sm:text-sm
					{activeTab === 'all-items'
						? 'border-pink-500 text-pink-600'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
				>
					Items
					<span
						class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'all-items'
							? 'bg-pink-100 text-pink-600'
							: 'bg-gray-100 text-gray-600'}"
					>
						{filteredItems.length}
					</span>
				</button>

				<button
					onclick={() => switchTab('categories')}
					class="flex flex-1 items-center justify-center gap-1 border-b-2 px-1 py-3 text-[11px] font-medium whitespace-nowrap transition-colors sm:text-sm
					{activeTab === 'categories'
						? 'border-pink-500 text-pink-600'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
				>
					Categories
					<span
						class="rounded-full px-1.5 py-0.5 text-[10px] {activeTab === 'categories'
							? 'bg-pink-100 text-pink-600'
							: 'bg-gray-100 text-gray-600'}"
					>
						{categories.length}
					</span>
				</button>

				<button
					onclick={() => switchTab('usage')}
					class="flex flex-1 items-center justify-center gap-1 border-b-2 px-1 py-3 text-[11px] font-medium whitespace-nowrap transition-colors sm:text-sm
					{activeTab === 'usage'
						? 'border-pink-500 text-pink-600'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
				>
					Usage Statistics
				</button>
			</nav>
		</div>

		<!-- Tab Content -->
		<div class="rounded-b-lg bg-white shadow">
			{#if activeTab === 'all-items'}
				{#if itemsTabLoading}
					<InventorySkeletonLoader view="all-items" />
				{:else}
					<!-- All Items View -->
					<div class="p-4 sm:p-6">
					<div class="mb-4 flex flex-col gap-3">
						<!-- Premium Industry Standard Filter controls -->
						<div class="flex flex-col gap-3">
							<!-- 1. Full-Width Search Field -->
							<div class="relative w-full">
								<input
									type="text"
									placeholder="Search by name, description, or code..."
									bind:value={query}
									class="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm bg-white shadow-sm transition-all hover:border-gray-300 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
								/>
								<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
									<svg
										class="h-4 w-4 text-gray-400"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
										/>
									</svg>
								</div>
							</div>

							<!-- 2. Three Column Dropdowns -->
							<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
								<!-- Category Selector -->
								<div class="relative w-full">
									<select
										value={selectedCategory?.id || 'all'}
										onchange={(e) => {
											const val = e.currentTarget.value;
											if (val === 'all') {
												selectedCategory = null;
											} else {
												selectedCategory = categories.find(c => c.id === val) || null;
											}
										}}
										class="w-full rounded-lg border border-gray-200 py-2.5 pl-3.5 pr-10 text-sm text-gray-700 bg-white shadow-sm transition-all hover:bg-gray-50/80 hover:border-gray-300 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none appearance-none cursor-pointer"
									>
										<option value="all">All Categories</option>
										{#each categories as category}
											<option value={category.id}>{category.name}</option>
										{/each}
									</select>
									<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
										<svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
										</svg>
									</div>
								</div>

								<!-- Stock Status Filter -->
								<div class="relative w-full">
									<select
										bind:value={statusFilter}
										class="w-full rounded-lg border border-gray-200 py-2.5 pl-3.5 pr-10 text-sm text-gray-700 bg-white shadow-sm transition-all hover:bg-gray-50/80 hover:border-gray-300 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none appearance-none cursor-pointer"
									>
										<option value="all">All Statuses</option>
										<option value="in-stock">In Stock</option>
										<option value="low-stock">Low Stock</option>
										<option value="out-of-stock">Out of Stock</option>
									</select>
									<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
										<svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
										</svg>
									</div>
								</div>

								<!-- Alphabetical Sort Filter -->
								<div class="relative w-full">
									<select
										bind:value={sortOrder}
										class="w-full rounded-lg border border-gray-200 py-2.5 pl-3.5 pr-10 text-sm text-gray-700 bg-white shadow-sm transition-all hover:bg-gray-50/80 hover:border-gray-300 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none appearance-none cursor-pointer"
									>
										<option value="az">Name (A-Z)</option>
										<option value="za">Name (Z-A)</option>
									</select>
									<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
										<svg class="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
										</svg>
									</div>
								</div>
							</div>
						</div>

						<!-- Active Filters Tags Strip -->
						{#if selectedCategory || requiredFilter !== 'all' || statusFilter !== 'all'}
							<div class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-150 bg-gray-50/50 p-2">
								<span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider pl-1">Active Filters:</span>

								{#if selectedCategory}
									<span class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/10">
										Category: {selectedCategory.name}
										<button onclick={clearCategoryFilter} class="group rounded-full p-0.5 hover:bg-blue-100" aria-label="Clear category filter">
											<svg class="h-3 w-3 text-blue-600 group-hover:text-blue-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
											</svg>
										</button>
									</span>
								{/if}

								{#if requiredFilter !== 'all'}
									<span class="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-purple-600/10">
										Type: {requiredFilter === 'required' ? 'Required Only' : 'Regular Only'}
										<button onclick={() => requiredFilter = 'all'} class="group rounded-full p-0.5 hover:bg-purple-100" aria-label="Clear required filter">
											<svg class="h-3 w-3 text-purple-600 group-hover:text-purple-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
											</svg>
										</button>
									</span>
								{/if}

								{#if statusFilter !== 'all'}
									<span class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/10">
										Status: {statusFilter === 'in-stock' ? 'In Stock' : statusFilter === 'low-stock' ? 'Low Stock' : 'Out of Stock'}
										<button onclick={() => statusFilter = 'all'} class="group rounded-full p-0.5 hover:bg-amber-100" aria-label="Clear status filter">
											<svg class="h-3 w-3 text-amber-600 group-hover:text-amber-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
											</svg>
										</button>
									</span>
								{/if}

								<button
									onclick={() => {
										query = '';
										selectedCategory = null;
										requiredFilter = 'all';
										statusFilter = 'all';
									}}
									class="ml-auto text-xs font-semibold text-pink-600 hover:text-pink-800 hover:underline cursor-pointer"
								>
									Clear All
								</button>
							</div>
						{/if}
					</div>

					{#if displayItems.length === 0}
						<div class="flex items-center justify-center bg-gray-50" style="min-height: 600px;">
							<div class="px-4 text-center">
								<div
									class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pink-100"
								>
									<svg
										class="h-8 w-8 text-pink-600"
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
								</div>
								<h3 class="mt-6 text-lg font-semibold text-gray-900">No items found</h3>
								<p class="mx-auto mt-2 max-w-sm text-sm text-gray-600">
									{#if selectedCategory}
										No items in this category. Try selecting a different category or clear the
										filter.
									{:else if query}
										No items match your search. Try adjusting your search terms.
									{:else}
										Get started by adding your first inventory item to begin tracking your stock.
									{/if}
								</p>
								{#if !selectedCategory && !query}
									<button
										onclick={openAddItemModal}
										class="mt-6 inline-flex items-center gap-2 rounded-lg bg-pink-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-pink-700 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:outline-none"
									>
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M12 4v16m8-8H4"
											/>
										</svg>
										Add Your First Item
									</button>
								{/if}
								{#if selectedCategory}
									<button
										onclick={clearCategoryFilter}
										class="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:outline-none"
									>
										Clear Filter
									</button>
								{/if}
							</div>
						</div>
					{:else}
						<!-- Mobile card list — hidden on sm+ -->
						<div class="divide-y divide-gray-100 sm:hidden">
							{#each displayItems as item, i}
								{@const status = getItemStatus(item)}
								<button
									class="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
									onclick={() => openModal(item)}
								>
									<div class="flex items-center gap-3">
										<span
											class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600"
										>
											{(currentPage - 1) * PAGE_SIZE + i + 1}
										</span>
										<div
											class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100"
										>
											{#if item.picture}
												<img
													src={item.picture}
													alt={item.name}
													class="h-full w-full object-cover"
													loading="lazy"
												/>
											{:else}
												<ItemImagePlaceholder size="sm" />
											{/if}
										</div>
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-semibold text-gray-900">{item.name}</p>
											<p class="truncate text-xs text-gray-500">
												{item.specification || item.category}
											</p>
											<div class="mt-1 flex flex-wrap items-center gap-1">
												{#if item.isrequired}
													<span
														class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800"
														>Required</span
													>
												{/if}
												<span
													class="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800"
													>{item.category}</span
												>
												{#if status === 'Out of Stock'}
													<span
														class="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-600/10"
													>
														<span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
														Out of Stock
													</span>
												{:else if status === 'Low Stock'}
													<span
														class="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-600/15"
													>
														<span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
														Low Stock
													</span>
												{:else}
													<span
														class="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-600/10"
													>
														<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
														In Stock
													</span>
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
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M9 5l7 7-7 7"
											/>
										</svg>
									</div>
								</button>
							{/each}
						</div>

						<!-- Desktop table — hidden on mobile -->
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
										<th
											class="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase"
											>Actions</th
										>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 bg-white">
									{#each displayItems as item, i}
										{@const status = getItemStatus(item)}
										<tr
											class="cursor-pointer transition-colors hover:bg-gray-50"
											onclick={() => openModal(item)}
										>
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="flex items-center gap-3">
													<span
														class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700"
														>{(currentPage - 1) * PAGE_SIZE + i + 1}</span
													>
													<div
														class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100"
													>
														{#if item.picture}
															<img
																src={item.picture}
																alt={item.name}
																class="h-full w-full object-cover"
																loading="lazy"
															/>
														{:else}
															<ItemImagePlaceholder size="sm" />
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
												{#if status === 'Out of Stock'}
													<span
														class="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-600/10"
													>
														<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"
															><path
																fill-rule="evenodd"
																d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
																clip-rule="evenodd"
															/></svg
														>
														Out of Stock
													</span>
												{:else if status === 'Low Stock'}
													<span
														class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-600/15"
													>
														<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"
															><path
																fill-rule="evenodd"
																d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
																clip-rule="evenodd"
															/></svg
														>
														Low Stock
													</span>
												{:else}
													<span
														class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/10"
													>
														<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"
															><path
																fill-rule="evenodd"
																d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
																clip-rule="evenodd"
															/></svg
														>
														In Stock
													</span>
												{/if}
											</td>
											<!-- Actions cell -->
											<td
												class="px-4 py-4 text-right whitespace-nowrap"
												onclick={(e) => e.stopPropagation()}
											>
												<ActionMenu
													align="right"
													triggerLabel="Item actions"
													items={[
														{
															label: item.isrequired ? 'Remove Required' : 'Mark Required',
															icon: Star,
															variant: 'purple',
															action: () => togglerequiredStatus(item)
														},
														{
															label: 'Adjust Stock',
															icon: Sliders,
															variant: 'default',
															action: () => openAdjustStock(item)
														},
														{
															label: 'Edit Item',
															icon: Edit,
															variant: 'default',
															action: () => editItem(item)
														},
														{
															label: 'Archive',
															icon: Archive,
															variant: 'warning',
															action: () => archiveItem(item)
														},
														{
															label: 'Remove',
															icon: Trash2,
															variant: 'danger',
															action: () => deleteItem(item)
														}
													]}
												/>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						<!-- Pagination -->
						{#if totalPages > 1}
							<Pagination
								{currentPage}
								{totalPages}
								totalItems={sortedItems.length}
								itemsPerPage={PAGE_SIZE}
								onPageChange={(p) => {
									currentPage = p;
								}}
							/>
						{/if}
					{/if}
				</div>
				{/if}
			{:else if activeTab === 'categories'}
				{#if categoriesTabLoading}
					<InventorySkeletonLoader view="categories" />
				{:else}
					<!-- Categories View -->
					<div class="p-4 sm:p-6">
					<div class="mb-4 flex flex-col gap-3">
						<div class="flex items-center justify-between gap-3">
							<h3 class="text-base font-semibold text-gray-900 sm:text-lg">Item Categories</h3>
							<button
								onclick={() => (showCategoryModal = true)}
								class="inline-flex shrink-0 items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 sm:px-4 sm:py-2 sm:text-sm"
								disabled={loading}
							>
								<svg
									class="mr-1.5 h-3.5 w-3.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 4v16m8-8H4"
									/>
								</svg>
								Add Category
							</button>
						</div>
						<!-- Search + Sort row -->
						<div class="flex gap-2">
							<div class="relative flex-1">
								<input
									type="text"
									placeholder="Search categories..."
									bind:value={query}
									class="w-full rounded-lg border border-gray-300 py-2 pr-3 pl-9 text-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
								/>
								<svg
									class="absolute top-2.5 left-3 h-4 w-4 text-gray-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
									/>
								</svg>
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

					{#if displayCategories.length === 0}
						<div class="py-12 text-center">
							<svg
								class="mx-auto h-24 w-24 text-pink-600"
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
							<h3 class="mt-4 text-lg font-medium text-gray-900">No categories yet</h3>
							<p class="mt-2 text-sm text-gray-500">
								Get started by creating your first category to organize your inventory items.
							</p>
							<button
								onclick={() => (showCategoryModal = true)}
								class="mt-4 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
							>
								<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 4v16m8-8H4"
									/>
								</svg>
								Add Your First Category
							</button>
						</div>
					{:else}
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{#each displayCategories as category}
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
									aria-label={`Open category ${category.name}`}
									class="relative cursor-pointer rounded-lg border border-gray-200 p-3 transition-all hover:border-emerald-500 hover:shadow-md sm:p-4"
								>
									<div class="flex items-center justify-between gap-2">
										<div class="min-w-0 flex-1">
											<h4 class="truncate text-sm font-semibold text-gray-900 sm:text-base">
												{category.name}
											</h4>
											<p class="mt-0.5 text-xs text-gray-500">{category.itemCount} items</p>
											{#if category.description}
												<p class="mt-0.5 truncate text-xs text-gray-400">{category.description}</p>
											{/if}
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
													<svg
														class="h-4 w-4 sm:h-5 sm:w-5"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
														/>
													</svg>
												</span>
											{/if}
											<!-- Ellipsis Menu -->
											<div class="relative">
												<button
													onclick={(e) => toggleDropdown(category.id, e)}
													class="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
													aria-label="Category options"
												>
													<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
														<path
															d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
														/>
													</svg>
												</button>
												{#if openDropdownId === category.id}
													<div
														class="ring-opacity-5 absolute right-0 z-30 mt-2 w-48 origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-black"
													>
														<div class="py-1">
															<button
																onclick={(e) => openEditCategory(category, e)}
																class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
															>
																<svg
																	class="h-4 w-4 text-gray-500"
																	fill="none"
																	stroke="currentColor"
																	viewBox="0 0 24 24"
																>
																	<path
																		stroke-linecap="round"
																		stroke-linejoin="round"
																		stroke-width="2"
																		d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
																	/>
																</svg>
																Edit Category
															</button>
															<button
																onclick={(e) => deleteCategory(category, e)}
																class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors {category.itemCount >
																0
																	? 'cursor-not-allowed text-gray-400'
																	: 'text-red-600 hover:bg-red-50'}"
																disabled={category.itemCount > 0}
															>
																<svg
																	class="h-4 w-4"
																	fill="none"
																	stroke="currentColor"
																	viewBox="0 0 24 24"
																>
																	<path
																		stroke-linecap="round"
																		stroke-linejoin="round"
																		stroke-width="2"
																		d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
																	/>
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
						<div
							class="fixed inset-0 bg-black/40 backdrop-blur-sm"
							role="button"
							tabindex="0"
							aria-label="Close add category modal"
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
									<p class="mt-1 text-xs text-gray-500">
										Create a category to organize inventory items.
									</p>
								</div>
								<div class="max-h-[70vh] overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
									<form onsubmit={handleCreateCategory} class="space-y-3">
										<div>
											<label for="categoryName" class="block text-sm font-medium text-gray-700"
												>Category Name *</label
											>
											<input
												type="text"
												id="categoryName"
												bind:value={newCategoryName}
												required
												class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
												placeholder="e.g., Cookware"
											/>
										</div>
										<div>
											<label
												for="categoryDescription"
												class="block text-sm font-medium text-gray-700">Description</label
											>
											<input
												type="text"
												id="categoryDescription"
												bind:value={newCategoryDescription}
												class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
												placeholder="Optional description"
											/>
										</div>
										<div>
											<label
												for="categoryImageInput"
												class="mb-2 block text-sm font-medium text-gray-700">Category Image</label
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
													{#if uploadingCategoryImage}
														<div
															class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
														></div>
													{:else}
														<svg
															class="h-4 w-4"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
															><path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M16 3l-4 4-4-4"
															/></svg
														>
													{/if}
													Upload Image
												</button>
												<span class="min-w-0 flex-1 truncate text-xs text-gray-600"
													>{newCategoryPictureFile
														? newCategoryPictureFile.name
														: 'No file chosen'}</span
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
														class="text-xs text-red-500 hover:text-red-700 sm:text-sm"
														>Remove</button
													>
												{/if}
												<input
													id="categoryImageInput"
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
													if (newCategoryPicture && newCategoryPicture.startsWith('blob:')) {
														try {
															URL.revokeObjectURL(newCategoryPicture);
														} catch (e) {}
													}
													newCategoryPicture = '';
													newCategoryPictureFile = null;
												}}
												class="inline-flex min-w-27 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
											>
												Cancel
											</button>
											<button
												type="submit"
												class="inline-flex min-w-27 items-center justify-center rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-pink-700"
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
						<div
							class="fixed inset-0 bg-black/40 backdrop-blur-sm"
							role="button"
							tabindex="0"
							aria-label="Close edit category modal"
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
									<p class="mt-1 text-xs text-gray-500">Update category details and media.</p>
								</div>
								<div class="max-h-[70vh] overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
									<form onsubmit={handleEditCategory} class="space-y-3">
										<div>
											<label for="editCategoryName" class="block text-sm font-medium text-gray-700"
												>Category Name *</label
											>
											<input
												type="text"
												id="editCategoryName"
												bind:value={newCategoryName}
												required
												class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
												placeholder="e.g., Cookware"
											/>
										</div>
										<div>
											<label
												for="editCategoryDescription"
												class="block text-sm font-medium text-gray-700">Description</label
											>
											<input
												type="text"
												id="editCategoryDescription"
												bind:value={newCategoryDescription}
												class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
												placeholder="Optional description"
											/>
										</div>
										<div>
											<label
												for="editCategoryImageInput"
												class="mb-2 block text-sm font-medium text-gray-700">Category Image</label
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
													{#if uploadingCategoryImage}
														<div
															class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
														></div>
													{:else}
														<svg
															class="h-4 w-4"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
															><path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M16 3l-4 4-4-4"
															/></svg
														>
													{/if}
													Upload Image
												</button>
												<span class="min-w-0 flex-1 truncate text-xs text-gray-600"
													>{newCategoryPictureFile
														? newCategoryPictureFile.name
														: 'No file chosen'}</span
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
														class="text-xs text-red-500 hover:text-red-700 sm:text-sm"
														>Remove</button
													>
												{/if}
												<input
													id="editCategoryImageInput"
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
													if (newCategoryPicture && newCategoryPicture.startsWith('blob:')) {
														try {
															URL.revokeObjectURL(newCategoryPicture);
														} catch (e) {}
													}
													newCategoryPicture = '';
													newCategoryPictureFile = null;
												}}
												class="inline-flex min-w-27 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
											>
												Cancel
											</button>
											<button
												type="submit"
												class="inline-flex min-w-27 items-center justify-center rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-pink-700"
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
				{/if}

			{:else if activeTab === 'usage'}
				{#if usageStatsLoading}
					<div class="p-6">
						<div class="py-16 text-center animate-pulse">
							<Activity size={40} class="mx-auto mb-3 text-gray-300" />
							<p class="text-sm text-gray-500">Usage statistics are loading...</p>
						</div>
					</div>
				{:else}
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
							<p class="text-sm text-gray-500">Usage statistics are loading...</p>
						</div>
					{/if}
				</div>
				{/if}

			{/if}
		</div>
	{/if}
</div>

<!-- Stock Adjustment Modal -->
{#if showAdjustStockModal && adjustingItem}
	<div
		class="fixed inset-0 z-50 overflow-y-auto"
		role="dialog"
		aria-modal="true"
		aria-labelledby="adjust-stock-modal-title"
	>
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
			role="button"
			tabindex="0"
			aria-label="Close stock adjustment modal"
			onclick={closeAdjustStock}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					closeAdjustStock();
				}
			}}
		></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div
				class="animate-scaleIn relative z-50 w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
			>
				<!-- Modal Header -->
				<div
					class="flex items-center justify-between border-b border-gray-200 bg-linear-to-r from-gray-50 to-white px-6 py-4"
				>
					<div>
						<h2
							id="adjust-stock-modal-title"
							class="text-md flex items-center gap-2 font-bold text-gray-900"
						>
							<Sliders class="h-4 w-4 text-pink-600" />
							Stock Adjustment
						</h2>
						<p class="mt-0.5 text-xs text-gray-500">Manually add or subtract stock levels</p>
					</div>
					<button
						onclick={closeAdjustStock}
						class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
						aria-label="Close modal"
						disabled={adjustStockLoading}
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				<!-- Modal Body -->
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleAdjustStock();
					}}
					class="space-y-4 p-6"
				>
					<!-- Item Info Card -->
					<div
						class="flex items-center gap-3 rounded-xl border border-gray-200/60 bg-gray-50 p-3.5"
					>
						{#if adjustingItem.picture}
							<img
								src={adjustingItem.picture}
								alt={adjustingItem.name}
								class="h-10 w-10 rounded-lg object-cover ring-2 ring-pink-100"
							/>
						{:else}
							<div
								class="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-50 text-pink-600"
							>
								<Package class="h-5 w-5" />
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<h3 class="truncate text-xs font-bold text-gray-900 uppercase">
								{adjustingItem.name}
							</h3>
							<p class="mt-0.5 text-[10px] text-gray-500">
								Current Stock: <span class="font-bold text-pink-600"
									>{adjustingItem.currentCount ??
										getCurrentCount(adjustingItem.quantity, adjustingItem.donations ?? 0)}</span
								> items
							</p>
						</div>
					</div>

					<!-- Adjustment Type (Segmented Control) -->
					<div class="space-y-1.5">
						<span class="block text-xs font-bold tracking-wide text-gray-700 uppercase"
							>Adjustment Type</span
						>
						<div class="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-gray-100 p-1">
							<button
								type="button"
								onclick={() => (adjustmentType = 'add')}
								class="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all {adjustmentType ===
								'add'
									? 'border border-gray-200/50 bg-white text-emerald-700 shadow-xs'
									: 'text-gray-500 hover:text-gray-700'}"
							>
								<span class="h-2 w-2 rounded-full bg-emerald-500"></span>
								Restock / Add
							</button>
							<button
								type="button"
								onclick={() => (adjustmentType = 'subtract')}
								class="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all {adjustmentType ===
								'subtract'
									? 'border border-gray-200/50 bg-white text-red-700 shadow-xs'
									: 'text-gray-500 hover:text-gray-700'}"
							>
								<span class="h-2 w-2 rounded-full bg-red-500"></span>
								Damage / Subtract
							</button>
						</div>
					</div>

					<!-- Quantity Input -->
					<div class="space-y-1.5">
						<label
							for="adjustQuantity"
							class="block text-xs font-bold tracking-wide text-gray-700 uppercase"
							>Quantity to Adjust *</label
						>
						<div class="relative">
							<input
								id="adjustQuantity"
								type="number"
								min="1"
								required
								bind:value={adjustmentQuantity}
								class="block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs transition-all focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
								placeholder="e.g. 3"
							/>
						</div>
					</div>

					<!-- Reason Input -->
					<div class="space-y-1.5">
						<label
							for="adjustReason"
							class="block text-xs font-bold tracking-wide text-gray-700 uppercase"
							>Reason / Note</label
						>
						<textarea
							id="adjustReason"
							rows="3"
							bind:value={adjustmentReason}
							class="block w-full resize-none rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-xs transition-all focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
						></textarea>
					</div>

					<!-- Modal Footer -->
					<div class="flex items-center justify-end gap-3 border-t border-gray-100 pt-3">
						<button
							type="button"
							onclick={closeAdjustStock}
							class="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98]"
							disabled={adjustStockLoading}
						>
							Cancel
						</button>
						<button
							type="submit"
							class="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all active:scale-[0.98] {adjustmentType ===
							'add'
								? 'bg-linear-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 focus:ring-emerald-500/20'
								: 'bg-linear-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 focus:ring-red-500/20'}"
							disabled={adjustStockLoading}
						>
							{#if adjustStockLoading}
								<svg class="h-3.5 w-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									/>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									/>
								</svg>
								Adjusting...
							{:else}
								{adjustmentType === 'add' ? 'Add' : 'Subtract'} {adjustmentQuantity} Items
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

<!-- Add New Item / Edit Item Modal -->
{#if showAddItemModal}
	<div
		class="fixed inset-0 z-50 overflow-y-auto"
		role="dialog"
		aria-modal="true"
		aria-labelledby="add-item-modal-title"
	>
		<div
			class="fixed inset-0 cursor-default bg-black/40 backdrop-blur-sm transition-opacity"
			role="button"
			tabindex="0"
			aria-label="Close add item modal"
			onclick={closeAddItemModal}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					closeAddItemModal();
				}
			}}
		></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="animate-scaleIn relative z-50 w-full max-w-2xl rounded-xl bg-white shadow-2xl">
				<!-- Modal Header -->
				<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
					<div>
						<h2 id="add-item-modal-title" class="text-lg font-semibold text-gray-900">
							{editingItemId ? 'Edit Item' : 'Add New Item'}
						</h2>
						<p class="mt-0.5 text-sm text-gray-500">
							Enter details for the {editingItemId ? 'updated' : 'new'} inventory item
						</p>
					</div>
					<button
						onclick={closeAddItemModal}
						class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
						aria-label="Close modal"
						disabled={loading}
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				<!-- Modal Body -->
				<div class="max-h-[75vh] overflow-y-auto px-6 py-6">
					<form id="add-item-form" onsubmit={handleAddItem} class="space-y-5">
						<div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
							<div>
								<label for="itemName" class="block text-sm font-medium text-gray-700"
									>Item Name *</label
								>
								<input
									type="text"
									id="itemName"
									bind:value={newItem.name}
									required
									class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
									placeholder="e.g., Chef Knife Set"
								/>
							</div>

							<div>
								<label for="modalCategory" class="block text-sm font-medium text-gray-700"
									>Category *</label
								>
								<select
									id="modalCategory"
									bind:value={newItem.categoryId}
									onchange={(e) => {
										const target = e.target as HTMLSelectElement;
										const selectedCat = categories.find((c) => c.id === target.value);
										if (selectedCat) newItem.category = selectedCat.name;
									}}
									required
									class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
								>
									<option value="">Select a category</option>
									{#each categories as category}
										<option value={category.id}>{category.name}</option>
									{/each}
								</select>
							</div>

							<div>
								<label for="modalSpecification" class="block text-sm font-medium text-gray-700"
									>Specification</label
								>
								<input
									type="text"
									id="modalSpecification"
									bind:value={newItem.specification}
									class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
									placeholder="e.g., Stainless steel, 8-piece"
								/>
							</div>

							<div>
								<label for="modalToolsOrEquipment" class="block text-sm font-medium text-gray-700"
									>Tools / Equipment</label
								>
								<input
									type="text"
									id="modalToolsOrEquipment"
									bind:value={newItem.toolsOrEquipment}
									class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
									placeholder="e.g., Power adapter, Sheath"
								/>
							</div>

							<div>
								<label for="modalQuantity" class="block text-sm font-medium text-gray-700"
									>Current Count *</label
								>
								<input
									type="number"
									id="modalQuantity"
									bind:value={newItem.quantity}
									required
									min="0"
									class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
									placeholder="0"
								/>
							</div>

							<div>
								<label for="modalEomCount" class="block text-sm font-medium text-gray-700"
									>EOM Count</label
								>
								<input
									type="number"
									id="modalEomCount"
									bind:value={newItem.eomCount}
									min="0"
									class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none"
									placeholder="0"
								/>
							</div>
						</div>

						<!-- required Item Checkbox -->
						<div class="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
							<label class="flex cursor-pointer items-start gap-3">
								<input
									type="checkbox"
									bind:checked={newItem.isrequired}
									class="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
								/>
								<div class="flex-1">
									<span class="text-sm font-medium text-gray-900">Mark as required Item</span>
									<p class="mt-0.5 text-xs text-gray-600">
										required items always appear on student request forms.
									</p>
								</div>
							</label>

							{#if newItem.isrequired}
								<div class="mt-3 border-t border-emerald-200 pt-3">
									<label
										for="maxQuantityPerRequest"
										class="mb-1 block text-sm font-medium text-gray-900"
									>
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
										class="block w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
									/>
									<p class="mt-1 text-xs text-gray-600">
										Set the maximum quantity students can request per transaction. Leave empty for
										unlimited requests.
									</p>
								</div>
							{/if}
						</div>

						<!-- Image Upload -->
						<div
							class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
							aria-live="polite"
						>
							<button
								type="button"
								onclick={() => pictureInput?.click()}
								aria-label="Upload item image"
								class="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:ring-2 focus:ring-gray-500 focus:outline-none disabled:opacity-50"
								disabled={uploadingImage || loading}
							>
								{#if uploadingImage}
									<div
										class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
									></div>
									Uploading...
								{:else}
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M16 3l-4 4-4-4"
										/></svg
									>
									Upload Image
								{/if}
							</button>
							<span class="flex-1 truncate text-sm text-gray-500"
								>{newItem.pictureFile ? newItem.pictureFile.name : 'No file chosen'}</span
							>
							{#if newItem.picture}
								<img
									src={newItem.picture}
									alt="preview"
									class="h-12 w-12 rounded-lg border border-gray-200 object-cover"
								/>
								<button
									type="button"
									onclick={() => {
										try {
											URL.revokeObjectURL(newItem.picture);
										} catch (e) {}
										newItem.picture = '';
										newItem.pictureFile = null;
									}}
									class="text-sm text-red-500 hover:text-red-700"
									aria-label="Remove image">Remove</button
								>
							{/if}
							<input
								id="modalPicture"
								type="file"
								accept="image/*"
								onchange={handlePictureChange}
								bind:this={pictureInput}
								class="hidden"
							/>
						</div>
					</form>
				</div>

				<!-- Modal Footer -->
				<div
					class="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4"
				>
					<button
						type="button"
						onclick={closeAddItemModal}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium whitespace-nowrap text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 sm:text-sm"
						disabled={loading}
					>
						Cancel
					</button>
					<button
						type="submit"
						form="add-item-form"
						class="inline-flex items-center rounded-lg bg-pink-600 px-4 py-2 text-xs font-medium whitespace-nowrap text-white shadow-sm hover:bg-pink-700 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 sm:text-sm"
						disabled={loading || uploadingImage}
					>
						{#if loading}
							<div
								class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
							></div>
						{:else}
							<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 13l4 4L19 7"
								/>
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
		<div
			class="fixed inset-0 cursor-default bg-black/40 backdrop-blur-sm transition-opacity"
			role="button"
			tabindex="0"
			aria-label="Close import modal"
			onclick={closeImportModal}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					closeImportModal();
				}
			}}
		></div>
		<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
			<div
				class="animate-scaleIn relative w-full max-w-4xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
			>
				<!-- Header -->
				<div
					class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-8 sm:py-6"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="flex min-w-0 flex-1 items-start gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30 sm:h-12 sm:w-12"
							>
								<svg
									class="h-5 w-5 text-white sm:h-6 sm:w-6"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2.5"
										d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
									/>
								</svg>
							</div>
							<div class="min-w-0 flex-1">
								<h2
									id="import-modal-title"
									class="text-lg font-bold text-gray-900 sm:text-xl md:text-2xl"
								>
									Import Inventory Items
								</h2>
								<p class="mt-0.5 text-xs font-medium text-gray-500 sm:text-sm">
									{#if importStep === 'upload'}
										Upload a CSV or Excel file to bulk import items. Use sheet tab name for category
										(e.g., "Hot Kitchen")
									{:else if importStep === 'preview'}
										Review and confirm import
									{:else}
										Import complete
									{/if}
								</p>
							</div>
						</div>
						<button
							onclick={closeImportModal}
							aria-label="Close modal"
							class="rounded-xl p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 sm:p-2.5"
						>
							<svg
								class="h-5 w-5 sm:h-6 sm:w-6"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</div>
				</div>

				<!-- Content -->
				<div class="max-h-[70vh] overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
					{#if importStep === 'upload'}
						<!-- Upload Step -->
						<div class="space-y-6">
							<!-- Collapsible Format Guide -->
							<div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
								<!-- Accordion Header -->
								<button
									type="button"
									onclick={() => {
										showFormatGuide = !showFormatGuide;
									}}
									class="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50"
								>
									<div class="flex items-center gap-2.5">
										<span
											class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600"
										>
											<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
												<path
													fill-rule="evenodd"
													d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
													clip-rule="evenodd"
												/>
											</svg>
										</span>
										<span class="text-sm font-semibold text-gray-800">File Format Guide</span>
										<span
											class="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
											>Required reading</span
										>
									</div>
									<svg
										class="h-4 w-4 text-gray-400 transition-transform duration-200 {showFormatGuide
											? 'rotate-180'
											: ''}"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 9l-7 7-7-7"
										/>
									</svg>
								</button>

								<!-- Accordion Body -->
								{#if showFormatGuide}
									<div
										class="space-y-4 border-t border-gray-100 bg-gray-50 px-4 py-4 text-sm text-gray-700"
									>
										<!-- Column reference -->
										<div>
											<p class="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
												Column Reference — Excel / CSV
											</p>
											<div class="overflow-hidden rounded-md border border-gray-200">
												<table class="min-w-full divide-y divide-gray-200 text-xs">
													<thead class="bg-gray-100">
														<tr>
															<th class="px-3 py-2 text-left font-semibold text-gray-600">Column</th
															>
															<th class="px-3 py-2 text-left font-semibold text-gray-600"
																>Required</th
															>
															<th class="px-3 py-2 text-left font-semibold text-gray-600">Notes</th>
														</tr>
													</thead>
													<tbody class="divide-y divide-gray-100 bg-white">
														<tr>
															<td class="px-3 py-2 font-medium text-gray-800">Name</td>
															<td class="px-3 py-2"
																><span
																	class="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
																	>Required</span
																></td
															>
															<td class="px-3 py-2 text-gray-600">Item name — must be unique</td>
														</tr>
														<tr class="bg-gray-50">
															<td class="px-3 py-2 font-medium text-gray-800">Category</td>
															<td class="px-3 py-2"
																><span
																	class="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
																	>Auto / Column</span
																></td
															>
															<td class="px-3 py-2 text-gray-600"
																>Uses sheet tab name automatically, or add a Category column</td
															>
														</tr>
														<tr>
															<td class="px-3 py-2 font-medium text-gray-800">Specification</td>
															<td class="px-3 py-2"
																><span
																	class="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
																	>Optional</span
																></td
															>
															<td class="px-3 py-2 text-gray-600"
																>Item specifications / description</td
															>
														</tr>
														<tr class="bg-gray-50">
															<td class="px-3 py-2 font-medium text-gray-800">Tools or Equipment</td
															>
															<td class="px-3 py-2"
																><span
																	class="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
																	>Optional</span
																></td
															>
															<td class="px-3 py-2 text-gray-600"
																>Associated tools or companion equipment</td
															>
														</tr>
														<tr>
															<td class="px-3 py-2 font-medium text-gray-800">Current Count</td>
															<td class="px-3 py-2"
																><span
																	class="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
																	>Optional</span
																></td
															>
															<td class="px-3 py-2 text-gray-600"
																>Current stock quantity before donations — defaults to 1</td
															>
														</tr>
														<tr class="bg-gray-50">
															<td class="px-3 py-2 font-medium text-gray-800">Donations</td>
															<td class="px-3 py-2"
																><span
																	class="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
																	>Optional</span
																></td
															>
															<td class="px-3 py-2 text-gray-600"
																>Donated quantity added to the current count — defaults to 0</td
															>
														</tr>
														<tr class="bg-gray-50">
															<td class="px-3 py-2 font-medium text-gray-800">EOM Count</td>
															<td class="px-3 py-2"
																><span
																	class="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
																	>Optional</span
																></td
															>
															<td class="px-3 py-2 text-gray-600"
																>End-of-month count — defaults to 0</td
															>
														</tr>
														<tr>
															<td class="px-3 py-2 font-medium text-gray-800">Remarks</td>
															<td class="px-3 py-2"
																><span
																	class="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
																	>Optional</span
																></td
															>
															<td class="px-3 py-2 text-gray-600">Additional notes</td>
														</tr>
														<tr class="bg-gray-50">
															<td class="px-3 py-2 font-medium text-gray-800">Picture</td>
															<td class="px-3 py-2"
																><span
																	class="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
																	>Optional</span
																></td
															>
															<td class="px-3 py-2 text-gray-600"
																>Image URL (https://…) or filename from ZIP</td
															>
														</tr>
													</tbody>
												</table>
											</div>
										</div>

										<!-- Tips row -->
										<div class="grid grid-cols-2 gap-3">
											<div class="rounded-md border border-purple-200 bg-purple-50 p-3">
												<p class="mb-1 text-xs font-semibold text-purple-800">
													💡 Pro Tip — Categories
												</p>
												<p class="text-xs text-purple-700">
													Name your Excel sheet tab as the category (e.g., "Hot Kitchen", "Baking
													Lab"). The sheet name is used automatically — no Category column needed.
												</p>
											</div>
											<div class="rounded-md border border-blue-200 bg-blue-50 p-3">
												<p class="mb-1 text-xs font-semibold text-blue-800">🖼 Image Support</p>
												<ul class="mt-1 space-y-1 text-xs text-blue-700">
													<li>
														<strong>Embedded:</strong> Insert images directly into Excel cells
													</li>
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
							<div
								class="flex items-center justify-between rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4"
							>
								<div class="flex items-center gap-3">
									<svg
										class="h-8 w-8 text-gray-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
										/>
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
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
										/>
									</svg>
									Download Template
								</button>
							</div>

							<!-- File Upload -->
							<div>
								<label for="importFileInput" class="mb-2 block text-sm font-medium text-gray-700">
									Upload File
								</label>

								{#if !importFile}
									<!-- Upload Drop Zone -->
									<label
										class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 transition-all duration-200"
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
											class="mb-3 h-12 w-12 transition-colors"
											class:text-emerald-500={isDraggingOver}
											class:text-gray-400={!isDraggingOver}
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
											/>
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
										<span class="mt-1 text-xs text-gray-500"
											>CSV, XLSX, XLS, or ZIP files (with images)</span
										>
										<input
											id="importFileInput"
											type="file"
											accept=".csv,.xlsx,.xls,.zip"
											onchange={handleImportFileSelect}
											class="hidden"
										/>
									</label>
									{:else if importFile}
										<!-- File Preview Card -->
										<div class="rounded-lg border-2 border-emerald-500 bg-white p-4 transition-all">
											<div class="flex items-start gap-4">
												<!-- File Icon -->
												<div class="shrink-0">
													{#if importFile && getFileIcon(importFile.name) === 'csv'}
													<div
														class="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100"
													>
														<svg
															class="h-7 w-7 text-green-600"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path
																fill-rule="evenodd"
																d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
																clip-rule="evenodd"
															/>
														</svg>
													</div>
												{:else if importFile && getFileIcon(importFile.name) === 'excel'}
													<div
														class="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100"
													>
														<svg
															class="h-7 w-7 text-emerald-600"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path
																fill-rule="evenodd"
																d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
																clip-rule="evenodd"
															/>
														</svg>
													</div>
												{:else if importFile && getFileIcon(importFile.name) === 'zip'}
													<div
														class="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100"
													>
														<svg
															class="h-7 w-7 text-purple-600"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path
																d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4z"
															/>
														</svg>
													</div>
												{/if}
											</div>

											<!-- File Info -->
											<div class="min-w-0 flex-1">
												<div class="flex items-start justify-between gap-4">
													<div class="min-w-0 flex-1">
														<p
															class="truncate text-sm font-medium text-gray-900"
															title={importFile?.name}
														>
															{importFile?.name}
														</p>
														<p class="mt-1 text-xs text-gray-500">
															{formatFileSize(importFile?.size || 0)}
														</p>
													</div>
													<button
														onclick={removeImportFile}
														class="shrink-0 text-gray-400 transition-colors hover:text-red-600"
														title="Remove file"
													>
														<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
															<path
																fill-rule="evenodd"
																d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
																clip-rule="evenodd"
															/>
														</svg>
													</button>
												</div>
											</div>
										</div>
									</div>
								{/if}
							</div>


{#if importing}
								<div class="flex items-center justify-center gap-3 py-8">
									<div
										class="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent"
									></div>
									<span class="text-sm text-gray-600">Processing file...</span>
								</div>
							{/if}
						</div>
					{:else if importStep === 'preview'}
						<!-- Preview Step -->
						<div class="space-y-4">
							<!-- Import Progress (shown during import) -->
							{#if importing && importProgress.total > 0}
								<div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
									<div class="mb-3 flex items-center gap-3">
										<div
											class="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
										></div>
										<div class="flex-1">
											<p class="text-sm font-medium text-blue-900">{importProgress.message}</p>
											<p class="mt-1 text-xs text-blue-600">
												Progress: {importProgress.current} of {importProgress.total} items
											</p>
										</div>
									</div>
									<div class="h-2 w-full rounded-full bg-blue-200">
										<div
											class="h-2 rounded-full bg-blue-600 transition-all duration-300"
											style="width: {(importProgress.current / importProgress.total) * 100}%"
										></div>
									</div>
								</div>
							{/if}

							<!-- Summary -->
							<div class="grid grid-cols-4 gap-4">
								<div
									class="rounded-2xl border border-pink-100 bg-linear-to-br from-pink-50 to-pink-100/50 p-5 shadow-sm"
								>
									<p class="text-xs font-bold tracking-wide text-pink-600 uppercase">Total Rows</p>
									<p class="mt-1.5 text-3xl font-black text-pink-900">{processedImportPreviewData.length}</p>
								</div>
								<div
									class="rounded-2xl border border-green-100 bg-linear-to-br from-green-50 to-green-100/50 p-5 shadow-sm"
								>
									<p class="text-xs font-bold tracking-wide text-green-600 uppercase">Create</p>
									<p class="mt-1.5 text-3xl font-black text-green-900">
										{processedImportPreviewData.filter((i) => i._importAction === 'create').length}
									</p>
								</div>
								<div
									class="rounded-2xl border border-emerald-100 bg-linear-to-br from-emerald-50 to-emerald-100/50 p-5 shadow-sm"
								>
									<p class="text-xs font-bold tracking-wide text-emerald-600 uppercase">Update</p>
									<p class="mt-1.5 text-3xl font-black text-emerald-900">
										{processedImportPreviewData.filter((i) => i._importAction === 'update').length}
									</p>
								</div>
								<div
									class="rounded-2xl border border-amber-100 bg-linear-to-br from-amber-50 to-amber-100/50 p-5 shadow-sm"
								>
									<p class="text-xs font-bold tracking-wide text-amber-600 uppercase">No Change</p>
									<p class="mt-1.5 text-3xl font-black text-amber-900">
										{processedImportPreviewData.filter((i) => i._importAction === 'no-change').length}
									</p>
								</div>
							</div>

							<!-- Selective Update Configuration Panel -->
							<div class="rounded-2xl border border-pink-100 bg-pink-50/10 p-5 shadow-xs space-y-4">
								<div class="flex items-center justify-between border-b border-pink-100/50 pb-2">
									<div class="flex items-center gap-2">
										<Sliders class="h-4.5 w-4.5 text-pink-600" />
										<h3 class="text-xs font-bold text-pink-900 tracking-wide uppercase">
											Fields to Update / Import
										</h3>
									</div>
									<div class="flex gap-2.5">
										<button
											type="button"
											onclick={() => toggleAllImportFields(true)}
											class="text-[11px] font-bold text-pink-600 hover:text-pink-700 transition-colors"
										>
											Select All
										</button>
										<span class="text-pink-200 text-[11px]">|</span>
										<button
											type="button"
											onclick={() => toggleAllImportFields(false)}
											class="text-[11px] font-bold text-gray-500 hover:text-gray-700 transition-colors"
										>
											Clear All
										</button>
									</div>
								</div>

								<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
									<!-- Name -->
									<label class="flex items-center gap-2.5 cursor-pointer rounded-xl border border-gray-100 bg-white/60 px-3 py-2.5 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none shadow-xs">
										<input
											type="checkbox"
											bind:checked={selectedImportFields.name}
											class="h-4.5 w-4.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
										/>
										<span class="text-xs font-semibold text-gray-800 leading-none">Name</span>
									</label>

									<!-- Category -->
									<label class="flex items-center gap-2.5 cursor-pointer rounded-xl border border-gray-100 bg-white/60 px-3 py-2.5 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none shadow-xs">
										<input
											type="checkbox"
											bind:checked={selectedImportFields.category}
											class="h-4.5 w-4.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
										/>
										<span class="text-xs font-semibold text-gray-800 leading-none">Category</span>
									</label>

									<!-- Specification -->
									<label class="flex items-center gap-2.5 cursor-pointer rounded-xl border border-gray-100 bg-white/60 px-3 py-2.5 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none shadow-xs">
										<input
											type="checkbox"
											bind:checked={selectedImportFields.specification}
											class="h-4.5 w-4.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
										/>
										<span class="text-xs font-semibold text-gray-800 leading-none">Specification</span>
									</label>

									<!-- Tools or Equipment -->
									<label class="flex items-center gap-2.5 cursor-pointer rounded-xl border border-gray-100 bg-white/60 px-3 py-2.5 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none shadow-xs">
										<input
											type="checkbox"
											bind:checked={selectedImportFields.toolsOrEquipment}
											class="h-4.5 w-4.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
										/>
										<span class="text-xs font-semibold text-gray-800 leading-none">Tools/Equipment</span>
									</label>

									<!-- Current Count -->
									<label class="flex items-center gap-2.5 cursor-pointer rounded-xl border border-gray-100 bg-white/60 px-3 py-2.5 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none shadow-xs">
										<input
											type="checkbox"
											bind:checked={selectedImportFields.quantity}
											class="h-4.5 w-4.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
										/>
										<span class="text-xs font-semibold text-gray-800 leading-none">Current Count</span>
									</label>

									<!-- EOM Count -->
									<label class="flex items-center gap-2.5 cursor-pointer rounded-xl border border-gray-100 bg-white/60 px-3 py-2.5 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none shadow-xs">
										<input
											type="checkbox"
											bind:checked={selectedImportFields.eomCount}
											class="h-4.5 w-4.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
										/>
										<span class="text-xs font-semibold text-gray-800 leading-none">EOM Count</span>
									</label>

									<!-- Donations -->
									<label class="flex items-center gap-2.5 cursor-pointer rounded-xl border border-gray-100 bg-white/60 px-3 py-2.5 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none shadow-xs">
										<input
											type="checkbox"
											bind:checked={selectedImportFields.donations}
											class="h-4.5 w-4.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
										/>
										<span class="text-xs font-semibold text-gray-800 leading-none">Donations</span>
									</label>

									<!-- Variance -->
									<label class="flex items-center gap-2.5 cursor-pointer rounded-xl border border-gray-100 bg-white/60 px-3 py-2.5 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none shadow-xs">
										<input
											type="checkbox"
											bind:checked={selectedImportFields.variance}
											class="h-4.5 w-4.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
										/>
										<span class="text-xs font-semibold text-gray-800 leading-none">Variance</span>
									</label>

									<!-- Image -->
									<label class="flex items-center gap-2.5 cursor-pointer rounded-xl border border-gray-100 bg-white/60 px-3 py-2.5 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none shadow-xs">
										<input
											type="checkbox"
											bind:checked={selectedImportFields.picture}
											class="h-4.5 w-4.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
										/>
										<span class="text-xs font-semibold text-gray-800 leading-none">Image</span>
									</label>
								</div>
							</div>

							{#if processedImportPreviewData.filter((i) => i._importAction === 'error').length > 0}
								<div
									class="mt-4 rounded-2xl border border-red-100 bg-linear-to-br from-red-50 to-red-100/50 p-5 shadow-sm"
								>
									<p class="text-xs font-bold tracking-wide text-red-600 uppercase">Errors</p>
									<p class="mt-1.5 text-3xl font-black text-red-900">
										{processedImportPreviewData.filter((i) => i._importAction === 'error').length}
									</p>
								</div>
							{/if}

							{#if importErrors.length > 0}
								<div
									class="mt-4 rounded-2xl border border-yellow-200 bg-linear-to-br from-yellow-50 to-yellow-100/50 p-5 shadow-sm"
								>
									<div class="flex items-start">
										<div
											class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-200/60"
										>
											<svg
												class="h-5 w-5 text-yellow-700"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
												/>
											</svg>
										</div>
										<div class="ml-4">
											<h3 class="text-sm font-bold text-yellow-900">Validation Errors</h3>
											<div class="mt-2 max-h-32 overflow-y-auto text-sm text-yellow-800">
												<ul class="list-inside list-disc space-y-1">
													{#each importErrors.slice(0, 10) as error}
														<li>{error}</li>
													{/each}
													{#if importErrors.length > 10}
														<li class="font-semibold text-yellow-700">
															...and {importErrors.length - 10} more errors
														</li>
													{/if}
												</ul>
											</div>
										</div>
									</div>
								</div>
							{/if}

							<!-- Preview Table -->
							<div class="mt-4 overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
								<div class="max-h-96 overflow-y-auto">
									<table class="min-w-full divide-y divide-gray-200">
										<thead class="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm">
											<tr>
												<th class="w-12 px-4 py-4 text-center">
													<input
														type="checkbox"
														checked={allRowsSelected}
														onchange={toggleAllRows}
														class="h-4.5 w-4.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
													/>
												</th>
												<th
													class="px-5 py-4 text-left text-xs font-bold tracking-wider text-gray-500 uppercase"
													>Status</th
												>
												<th
													class="px-5 py-4 text-left text-xs font-bold tracking-wider text-gray-500 uppercase"
													>Name</th
												>
												<th
													class="px-5 py-4 text-left text-xs font-bold tracking-wider text-gray-500 uppercase"
													>Category</th
												>
												<th
													class="px-5 py-4 text-left text-xs font-bold tracking-wider text-gray-500 uppercase"
													>Current Count</th
												>
												<th
													class="px-5 py-4 text-left text-xs font-bold tracking-wider text-gray-500 uppercase"
													>Donations</th
												>
												<th
													class="px-5 py-4 text-left text-xs font-bold tracking-wider text-gray-500 uppercase"
													>Image</th
												>
											</tr>
										</thead>
										<tbody class="divide-y divide-gray-100 bg-white">
											{#each processedImportPreviewData as item}
												<tr
													class={item._importAction === 'create'
														? 'bg-green-50/40 hover:bg-green-50'
														: item._importAction === 'update'
															? 'bg-emerald-50/40 hover:bg-emerald-50'
															: item._importAction === 'no-change'
																? 'bg-amber-50/40 hover:bg-amber-50'
																: item._importAction === 'skip'
																	? 'opacity-40 bg-gray-50'
																	: 'bg-red-50'}
												>
													<td class="w-12 px-4 py-3 text-center">
														<input
															type="checkbox"
															checked={item._selected !== false}
															onchange={(e) => {
																const originalItem = importPreviewData.find((i) => i._rowNumber === item._rowNumber);
																if (originalItem) {
																	originalItem._selected = e.currentTarget.checked;
																}
															}}
															class="h-4.5 w-4.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
														/>
													</td>
													<td class="px-4 py-3 whitespace-nowrap">
														{#if item._importAction === 'create'}
															<span class="inline-flex items-center gap-1 text-xs text-green-600">
																<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																	<path
																		fill-rule="evenodd"
																		d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
																		clip-rule="evenodd"
																	/>
																</svg>
																Create
															</span>
														{:else if item._importAction === 'update'}
															<span
																class="inline-flex items-center gap-1 text-xs text-emerald-700"
																title={`Will update: ${item._changedFields?.join(', ') || 'changed fields'}`}
															>
																<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																	<path
																		fill-rule="evenodd"
																		d="M16.707 5.293a1 1 0 010 1.414l-7.778 7.778a1 1 0 01-1.414 0L3.293 10.26a1 1 0 111.414-1.414l3.515 3.515 7.071-7.071a1 1 0 011.414 0z"
																		clip-rule="evenodd"
																	/>
																</svg>
																Update
															</span>
														{:else if item._importAction === 'no-change'}
															<span
																class="inline-flex items-center gap-1 text-xs text-amber-700"
																title="Existing item matches imported values"
															>
																<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																	<path
																		fill-rule="evenodd"
																		d="M18 10A8 8 0 114 3.08V7a1 1 0 11-2 0V2a1 1 0 011-1h5a1 1 0 110 2H4.415A6 6 0 1016 10a1 1 0 112 0z"
																		clip-rule="evenodd"
																	/>
																</svg>
																No Change
															</span>
														{:else if item._importAction === 'skip'}
															<span class="inline-flex items-center gap-1 text-xs text-gray-400 select-none">
																<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
																</svg>
																Skipped
															</span>
														{:else}
															<span
																class="inline-flex items-center gap-1 text-xs text-red-600"
																title={item._errors.join(', ')}
															>
																<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																	<path
																		fill-rule="evenodd"
																		d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
																		clip-rule="evenodd"
																	/>
																</svg>
																Error
															</span>
														{/if}
													</td>
													<td class="px-4 py-3 text-sm text-gray-900">{item.name}</td>
													<td class="px-4 py-3 text-sm text-gray-600">
														{item.category}
														{#if item._categoryExists}
															<span
																class="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700"
																>exists</span
															>
														{:else if item.category}
															<span
																class="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700"
																>new</span
															>
														{/if}
													</td>
													<td class="px-4 py-3 text-sm text-gray-900"
														>{getCurrentCount(item.quantity, item.donations ?? 0)}</td
													>
													<td class="px-4 py-3 text-sm text-gray-900">{item.donations ?? 0}</td>
													<td class="px-4 py-3 whitespace-nowrap">
														{#if item._hasImage}
															{#if item._imageSource === 'url'}
																<button
																	onclick={() => openImagePreview(item)}
																	class="inline-flex cursor-pointer items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
																	title="Click to preview"
																>
																	<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																		<path
																			fill-rule="evenodd"
																			d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
																			clip-rule="evenodd"
																		/>
																	</svg>
																	URL
																</button>
															{:else if item._imageSource === 'zip'}
																<button
																	onclick={() => openImagePreview(item)}
																	class="inline-flex cursor-pointer items-center gap-1 text-xs text-purple-600 hover:text-purple-800 hover:underline"
																	title="Click to preview"
																>
																	<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																		<path
																			fill-rule="evenodd"
																			d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
																			clip-rule="evenodd"
																		/>
																	</svg>
																	File
																</button>
															{:else if item._imageSource === 'excel'}
																<button
																	onclick={() => openImagePreview(item)}
																	class="inline-flex cursor-pointer items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 hover:underline"
																	title="Click to preview"
																>
																	<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
																		<path
																			fill-rule="evenodd"
																			d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
																			clip-rule="evenodd"
																		/>
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
						<div class="py-12 text-center">
							<svg
								class="mx-auto mb-4 h-16 w-16 text-green-500"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<h3 class="mb-2 text-lg font-medium text-gray-900">Import Successful!</h3>
							<p class="text-sm text-gray-500">Items have been added to your inventory</p>
						</div>
					{/if}
				</div>

				<!-- Footer -->
				<div
					class="sticky bottom-0 flex items-center justify-between border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-8"
				>
					<button
						onclick={closeImportModal}
						class="rounded-xl border-2 border-gray-300 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-gray-400 hover:bg-gray-50 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:outline-none active:scale-95"
					>
						{importing ? 'Hide' : importStep === 'complete' ? 'Close' : 'Cancel'}
					</button>

					{#if importStep === 'upload' && importPreviewData.length > 0}
						<!-- Next button for upload step -->
						<button
							onclick={() => {
								importStep = 'preview';
							}}
							class="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-emerald-600 to-emerald-700 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/40 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:outline-none active:scale-95 disabled:pointer-events-none disabled:opacity-50"
							disabled={importing}
						>
							Continue to Preview
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 5l7 7-7 7"
								/>
							</svg>
						</button>
					{:else if importStep === 'preview'}
						<div class="flex gap-3">
							<button
								onclick={() => {
									importStep = 'upload';
								}}
								class="inline-flex items-center gap-2 rounded-xl border-2 border-gray-300 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-gray-400 hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none active:scale-95 disabled:pointer-events-none disabled:opacity-50"
								disabled={importing}
							>
								Back
							</button>
							<button
								onclick={handleImportConfirm}
								class="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-emerald-600 to-emerald-700 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/40 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:outline-none active:scale-95 disabled:pointer-events-none disabled:opacity-50"
								disabled={importing ||
									processedImportPreviewData.filter(
										(i) => i._importAction === 'create' || i._importAction === 'update'
									).length === 0}
							>
								{#if importing}
									<div
										class="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white"
									></div>
									Importing...
								{:else}
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
										/>
									</svg>
									Apply {processedImportPreviewData.filter(
										(i) => i._importAction === 'create' || i._importAction === 'update'
									).length} Changes
								{/if}
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<ExportModal
	bind:show={showExportModal}
	items={items}
	isExporting={isExporting}
	onExport={handleExportConfirm}
/>

<!-- Image preview lightbox for import review -->
{#if importPreviewImageUrl}
	<div
		class="fixed inset-0 z-9999 flex items-center justify-center bg-black/80"
		role="button"
		tabindex="0"
		aria-label="Close image preview"
		onclick={closeImagePreview}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				closeImagePreview();
			}
		}}
	>
		<div
			class="relative mx-4 w-full max-w-2xl"
			role="button"
			tabindex="0"
			aria-label="Image preview content"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-center justify-between rounded-t-xl bg-white px-4 py-3">
				<p class="truncate text-sm font-medium text-gray-800">{importPreviewImageName}</p>
				<button
					onclick={closeImagePreview}
					class="ml-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
					aria-label="Close preview"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>
			<!-- Image -->
			<div
				class="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-b-xl bg-gray-50 p-4"
			>
				<img
					src={importPreviewImageUrl}
					alt={importPreviewImageName}
					class="max-h-[65vh] max-w-full rounded object-contain"
				/>
			</div>
		</div>
	</div>
{/if}
