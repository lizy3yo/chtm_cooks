<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { catalogAPI, type CatalogItem } from '$lib/api/catalog';
	import { borrowRequestsAPI } from '$lib/api/borrowRequests';
	import { requestCartStore, requestCartItems } from '$lib/stores/requestCart';
	import { toastStore } from '$lib/stores/toast';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';

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
	}

	interface SelectedRequestItem extends RequestItemOption {
		requestedQuantity: number;
	}

	let isLoadingEquipment = $state(false);
	let isSubmitting = $state(false);
	let availableEquipment = $state<RequestItemOption[]>([]);
	let showItemSelector = $state(false);

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

	// Validation
	let errors = $state<Record<string, string>>({});

	const purposeOptions = [
		{ value: 'lab-exercise', label: 'Lab Exercise' },
		{ value: 'project', label: 'Project' },
		{ value: 'demonstration', label: 'Demonstration' },
		{ value: 'other', label: 'Other' }
	];

	// Get today's date in YYYY-MM-DD format
	const today = new Date().toISOString().split('T')[0];

	function inferItemIcon(itemName: string): string {
		const normalized = itemName.toLowerCase();
		if (normalized.includes('knife')) return '🔪';
		if (normalized.includes('bowl')) return '🥣';
		if (normalized.includes('scale')) return '⚖️';
		if (normalized.includes('mixer')) return '🎛️';
		if (normalized.includes('processor')) return '🔧';
		return '📦';
	}

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

	async function loadAvailableEquipment(): Promise<void> {
		isLoadingEquipment = true;
		try {
			const response = await catalogAPI.getCatalog({
				availability: 'all',
				sortBy: 'name',
				page: 1,
				limit: 300
			});

			availableEquipment = response.items
				.filter((item) => item.quantity > 0)
				.map((item) => ({
					id: item.id,
					name: item.name,
					code: buildItemCode(item),
					image: inferItemIcon(item.name),
					picture: item.picture,
					category: item.category || 'Uncategorized',
					available: item.quantity,
					specification: item.specification || 'No specification provided',
					status: item.status,
					location: item.location
				}));
		} catch (error) {
			console.error('Failed to load requestable equipment', error);
			toastStore.error('Unable to load available equipment right now', 'Load Error');
		} finally {
			isLoadingEquipment = false;
		}
	}

	function addItemToCart(item: RequestItemOption) {
		requestCartStore.addItem({
			itemId: item.id,
			name: item.name,
			maxQuantity: item.available
		});

		syncSelectedItemsFromCart();
		errors.items = '';
		showItemSelector = false;
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

			return {
				...item,
				requestedQuantity: Math.max(1, Math.min(item.available, parsed))
			};
		});

		const updatedItem = selectedItems.find((item) => item.id === itemId);
		if (updatedItem) {
			requestCartStore.setQuantity(itemId, updatedItem.requestedQuantity);
		}
	}

	function syncSelectedItemsFromCart(): void {
		const cartEntries = get(requestCartItems);
		if (cartEntries.length === 0) {
			selectedItems = [];
			return;
		}

		const equipmentById = new Map(availableEquipment.map((item) => [item.id, item]));
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

		if (
			selectedItems.some(
				(item) =>
					!Number.isInteger(item.requestedQuantity) ||
					item.requestedQuantity <= 0 ||
					item.requestedQuantity > item.available
			)
		) {
			errors.items = 'Each selected item must have a valid quantity within available stock';
		}

		if (!borrowDate) {
			errors.borrowDate = 'Borrow date is required';
		} else if (borrowDate < today) {
			errors.borrowDate = 'Borrow date cannot be in the past';
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

	onMount(async () => {
		await loadAvailableEquipment();
		syncSelectedItemsFromCart();

		const itemId = get(page).url.searchParams.get('itemId');
		if (itemId) {
			const preselectedItem = availableEquipment.find((item) => item.id === itemId);
			if (preselectedItem) {
				requestCartStore.addItem({
					itemId: preselectedItem.id,
					name: preselectedItem.name,
					maxQuantity: preselectedItem.available
				});
				syncSelectedItemsFromCart();
			}
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
			<p class="mt-1 text-sm text-gray-500">Submit a new equipment borrow request</p>
		</div>
		<a href="/student/catalog" class="inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-pink-700 hover:shadow-md">
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
			</svg>
			Browse Catalog
		</a>
	</div>
	
	<!-- Request Form -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<!-- Main Form -->
		<div class="lg:col-span-2 space-y-4">
			<!-- Selected Items -->
			<div class="rounded-lg bg-white p-4 shadow sm:p-6">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-base font-semibold text-gray-900 sm:text-lg">Selected Items</h2>
					<button
						onclick={() => showItemSelector = !showItemSelector}
						class="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-700"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
						</svg>
						Add Item
					</button>
				</div>

				{#if errors.items}
					<div class="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{errors.items}</div>
				{/if}

				{#if showItemSelector}
					<div class="mb-4 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-3">
						<h3 class="mb-2 text-sm font-medium text-gray-900">Select Equipment</h3>
						{#if isLoadingEquipment}
							<p class="text-sm text-gray-500">Loading equipment…</p>
						{:else if availableEquipment.length === 0}
							<p class="text-sm text-gray-500">No available equipment found.</p>
						{:else}
							<div class="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto sm:grid-cols-2">
								{#each availableEquipment as item}
									<button
										onclick={() => addItemToCart(item)}
										disabled={selectedItems.find((i) => i.id === item.id) !== undefined}
										class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2.5 text-left hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
									>
										{#if item.picture}
											<img src={item.picture} alt={item.name} class="h-9 w-9 shrink-0 rounded object-cover" loading="lazy" />
										{:else}
											<div class="h-9 w-9 shrink-0 overflow-hidden rounded">
												<ItemImagePlaceholder size="sm" />
											</div>
										{/if}
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-medium text-gray-900">{item.name}</p>
											<p class="truncate text-xs text-gray-500">{item.category} · {item.available} avail.</p>
										</div>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				{#if selectedItems.length > 0}
					<div class="space-y-2">
						{#each selectedItems as item}
							<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
								<div class="flex items-start gap-3">
									{#if item.picture}
										<img src={item.picture} alt={item.name} class="h-9 w-9 shrink-0 rounded object-cover" loading="lazy" />
									{:else}
										<div class="h-9 w-9 shrink-0 overflow-hidden rounded">
											<ItemImagePlaceholder size="sm" />
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium text-gray-900">{item.name}</p>
										<p class="truncate text-xs text-gray-500">{item.category} · {item.available} available</p>
									</div>
									<div class="flex shrink-0 items-center gap-2">
										<input
											type="number"
											min="1"
											max={item.available}
											value={item.requestedQuantity}
											onchange={(e) => updateItemQuantity(item.id, (e.target as HTMLInputElement).value)}
											class="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm"
										/>
										<button onclick={() => removeItemFromCart(item.id)} class="text-red-500 hover:text-red-700">
											<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
											</svg>
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center">
						<svg class="mx-auto h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
						</svg>
						<p class="mt-2 text-sm text-gray-500">No items selected</p>
						<p class="text-xs text-gray-400">Tap "Add Item" to select equipment</p>
					</div>
				{/if}
			</div>

			<!-- Borrow Period -->
			<div class="rounded-lg bg-white p-4 shadow sm:p-6">
				<h2 class="mb-3 text-base font-semibold text-gray-900 sm:text-lg">Borrow Period</h2>
				<p class="mb-4 text-sm text-gray-600">Equipment must be returned on the same day</p>
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
							class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500 {errors.borrowDate ? 'border-red-500' : ''}"
						/>
						{#if errors.borrowDate}
							<p class="mt-1 text-xs text-red-600">{errors.borrowDate}</p>
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
						<label class="block text-sm font-medium text-gray-700 mb-1">
							Duration
						</label>
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
