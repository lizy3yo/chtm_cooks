<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { catalogAPI, type CatalogItem } from '$lib/api/catalog';
	import { subscribeToInventoryChanges, type InventoryRealtimeEvent } from '$lib/api/inventory';
	import { subscribeToCartUpdates } from '$lib/api/cartStream';
	import { borrowRequestsAPI } from '$lib/api/borrowRequests';
	import { donationsAPI } from '$lib/api/donations';
	import { requestCartStore, requestCartItems } from '$lib/stores/requestCart';
	import { toastStore } from '$lib/stores/toast';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	import SelectedItemsSkeletonLoader from '$lib/components/ui/SelectedItemsSkeletonLoader.svelte';
	import { browser } from '$app/environment';

	interface RequestItemOption {
		id: string;
		name: string;
		code: string;
		image: string;
		picture?: string;
		category: string;
		available: number;
		specification: string;
		status: string;
		location?: string;
		isConstant?: boolean;
		maxQuantityPerRequest?: number;
	}

	interface SelectedRequestItem extends RequestItemOption {
		requestedQuantity: number;
	}

	// Loading state
	let isLoading = $state(true);
	let isSubmitting = $state(false);
	let availableEquipment = $state<RequestItemOption[]>([]);
	let constantItems = $state<RequestItemOption[]>([]);
	let showItemSelector = $state(false);
	let sseConnected = $state(false);
	let sseReconnecting = $state(false);
	let cartEventListener: ((event: Event) => void) | null = null;
	let cartSSEUnsubscribe: (() => void) | null = null;
	let donationSSEUnsubscribe: (() => void) | null = null;
	
	// Search and filter state
	let searchQuery = $state('');
	let selectedCategoryFilter = $state<string>('all');
	let sortBy = $state<'name' | 'category' | 'availability'>('name');

	// Click outside handler to close dropdown
	function handleClickOutside(event: MouseEvent) {
		if (showItemSelector) {
			const target = event.target as HTMLElement;
			// Check if click is outside the dropdown
			if (!target.closest('.search-dropdown-container')) {
				showItemSelector = false;
			}
		}
	}

	// Keyboard handler for Escape key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showItemSelector) {
			showItemSelector = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('keydown', handleKeydown);
		};
	});
	
	// Event deduplication and debouncing
	let updateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let lastNotificationTime = $state<number>(0);
	const UPDATE_DEBOUNCE_MS = 1000; // 1 second debounce
	const NOTIFICATION_COOLDOWN_MS = 2000; // 2 seconds between notifications

	// Form fields
	let selectedItems = $state<SelectedRequestItem[]>([]);
	let purpose = $state('lab-exercise');
	let purposeDetails = $state('');
	let borrowDate = $state('');
	let borrowTime = $state('08:00');
	let returnTime = $state('17:00');
	let notes = $state('');
	let acknowledgeTerms = $state(false);

	// Auto-update return time to ensure it's after borrow time
	$effect(() => {
		if (borrowDate && borrowTime && returnTime) {
			const [borrowHour, borrowMinute] = borrowTime.split(':').map(Number);
			const [returnHour, returnMinute] = returnTime.split(':').map(Number);
			
			const borrowMinutes = borrowHour * 60 + borrowMinute;
			const returnMinutes = returnHour * 60 + returnMinute;
			
			// If return time is not at least 1 hour after borrow time, auto-adjust
			if (returnMinutes <= borrowMinutes + 60) {
				let newHour = borrowHour + 1;
				let newMinute = borrowMinute;
				
				// Handle hour overflow
				if (newHour >= 24) {
					newHour = 23;
					newMinute = 59;
				}
				
				returnTime = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
			}
		}
	});

	// Reactive effect: Sync selected items when cart items change
	$effect(() => {
		// Watch for changes in cart items
		const cartItems = $requestCartItems;
		
		// Only sync if we have equipment loaded and not currently loading
		if ((availableEquipment.length > 0 || constantItems.length > 0) && !isLoading) {
			console.log('[REACTIVE] Cart items changed, syncing selected items...', cartItems.length);
			syncSelectedItemsFromCart();
		}
	});

	// Validation
	let errors = $state<Record<string, string>>({});

	const purposeOptions = [
		{ value: 'lab-exercise', label: 'Lab Exercise' },
		{ value: 'project', label: 'Project' },
		{ value: 'demonstration', label: 'Demonstration' },
		{ value: 'other', label: 'Other' }
	];

	// Get today's date in YYYY-MM-DD format
	function formatDateForInput(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');

		return `${year}-${month}-${day}`;
	}

	function addDaysToDateInput(dateValue: string, days: number): string {
		const [year, month, day] = dateValue.split('-').map(Number);
		const nextDate = new Date(year, month - 1, day);
		nextDate.setDate(nextDate.getDate() + days);

		return formatDateForInput(nextDate);
	}

	const today = formatDateForInput(new Date());
	const maximumBorrowDate = addDaysToDateInput(today, 2);

	function inferItemIcon(itemName: string): string {
		const normalized = itemName.toLowerCase();
		if (normalized.includes('knife')) return '🔪';
		if (normalized.includes('bowl')) return '🥣';
		if (normalized.includes('scale')) return '⚖️';
		if (normalized.includes('mixer')) return '🎛️';
		if (normalized.includes('processor')) return '🔧';
		return '📦';
	}

	// Get unique categories from available equipment
	const categories = $derived(() => {
		const allItems = [...availableEquipment, ...constantItems];
		const categorySet = new Set(allItems.map(item => item.category));
		return Array.from(categorySet).sort();
	});

	// Filter and sort equipment based on search and filters
	const filteredEquipment = $derived(() => {
		let items = [...availableEquipment];
		
		// Apply search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			items = items.filter(item => 
				item.name.toLowerCase().includes(query) ||
				item.category.toLowerCase().includes(query) ||
				item.specification.toLowerCase().includes(query)
			);

			// Also subscribe to donations stream to catch donation events that affect inventory
			donationSSEUnsubscribe = donationsAPI.subscribeToChanges(() => {
				console.log('[SSE] Donation change detected (donations stream) - triggering inventory update');
				void handleInventoryUpdate({
					action: 'item_updated',
					entityType: 'item',
					entityId: '',
					entityName: 'donation_event',
					occurredAt: new Date().toISOString()
				});
			});
		}
		
		// Apply category filter
		if (selectedCategoryFilter !== 'all') {
			items = items.filter(item => item.category === selectedCategoryFilter);
		}
		
		// Apply sorting
		items.sort((a, b) => {
			switch (sortBy) {
				case 'name':
					return a.name.localeCompare(b.name);
				case 'category':
					return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
				case 'availability':
					return b.available - a.available;
				default:
					return 0;
			}
		});
		
		return items;
	});

	function formatTimeTo12Hour(time24: string): string {
		if (!time24) return '—';
		const [hours, minutes] = time24.split(':').map(Number);
		const period = hours >= 12 ? 'PM' : 'AM';
		const hours12 = hours % 12 || 12;
		return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
	}

	function buildItemCode(item: CatalogItem): string {
		return item.id.slice(-6).toUpperCase();
	}

	async function loadAvailableEquipment(options?: { forceRefresh?: boolean }): Promise<void> {
		try {
			const response = await catalogAPI.getCatalog({
				availability: 'all',
				sortBy: 'name',
				page: 1,
				limit: 300
			}, {
				forceRefresh: options?.forceRefresh ?? false
			});

			// Separate constant items from regular items
			const allItems = response.items.map((item) => ({
				id: item.id,
				name: item.name,
				code: buildItemCode(item),
				image: inferItemIcon(item.name),
				picture: item.picture,
				category: item.category || 'Uncategorized',
				available: item.quantity,
				specification: item.specification || 'No specification provided',
				status: item.status,
				location: (item as any).location,
				isConstant: item.isConstant || false,
				maxQuantityPerRequest: item.maxQuantityPerRequest
			}));

			// Filter constant items (always show, even if quantity is 0)
			constantItems = allItems.filter((item) => item.isConstant === true);

			// Filter available equipment (quantity > 0, excluding constant items to avoid duplication)
			availableEquipment = allItems.filter((item) => item.available > 0 && !item.isConstant);
		} catch (error) {
			console.error('Failed to load requestable equipment', error);
			toastStore.error('Unable to load available equipment right now', 'Load Error');
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Show notification with cooldown to prevent spam
	 * Industry-standard notification throttling
	 */
	function showUpdateNotification(message: string) {
		const now = Date.now();
		
		// Check if we're within cooldown period
		if (now - lastNotificationTime < NOTIFICATION_COOLDOWN_MS) {
			return; // Skip notification during cooldown
		}
		
		// Update last notification time
		lastNotificationTime = now;
		
		// Show notification
		toastStore.info(message, 'Inventory Updated');
	}

	/**
	 * Handle inventory update with debouncing and deduplication
	 * Industry-standard approach to prevent duplicate notifications
	 */
	async function handleInventoryUpdate(event: InventoryRealtimeEvent) {
		console.log('[UPDATE] ===== PROCESSING UPDATE =====');
		console.log('[UPDATE] Event:', JSON.stringify(event, null, 2));
		
		// Debounce: Clear existing timer and set new one
		if (updateDebounceTimer) {
			console.log('[UPDATE] ⏱️ Clearing existing debounce timer');
			clearTimeout(updateDebounceTimer);
		}

		console.log('[UPDATE] ⏱️ Setting debounce timer for', UPDATE_DEBOUNCE_MS, 'ms');
		updateDebounceTimer = setTimeout(async () => {
			console.log('[UPDATE] 🔄 Debounce timer fired, processing update...');

			// Ensure SSE-triggered refresh bypasses short-lived browser cache.
			catalogAPI.invalidateCatalogCache();
			
			// Store current selected items before reload
			const currentSelectedIds = selectedItems.map(item => item.id);
			const currentQuantities = new Map(
				selectedItems.map(item => [item.id, item.requestedQuantity])
			);
			console.log('[UPDATE] 📋 Current selected IDs:', currentSelectedIds);
			
			// Store previous constant item IDs for comparison
			const previousConstantIds = new Set(constantItems.map(item => item.id));
			console.log('[UPDATE] 📌 Previous constant IDs:', Array.from(previousConstantIds));
			
			// Reload equipment data (this updates constantItems and availableEquipment)
			console.log('[UPDATE] 🔃 Reloading equipment data...');
			await loadAvailableEquipment({ forceRefresh: true });
			console.log('[UPDATE] ✅ Equipment data reloaded');
			
			// Get new constant item IDs
			const newConstantIds = new Set(constantItems.map(item => item.id));
			console.log('[UPDATE] 📌 New constant IDs:', Array.from(newConstantIds));
			
			// Identify items that were removed from constant status
			const removedConstantIds = new Set(
				[...previousConstantIds].filter(id => !newConstantIds.has(id))
			);
			console.log('[UPDATE] ➖ Removed constant IDs:', Array.from(removedConstantIds));
			
			// Identify items that were added to constant status
			const addedConstantIds = new Set(
				[...newConstantIds].filter(id => !previousConstantIds.has(id))
			);
			console.log('[UPDATE] ➕ Added constant IDs:', Array.from(addedConstantIds));
			
			// Re-sync cart with new data
			console.log('[UPDATE] 🛒 Clearing cart...');
			requestCartStore.clear();
			
			// Re-add all current constant items
			console.log('[UPDATE] 🛒 Re-adding', constantItems.length, 'constant items...');
			for (const item of constantItems) {
				requestCartStore.addItem({
					itemId: item.id,
					name: item.name,
					maxQuantity: Math.max(1, item.available)
				});
				console.log('[UPDATE]   ✓ Added constant item:', item.name, '(ID:', item.id, ')');
			}
			
			// Re-add previously selected non-constant items (excluding removed constant items)
			const allItems = [...availableEquipment, ...constantItems];
			console.log('[UPDATE] 🛒 Re-adding previously selected non-constant items...');
			console.log('[UPDATE] 🛒 All items count:', allItems.length, '(available:', availableEquipment.length, ', constant:', constantItems.length, ')');
			
			for (const itemId of currentSelectedIds) {
				// Skip if this item was removed from constant status
				if (removedConstantIds.has(itemId)) {
					console.log('[UPDATE]   ⊘ Skipping removed constant item:', itemId);
					continue;
				}
				
				const item = allItems.find(i => i.id === itemId);
				
				// Only re-add if item exists and is not already added as constant
				if (item && !item.isConstant) {
					const previousQty = currentQuantities.get(itemId) || 1;
					requestCartStore.addItem({
						itemId: item.id,
						name: item.name,
						maxQuantity: item.available
					});
					// Restore previous quantity if still valid
					if (previousQty <= item.available) {
						requestCartStore.setQuantity(itemId, previousQty);
					}
					console.log('[UPDATE]   ✓ Re-added non-constant item:', item.name, '(ID:', itemId, ', isConstant:', item.isConstant, ')');
				} else if (item && item.isConstant) {
					console.log('[UPDATE]   ⊘ Skipping (already added as constant):', item.name, '(ID:', itemId, ')');
				} else {
					console.log('[UPDATE]   ⊘ Item not found in allItems:', itemId);
				}
			}
			
			// Sync selected items
			console.log('[UPDATE] 🔄 Syncing selected items from cart...');
			syncSelectedItemsFromCart();
			console.log('[UPDATE] ✅ Cart synced, selected items count:', selectedItems.length);
			
			// Show single, appropriate notification with cooldown
			if (addedConstantIds.size > 0 && removedConstantIds.size > 0) {
				showUpdateNotification('Frequently requested items updated');
			} else if (addedConstantIds.size > 0) {
				showUpdateNotification('New frequently requested items added');
			} else if (removedConstantIds.size > 0) {
				showUpdateNotification('Frequently requested items removed');
			} else {
				showUpdateNotification('Equipment availability updated');
			}
			
			// Reset debounce timer
			updateDebounceTimer = null;
			console.log('[UPDATE] ===== UPDATE COMPLETE =====');
		}, UPDATE_DEBOUNCE_MS);
	}

	function addItemToCart(item: RequestItemOption) {
		requestCartStore.addItem({
			itemId: item.id,
			name: item.name,
			maxQuantity: item.available
		});

		syncSelectedItemsFromCart();
		errors.items = '';
		
		// Optional: Show success feedback
		toastStore.success(`"${item.name}" added to your request`, 'Item Added');
	}

	function removeItemFromCart(itemId: string) {
		requestCartStore.removeItem(itemId);
		selectedItems = selectedItems.filter((i) => i.id !== itemId);
	}

	function updateItemQuantity(itemId: string, value: string): void {
		const parsed = Number.parseInt(value, 10);
		selectedItems = selectedItems.map((item) => {
			if (item.id !== itemId) {
				return item;
			}

			if (!Number.isFinite(parsed)) {
				return { ...item, requestedQuantity: 1 };
			}

			// Determine the effective maximum: either maxQuantityPerRequest or available quantity
			const effectiveMax = item.maxQuantityPerRequest 
				? Math.min(item.maxQuantityPerRequest, item.available)
				: item.available;

			const newQuantity = Math.max(1, Math.min(effectiveMax, parsed));
			
			// Show feedback if user tried to exceed limit
			if (parsed > effectiveMax) {
				if (item.maxQuantityPerRequest && item.maxQuantityPerRequest < item.available) {
					toastStore.info(
						`Maximum ${item.maxQuantityPerRequest} ${item.maxQuantityPerRequest === 1 ? 'unit' : 'units'} of "${item.name}" allowed per request`,
						'Request Limit'
					);
				} else {
					toastStore.info(
						`Only ${item.available} ${item.available === 1 ? 'unit' : 'units'} of "${item.name}" available`,
						'Stock Limit'
					);
				}
			}

			return {
				...item,
				requestedQuantity: newQuantity
			};
		});

		const updatedItem = selectedItems.find((item) => item.id === itemId);
		if (updatedItem) {
			requestCartStore.setQuantity(itemId, updatedItem.requestedQuantity);
		}
	}

	function syncSelectedItemsFromCart(): void {
		const cartEntries = get(requestCartItems);
		
		// Combine both available equipment and constant items for lookup
		const allEquipment = [...availableEquipment, ...constantItems];
		const equipmentById = new Map(allEquipment.map((item) => [item.id, item]));
		
		if (cartEntries.length === 0) {
			selectedItems = [];
			return;
		}
		
		selectedItems = cartEntries
			.map((entry) => {
				const equipment = equipmentById.get(entry.itemId);
				if (!equipment) {
					return null;
				}

				return {
					...equipment,
					requestedQuantity: Math.max(1, Math.min(equipment.available, entry.quantity))
				};
			})
			.filter((item): item is SelectedRequestItem => item !== null);

		const missingItemIds = cartEntries
			.filter((entry) => !equipmentById.has(entry.itemId))
			.map((entry) => entry.itemId);

		for (const missingId of missingItemIds) {
			requestCartStore.removeItem(missingId);
		}

		if (missingItemIds.length > 0) {
			toastStore.warning(
				'Some items in your request list are no longer available and were removed.',
				'Inventory Updated'
			);
		}
	}

	function buildPurposeText(): string {
		const purposeLabel = purposeOptions.find((option) => option.value === purpose)?.label || 'Request';
		const detail = purposeDetails.trim();
		const noteText = notes.trim();
		let composed = `${purposeLabel}: ${detail}`;

		if (noteText) {
			composed = `${composed} | Notes: ${noteText}`;
		}

		return composed;
	}

	function validateForm() {
		errors = {};

		if (selectedItems.length === 0) {
			errors.items = 'Please select at least one item';
		}

		// Check for out-of-stock items
		const outOfStockItems = selectedItems.filter(item => item.available === 0);
		if (outOfStockItems.length > 0) {
			const itemNames = outOfStockItems.map(i => i.name).join(', ');
			errors.items = `The following items are out of stock and must be removed: ${itemNames}`;
		}

		// Validate quantities including maxQuantityPerRequest limits
		if (
			selectedItems.some(
				(item) => {
					if (item.available === 0) return false; // Already checked above
					
					const effectiveMax = item.maxQuantityPerRequest 
						? Math.min(item.maxQuantityPerRequest, item.available)
						: item.available;
					
					return (
						!Number.isInteger(item.requestedQuantity) ||
						item.requestedQuantity <= 0 ||
						item.requestedQuantity > effectiveMax
					);
				}
			)
		) {
			errors.items = 'Each selected item must have a valid quantity within available stock and request limits';
		}

		if (!borrowDate) {
			errors.borrowDate = 'Borrow date is required';
		} else if (borrowDate < today) {
			errors.borrowDate = 'Borrow date cannot be in the past';
		} else if (borrowDate > maximumBorrowDate) {
			errors.borrowDate = 'Borrow date must be within the next 2 days';
		}

		if (!borrowTime) {
			errors.borrowTime = 'Borrow time is required';
		}

		if (!returnTime) {
			errors.returnTime = 'Return time is required';
		}

		// Validate that return time is after borrow time (same day)
		if (borrowDate && borrowTime && returnTime) {
			const [borrowHour, borrowMinute] = borrowTime.split(':').map(Number);
			const [returnHour, returnMinute] = returnTime.split(':').map(Number);
			
			const borrowMinutes = borrowHour * 60 + borrowMinute;
			const returnMinutes = returnHour * 60 + returnMinute;
			
			if (returnMinutes <= borrowMinutes) {
				errors.returnTime = 'Return time must be after borrow time';
			} else if (returnMinutes - borrowMinutes < 60) {
				errors.returnTime = 'Minimum borrow duration is 1 hour';
			}
		}

		if (!purposeDetails.trim()) {
			errors.purposeDetails = 'Please provide purpose details';
		}

		const composedPurpose = buildPurposeText();
		if (composedPurpose.length > 300) {
			errors.purposeDetails = 'Purpose and notes combined must be 300 characters or less';
		}

		if (!acknowledgeTerms) {
			errors.terms = 'You must acknowledge the terms and conditions';
		}

		return Object.keys(errors).length === 0;
	}

	async function handleSubmit() {
		if (!validateForm()) {
			toastStore.error('Please fix the errors in the form', 'Validation Error');
			return;
		}

		isSubmitting = true;
		try {
			await borrowRequestsAPI.create({
				items: selectedItems.map((item) => ({
					itemId: item.id,
					quantity: item.requestedQuantity
				})),
				purpose: buildPurposeText(),
				borrowDate: `${borrowDate}T${borrowTime}`,
				returnDate: `${borrowDate}T${returnTime}`
			});

			requestCartStore.clear();

			toastStore.success('Your request has been submitted successfully', 'Request Submitted');
			await goto('/student/requests?new=1');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to submit request';
			toastStore.error(message, 'Submission Error');
		} finally {
			isSubmitting = false;
		}
	}

	function resetForm() {
		selectedItems = [];
		purpose = 'lab-exercise';
		purposeDetails = '';
		borrowDate = '';
		borrowTime = '08:00';
		returnTime = '17:00';
		notes = '';
		acknowledgeTerms = false;
		errors = {};
		requestCartStore.clear();
	}

	onMount(() => {
		console.log('[MOUNT] Component mounted, loading equipment...');

		let unsubscribe: () => void = () => {};

		void (async () => {
			// Check for cached catalog data first (same as student catalog)
			const cached = catalogAPI.peekCachedCatalog({
				availability: 'all',
				sortBy: 'name',
				page: 1,
				limit: 300
			});

			if (cached) {
				console.log('[MOUNT] Using cached catalog data');
				// Process cached data immediately
				const allItems = cached.items.map((item) => ({
					id: item.id,
					name: item.name,
					code: buildItemCode(item),
					image: inferItemIcon(item.name),
					picture: item.picture,
					category: item.category || 'Uncategorized',
					available: item.quantity,
					specification: item.specification || 'No specification provided',
					status: item.status,
					location: (item as any).location,
					isConstant: item.isConstant || false,
					maxQuantityPerRequest: item.maxQuantityPerRequest
				}));

				constantItems = allItems.filter((item) => item.isConstant === true);
				availableEquipment = allItems.filter((item) => item.available > 0 && !item.isConstant);

				// Auto-add constant items to cart
				if (constantItems.length > 0) {
					for (const item of constantItems) {
						const cartItems = get(requestCartItems);
						const alreadyInCart = cartItems.some(cartItem => cartItem.itemId === item.id);

						if (!alreadyInCart) {
							requestCartStore.addItem({
								itemId: item.id,
								name: item.name,
								maxQuantity: Math.max(1, item.available)
							});
						}
					}
				}
				
				// Sync cart items BEFORE setting loading to false
				const cartItems = get(requestCartItems);
				if (cartItems.length > 0) {
					syncSelectedItemsFromCart();
				}
				
				// Set loading to false AFTER syncing (prevents empty state flash)
				isLoading = false;

				// Revalidate in background (same as catalog)
				loadAvailableEquipment({ forceRefresh: true });
			} else {
				// No cache, load normally
				console.log('[MOUNT] No cached data, loading from API...');
				await loadAvailableEquipment();

				console.log('[MOUNT] Equipment loaded, constant items:', constantItems.length);

				// Auto-add constant items to cart
				if (constantItems.length > 0) {
					for (const item of constantItems) {
						const cartItems = get(requestCartItems);
						const alreadyInCart = cartItems.some(cartItem => cartItem.itemId === item.id);

						if (!alreadyInCart) {
							requestCartStore.addItem({
								itemId: item.id,
								name: item.name,
								maxQuantity: Math.max(1, item.available)
							});
						}
					}

					syncSelectedItemsFromCart();
				} else {
					const cartItems = get(requestCartItems);
					if (cartItems.length > 0) {
						syncSelectedItemsFromCart();
					}
				}
			}

			// Handle preselected item from URL
			const itemId = get(page).url.searchParams.get('itemId');
			if (itemId) {
				// Check both available equipment and constant items
				const allItems = [...availableEquipment, ...constantItems];
				const preselectedItem = allItems.find((item) => item.id === itemId);
				if (preselectedItem) {
					requestCartStore.addItem({
						itemId: preselectedItem.id,
						name: preselectedItem.name,
						maxQuantity: preselectedItem.available
					});
					syncSelectedItemsFromCart();
				}
			}

			console.log('[MOUNT] Setting up cart synchronization...');

			// Listen for cart updates via custom events (same-page sync)
			cartEventListener = (event: Event) => {
				const customEvent = event as CustomEvent;
				console.log('[CART-SYNC] Cart updated:', customEvent.detail);
				
				// Sync selected items when cart changes
				syncSelectedItemsFromCart();
			};

			window.addEventListener('cart-updated', cartEventListener);

			// Also subscribe to cart updates via SSE for cross-tab/device sync
			cartSSEUnsubscribe = subscribeToCartUpdates(
				(event) => {
					console.log('[CART-SSE] Cart updated from another tab/device:', event);
					// Sync selected items when cart changes
					syncSelectedItemsFromCart();
				},
				(error) => {
					console.error('[CART-SSE] Error:', error);
				}
			);

			// Subscribe to real-time inventory updates via SSE
			unsubscribe = subscribeToInventoryChanges(
				(event) => {
					console.log('[SSE] ===== EVENT RECEIVED =====');
					console.log('[SSE] Action:', event.action);
					console.log('[SSE] Entity Type:', event.entityType);
					console.log('[SSE] Entity ID:', event.entityId);
					console.log('[SSE] Entity Name:', event.entityName);
					console.log('[SSE] Occurred At:', event.occurredAt);
					console.log('[SSE] Full Event:', JSON.stringify(event, null, 2));
					console.log('[SSE] ============================');

					// Handle ALL inventory item events (created, updated, archived, restored, deleted)
					// This includes when items are marked/unmarked as constant
					const supportedActions = new Set([
						'item_created',
						'item_updated',
						'item_archived',
						'item_restored',
						'item_deleted'
					]);

					if (event.entityType === 'item' && supportedActions.has(event.action)) {
						console.log('[SSE] ✅ Item event detected, processing update...');
						void handleInventoryUpdate(event);
					} else {
						console.log('[SSE] ⊘ Non-item event, ignoring');
					}
				},
				{
					onConnect: () => {
						console.log('[SSE] ✅ Connected successfully to inventory stream');
						sseConnected = true;
						sseReconnecting = false;
					},
					onDisconnect: () => {
						console.log('[SSE] ❌ Disconnected from inventory stream');
						sseConnected = false;
					},
					onError: (error) => {
						console.error('[SSE] ⚠️ Connection error:', error);
						sseConnected = false;
						sseReconnecting = true;
					}
				}
			);

			console.log('[MOUNT] SSE subscriptions set up complete');
		})();

		return () => {
			console.log('[MOUNT] Component unmounting, cleaning up...');
			// Cleanup: Clear any pending debounce timers
			if (updateDebounceTimer) {
				clearTimeout(updateDebounceTimer);
			}
			// Cleanup event listeners
			if (cartEventListener) {
				window.removeEventListener('cart-updated', cartEventListener);
				cartEventListener = null;
			}
			// Cleanup SSE subscriptions
			unsubscribe();
			if (cartSSEUnsubscribe) {
				cartSSEUnsubscribe();
				cartSSEUnsubscribe = null;
			}
			if (donationSSEUnsubscribe) {
				donationSSEUnsubscribe();
				donationSSEUnsubscribe = null;
			}
		};
	});

	// Cleanup on component destroy
	onDestroy(() => {
		if (cartEventListener) {
			window.removeEventListener('cart-updated', cartEventListener);
			cartEventListener = null;
		}
		if (cartSSEUnsubscribe) {
			cartSSEUnsubscribe();
			cartSSEUnsubscribe = null;
		}
		if (donationSSEUnsubscribe) {
			donationSSEUnsubscribe();
			donationSSEUnsubscribe = null;
		}
	});
</script>

<svelte:head>
	<title>Request Equipment - Student Portal</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Request Equipment</h1>
			<p class="mt-1 text-sm text-gray-500">Search, select, and submit your equipment borrow request</p>
		</div>
		<div class="flex items-center gap-3">
			<a 
				href="/student/catalog" 
				class="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
				</svg>
				View Catalog
			</a>
		</div>
	</div>
	
	<!-- Request Form -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<!-- Main Form -->
		<div class="lg:col-span-2 space-y-4">
			<!-- Selected Items -->
			<div class="rounded-lg bg-white p-4 shadow sm:p-6">
				<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 class="text-base font-semibold text-gray-900 sm:text-lg">Selected Items</h2>
						<p class="mt-0.5 text-xs text-gray-500">
							{selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'} selected
						</p>
					</div>
					
					<!-- Search Button -->
					<div class="relative search-dropdown-container w-full sm:w-auto">
						<button
							onclick={() => {
								showItemSelector = !showItemSelector;
								if (showItemSelector) {
									searchQuery = '';
									selectedCategoryFilter = 'all';
									sortBy = 'name';
									// Focus search input after a brief delay
									setTimeout(() => {
										document.getElementById('equipment-search')?.focus();
									}, 100);
								}
							}}
							class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 sm:w-auto"
						>
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
							</svg>
							Search Equipment
						</button>
						
						<!-- Search Dropdown -->
						{#if showItemSelector}
							<div class="absolute left-0 right-0 top-full z-50 mt-2 w-full animate-slide-in sm:left-auto sm:right-0 sm:w-150 sm:max-w-[calc(100vw-2rem)]">
								<div class="rounded-xl border border-gray-200 bg-white shadow-2xl">
									<!-- Search Input -->
									<div class="border-b border-gray-200 p-4">
										<div class="relative">
											<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
												<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
												</svg>
											</div>
											<input
												id="equipment-search"
												type="text"
												bind:value={searchQuery}
												placeholder="Search equipment by name, category, or specification..."
												class="block w-full rounded-lg border-2 border-gray-200 bg-white py-3 pl-11 pr-12 text-sm placeholder-gray-400 transition-all focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10"
											/>
											{#if searchQuery}
												<button
													type="button"
													aria-label="Clear search"
													onclick={() => searchQuery = ''}
													class="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-600"
												>
													<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
													</svg>
												</button>
											{/if}
										</div>
										
										<!-- Filters Row -->
										<div class="mt-3 flex flex-wrap items-center gap-2">
											<select
												bind:value={selectedCategoryFilter}
												class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-all hover:border-gray-400 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
											>
												<option value="all">All Categories</option>
												{#each categories() as category}
													<option value={category}>{category}</option>
												{/each}
											</select>
											
											<select
												bind:value={sortBy}
												class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-all hover:border-gray-400 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
											>
												<option value="name">Name (A-Z)</option>
												<option value="category">Category</option>
												<option value="availability">Availability</option>
											</select>
											
											<span class="ml-auto text-xs text-gray-500">
												{filteredEquipment().length} {filteredEquipment().length === 1 ? 'result' : 'results'}
											</span>
										</div>
									</div>
									
									<!-- Results List -->
									<div class="max-h-100 overflow-y-auto">
										{#if isLoading}
											<div class="flex items-center justify-center py-8">
												<div class="text-center">
													<div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-pink-600 border-r-transparent"></div>
													<p class="mt-2 text-sm text-gray-500">Loading equipment…</p>
												</div>
											</div>
										{:else if filteredEquipment().length === 0}
											<div class="py-8 text-center">
												<svg class="mx-auto h-12 w-12 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
												</svg>
												<p class="mt-2 text-sm font-medium text-gray-900">No equipment found</p>
												<p class="text-xs text-gray-500">Try adjusting your search or filters</p>
											</div>
										{:else}
											<div class="divide-y divide-gray-100">
												{#each filteredEquipment() as item}
													{@const isSelected = selectedItems.find((i) => i.id === item.id) !== undefined}
													<button
														onclick={() => addItemToCart(item)}
														disabled={isSelected}
														class="group flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
													>
														<!-- Item Image -->
														{#if item.picture}
															<img 
																src={item.picture} 
																alt={item.name} 
																class="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-gray-200" 
																loading="lazy" 
															/>
														{:else}
															<div class="h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-gray-200">
																<ItemImagePlaceholder size="sm" />
															</div>
														{/if}
														
														<!-- Item Details -->
														<div class="min-w-0 flex-1">
															<div class="flex items-center gap-2">
																<p class="truncate text-sm font-semibold text-gray-900 group-hover:text-pink-600">
																	{item.name}
																</p>
																{#if isSelected}
																	<span class="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
																		<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
																			<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
																		</svg>
																		Added
																	</span>
																{/if}
															</div>
															<p class="text-xs text-gray-500 mt-0.5">{item.category}</p>
															<div class="mt-1.5 flex items-center gap-2">
																<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold {item.available > 5 ? 'bg-emerald-100 text-emerald-700' : item.available > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}">
																	{item.available} available
																</span>
																{#if item.maxQuantityPerRequest}
																	<span class="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
																		Max {item.maxQuantityPerRequest}
																	</span>
																{/if}
															</div>
														</div>
														
														<!-- Add Icon -->
														{#if !isSelected}
															<div class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
																<div class="flex h-8 w-8 items-center justify-center rounded-full bg-pink-600 text-white">
																	<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
																	</svg>
																</div>
															</div>
														{/if}
													</button>
												{/each}
											</div>
										{/if}
									</div>
									
									<!-- Footer -->
									<div class="border-t border-gray-200 bg-gray-50 px-4 py-3">
										<div class="flex items-center justify-between text-xs text-gray-500">
											<span>Click an item to add it to your request</span>
											<button
												onclick={() => showItemSelector = false}
												class="font-medium text-pink-600 hover:text-pink-700"
											>
												Close
											</button>
										</div>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>

				{#if errors.items}
					<div class="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{errors.items}</div>
				{/if}

				{#if isLoading}
					<!-- Skeleton Loader -->
					<SelectedItemsSkeletonLoader count={3} />
				{:else if selectedItems.length > 0}
					<div class="space-y-2">
						{#each selectedItems as item}
							<div class="group rounded-lg border {item.available === 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'} p-2.5 transition-all hover:shadow-md">
								<div class="flex items-start gap-2.5">
									{#if item.picture}
										<img src={item.picture} alt={item.name} class="h-14 w-14 shrink-0 rounded-md object-cover ring-1 ring-gray-100 {item.available === 0 ? 'opacity-50' : ''}" loading="lazy" />
									{:else}
										<div class="h-14 w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-gray-100 {item.available === 0 ? 'opacity-50' : ''}">
											<ItemImagePlaceholder size="sm" />
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<div class="flex items-start justify-between gap-2">
											<div class="flex-1">
												<div class="flex items-center gap-1.5 flex-wrap">
													<h3 class="text-xs font-semibold {item.available === 0 ? 'text-gray-500' : 'text-gray-900'}">{item.name}</h3>
													{#if item.isConstant}
														<span class="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-linear-to-r from-emerald-100 to-teal-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-emerald-200">
															<svg class="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
																<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
															</svg>
															CONSTANT
														</span>
													{/if}
												</div>
												<div class="mt-0.5 flex items-center gap-1.5 text-[11px]">
													<span class="inline-flex items-center gap-0.5 text-gray-500">
														<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
														</svg>
														{item.category}
													</span>
													<span class="text-gray-300">•</span>
													<span class="inline-flex items-center gap-0.5 {item.available === 0 ? 'text-amber-600 font-medium' : item.available > 5 ? 'text-emerald-600' : 'text-amber-600'}">
														<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
															<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
														</svg>
														{item.available} available
													</span>
												</div>
												{#if item.available === 0}
													<div class="mt-1 flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-1 text-[11px] font-medium text-amber-800">
														<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
															<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
														</svg>
														<span>Out of stock - Remove to continue</span>
													</div>
												{/if}
												{#if item.maxQuantityPerRequest && item.available > 0}
													<div class="mt-1 flex items-center justify-between gap-2">
														<div class="flex items-center gap-1 text-[11px] text-purple-700">
															<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
																<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
															</svg>
															<span class="font-medium">Max {item.maxQuantityPerRequest}</span>
														</div>
														<!-- Progress Bar -->
														<div class="flex items-center gap-1.5">
															<div class="h-1 w-16 rounded-full bg-gray-200 overflow-hidden">
																<div 
																	class="h-full rounded-full transition-all duration-300 {item.requestedQuantity >= item.maxQuantityPerRequest ? 'bg-linear-to-r from-purple-500 to-purple-600' : 'bg-linear-to-r from-emerald-500 to-teal-500'}"
																	style="width: {Math.min(100, (item.requestedQuantity / item.maxQuantityPerRequest) * 100)}%"
																></div>
															</div>
															<span class="text-[10px] font-bold {item.requestedQuantity >= item.maxQuantityPerRequest ? 'text-purple-700' : 'text-gray-600'}">
																{item.requestedQuantity}/{item.maxQuantityPerRequest}
															</span>
														</div>
													</div>
												{/if}
											</div>
										</div>
										
										<!-- Quantity Controls -->
										<div class="mt-2 flex items-center justify-between">
											{#if item.available > 0}
												<div class="flex items-center gap-1">
													<!-- Decrement -->
													<button
														type="button"
														onclick={() => {
															const newQty = Math.max(1, item.requestedQuantity - 1);
															updateItemQuantity(item.id, String(newQty));
														}}
														disabled={item.requestedQuantity <= 1}
														class="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-all hover:border-pink-500 hover:bg-pink-50 hover:text-pink-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:bg-white disabled:hover:text-gray-700"
														title="Decrease quantity"
													>
														<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4"/>
														</svg>
													</button>
													
													<!-- Quantity Display -->
													<div class="relative">
														<input
															type="number"
															min="1"
															max={item.maxQuantityPerRequest ? Math.min(item.maxQuantityPerRequest, item.available) : item.available}
															value={item.requestedQuantity}
															onchange={(e) => updateItemQuantity(item.id, (e.target as HTMLInputElement).value)}
															class="w-14 rounded-md border {item.isConstant ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-gray-300 bg-white text-gray-900'} px-1.5 py-1 text-center text-xs font-bold focus:border-pink-500 focus:ring-1 focus:ring-pink-500/20"
															title={item.maxQuantityPerRequest ? `Maximum ${item.maxQuantityPerRequest} per request` : `Maximum ${item.available} available`}
														/>
													</div>
													
													<!-- Increment -->
													<button
														type="button"
														onclick={() => {
															const maxQty = item.maxQuantityPerRequest ? Math.min(item.maxQuantityPerRequest, item.available) : item.available;
															const newQty = Math.min(maxQty, item.requestedQuantity + 1);
															updateItemQuantity(item.id, String(newQty));
														}}
														disabled={item.requestedQuantity >= (item.maxQuantityPerRequest ? Math.min(item.maxQuantityPerRequest, item.available) : item.available)}
														class="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition-all hover:border-pink-500 hover:bg-pink-50 hover:text-pink-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:bg-white disabled:hover:text-gray-700"
														title="Increase quantity"
													>
														<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
														</svg>
													</button>
												</div>
											{:else}
												<div class="rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-center text-[11px] font-bold text-amber-700">
													Not Available
												</div>
											{/if}
											
											<!-- Remove Button -->
											{#if !item.isConstant}
												<button 
													onclick={() => removeItemFromCart(item.id)} 
													class="flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition-all hover:border-red-300 hover:bg-red-100 hover:text-red-700"
													title="Remove item"
												>
													<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
													</svg>
												</button>
											{:else}
												<div class="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600" title="Constant item (cannot be removed)">
													<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
														<path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
													</svg>
												</div>
											{/if}
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
					{:else}
						<div class="rounded-xl border-2 border-dashed border-gray-300 bg-linear-to-br from-gray-50 to-gray-100 p-8 text-center">
						<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
							<svg class="h-8 w-8 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
							</svg>
						</div>
						<h3 class="mt-4 text-sm font-semibold text-gray-900">No items selected yet</h3>
						<p class="mt-1 text-xs text-gray-500">Click "Browse Equipment" above to add items to your request</p>
					</div>
				{/if}
			</div>

			<!-- Borrow Period -->
			<div class="rounded-lg bg-white p-4 shadow sm:p-6">
				<h2 class="mb-3 text-base font-semibold text-gray-900 sm:text-lg">Borrow Period</h2>
				<p class="mb-4 text-sm text-gray-600">Equipment must be returned on the same day, and requests must be made at least 2 days in advance.</p>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<!-- Borrow Date -->
					<div class="sm:col-span-3">
						<label for="borrowDate" class="block text-sm font-medium text-gray-700 mb-1">
							Borrow Date <span class="text-red-500">*</span>
						</label>
						<input
							type="date"
							id="borrowDate"
							bind:value={borrowDate}
							min={today}
							max={maximumBorrowDate}
							class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500 {errors.borrowDate ? 'border-red-500' : ''}"
						/>
						{#if errors.borrowDate}
							<p class="mt-1 text-xs text-red-600">{errors.borrowDate}</p>
					{:else}
							<p class="mt-1 text-xs text-gray-500">You can request equipment for today up to 2 days ahead only.</p>
						{/if}
					</div>

					<!-- Borrow Time -->
					<div>
						<label for="borrowTime" class="block text-sm font-medium text-gray-700 mb-1">
							Pickup Time <span class="text-red-500">*</span>
						</label>
						<input
							type="time"
							id="borrowTime"
							bind:value={borrowTime}
							class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500 {errors.borrowTime ? 'border-red-500' : ''}"
						/>
						{#if errors.borrowTime}
							<p class="mt-1 text-xs text-red-600">{errors.borrowTime}</p>
						{:else}
							<p class="mt-1 text-xs text-gray-500">When you'll pick up</p>
						{/if}
					</div>

					<!-- Return Time -->
					<div>
						<label for="returnTime" class="block text-sm font-medium text-gray-700 mb-1">
							Return Time <span class="text-red-500">*</span>
						</label>
						<input
							type="time"
							id="returnTime"
							bind:value={returnTime}
							class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500 {errors.returnTime ? 'border-red-500' : ''}"
						/>
						{#if errors.returnTime}
							<p class="mt-1 text-xs text-red-600">{errors.returnTime}</p>
						{:else}
							<p class="mt-1 text-xs text-gray-500">When you'll return</p>
						{/if}
					</div>

					<!-- Duration Display -->
					<div>
						<p class="block text-sm font-medium text-gray-700 mb-1">
							Duration
						</p>
						<div class="flex h-10 items-center rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
							{#if borrowTime && returnTime}
								{(() => {
									const [borrowHour, borrowMinute] = borrowTime.split(':').map(Number);
									const [returnHour, returnMinute] = returnTime.split(':').map(Number);
									const borrowMinutes = borrowHour * 60 + borrowMinute;
									const returnMinutes = returnHour * 60 + returnMinute;
									const diffMinutes = returnMinutes - borrowMinutes;
									const hours = Math.floor(diffMinutes / 60);
									const minutes = diffMinutes % 60;
									if (diffMinutes <= 0) return '—';
									if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
									if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
									return `${minutes} min`;
								})()}
							{:else}
								—
							{/if}
						</div>
						<p class="mt-1 text-xs text-gray-500">Same-day return</p>
					</div>
				</div>
			</div>
			
			<!-- Purpose -->
			<div class="rounded-lg bg-white p-4 shadow sm:p-6">
				<h2 class="mb-3 text-base font-semibold text-gray-900 sm:text-lg">Purpose</h2>
				<div class="space-y-4">
					<div>
						<label for="purpose" class="block text-sm font-medium text-gray-700 mb-1">
							Purpose Type <span class="text-red-500">*</span>
						</label>
						<select
							id="purpose"
							bind:value={purpose}
							class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
						>
							{#each purposeOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="purposeDetails" class="block text-sm font-medium text-gray-700 mb-1">
							Purpose Details <span class="text-red-500">*</span>
						</label>
						<textarea
							id="purposeDetails"
							bind:value={purposeDetails}
							rows="3"
							placeholder="Please provide specific details about how you will use this equipment..."
							class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500 {errors.purposeDetails ? 'border-red-500' : ''}"
						></textarea>
						{#if errors.purposeDetails}
							<p class="mt-1 text-xs text-red-600">{errors.purposeDetails}</p>
						{/if}
					</div>
				</div>
			</div>
			
			<!-- Additional Notes -->
			<div class="rounded-lg bg-white p-4 shadow sm:p-6">
				<h2 class="mb-3 text-base font-semibold text-gray-900 sm:text-lg">Additional Information</h2>
				<div>
					<label for="notes" class="block text-sm font-medium text-gray-700 mb-1">
						Notes <span class="text-gray-400 font-normal">(Optional)</span>
					</label>
					<textarea
						id="notes"
						bind:value={notes}
						rows="3"
						placeholder="Any special instructions for the custodian…"
						class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
					></textarea>
				</div>
			</div>
		</div>

		<!-- Summary Sidebar -->
		<div class="lg:col-span-1">
			<div class="space-y-4 lg:sticky lg:top-20">
				<!-- Request Summary -->
				<div class="rounded-lg bg-white p-4 shadow sm:p-6">
					<h2 class="mb-3 text-base font-semibold text-gray-900 sm:text-lg">Summary</h2>
					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-gray-500">Items</span>
							<span class="font-medium text-gray-900">{selectedItems.length}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-500">Date</span>
							<span class="font-medium text-gray-900">{borrowDate || '—'}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-500">Pickup</span>
							<span class="font-medium text-gray-900">{formatTimeTo12Hour(borrowTime)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-500">Return</span>
							<span class="font-medium text-gray-900">{formatTimeTo12Hour(returnTime)}</span>
						</div>
						<div class="flex justify-between border-t border-gray-200 pt-2">
							<span class="text-gray-500">Duration</span>
							<span class="font-medium text-gray-900">
								{#if borrowTime && returnTime}
									{(() => {
										const [borrowHour, borrowMinute] = borrowTime.split(':').map(Number);
										const [returnHour, returnMinute] = returnTime.split(':').map(Number);
										const borrowMinutes = borrowHour * 60 + borrowMinute;
										const returnMinutes = returnHour * 60 + returnMinute;
										const diffMinutes = returnMinutes - borrowMinutes;
										const hours = Math.floor(diffMinutes / 60);
										const minutes = diffMinutes % 60;
										if (diffMinutes <= 0) return '—';
										if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
										if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
										return `${minutes} min`;
									})()}
								{:else}
									—
								{/if}
							</span>
						</div>
					</div>
				</div>

				<!-- Terms and Conditions -->
				<div class="rounded-lg bg-white p-4 shadow sm:p-6">
					<h2 class="mb-3 text-base font-semibold text-gray-900 sm:text-lg">Terms & Conditions</h2>
					<ul class="space-y-2 text-sm text-gray-600">
						<li class="flex items-start gap-2">
							<svg class="mt-0.5 h-4 w-4 shrink-0 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							I am responsible for any damage
						</li>
						<li class="flex items-start gap-2">
							<svg class="mt-0.5 h-4 w-4 shrink-0 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							I will return equipment on time
						</li>
						<li class="flex items-start gap-2">
							<svg class="mt-0.5 h-4 w-4 shrink-0 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							Late returns may incur penalties
						</li>
						<li class="flex items-start gap-2">
							<svg class="mt-0.5 h-4 w-4 shrink-0 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							Educational use only
						</li>
					</ul>

					<div class="mt-4 border-t border-gray-200 pt-4">
						<label class="flex items-start gap-3 cursor-pointer">
							<input
								type="checkbox"
								bind:checked={acknowledgeTerms}
								class="mt-1 h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
							/>
							<span class="text-sm text-gray-700">
								I acknowledge and agree to the terms and conditions
								<span class="text-red-500">*</span>
							</span>
						</label>
						{#if errors.terms}
							<p class="mt-1 text-xs text-red-600">{errors.terms}</p>
						{/if}
					</div>
				</div>
				
				<!-- Action Buttons -->
				<div class="space-y-3">
					<button
						onclick={handleSubmit}
						disabled={isSubmitting}
						class="w-full inline-flex items-center justify-center rounded-lg bg-pink-600 px-4 py-3 text-sm font-medium text-white hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
						</svg>
						{isSubmitting ? 'Submitting...' : 'Submit Request'}
					</button>
					<button
						onclick={resetForm}
						class="w-full inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500"
					>
						<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
						</svg>
						Reset Form
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
