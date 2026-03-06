<script lang="ts">
	import { goto } from '$app/navigation';
	import { toastStore } from '$lib/stores/toast';
	
	// Request cart for batch requests
	let requestCart = $state<any[]>([]);
	let showItemSelector = $state(false);
	
	// Form fields
	let selectedItems = $state<any[]>([]);
	let purpose = $state('lab-exercise');
	let purposeDetails = $state('');
	let borrowDate = $state('');
	let returnDate = $state('');
	let selectedInstructor = $state('');
	let notes = $state('');
	let acknowledgeTerms = $state(false);
	
	// Validation
	let errors = $state<Record<string, string>>({});
	
	// Available equipment for selection
	const availableEquipment = [
		{ id: 1, name: 'Chef Knife Set', code: 'CK-001', image: '🔪', category: 'Utensils', available: 5 },
		{ id: 2, name: 'Mixing Bowl Large', code: 'MB-002', image: '🥣', category: 'Cookware', available: 12 },
		{ id: 3, name: 'Digital Scale', code: 'DS-003', image: '⚖️', category: 'Measuring Tools', available: 8 },
		{ id: 4, name: 'Stand Mixer', code: 'SM-004', image: '🎛️', category: 'Appliances', available: 3 },
		{ id: 5, name: 'Baking Sheet Set', code: 'BS-005', image: '🍪', category: 'Bakeware', available: 8 }
	];
	
	const instructors = [
		{ id: 1, name: 'Prof. John Smith' },
		{ id: 2, name: 'Prof. Jane Johnson' },
		{ id: 3, name: 'Prof. Mike Davis' },
		{ id: 4, name: 'Prof. Sarah Wilson' }
	];
	
	const purposeOptions = [
		{ value: 'lab-exercise', label: 'Lab Exercise' },
		{ value: 'project', label: 'Project' },
		{ value: 'demonstration', label: 'Demonstration' },
		{ value: 'other', label: 'Other' }
	];
	
	// Get today's date in YYYY-MM-DD format
	const today = new Date().toISOString().split('T')[0];
	
	// Calculate max return date (7 days from borrow date)
	const maxReturnDate = $derived(() => {
		if (!borrowDate) return '';
		const borrow = new Date(borrowDate);
		borrow.setDate(borrow.getDate() + 7);
		return borrow.toISOString().split('T')[0];
	});
	
	// Calculate min return date (1 day after borrow date)
	const minReturnDate = $derived(() => {
		if (!borrowDate) return '';
		const borrow = new Date(borrowDate);
		borrow.setDate(borrow.getDate() + 1);
		return borrow.toISOString().split('T')[0];
	});
	
	function addItemToCart(item: any) {
		if (!selectedItems.find(i => i.id === item.id)) {
			selectedItems = [...selectedItems, item];
		}
		showItemSelector = false;
	}
	
	function removeItemFromCart(itemId: number) {
		selectedItems = selectedItems.filter(i => i.id !== itemId);
	}
	
	function validateForm() {
		errors = {};
		
		if (selectedItems.length === 0) {
			errors.items = 'Please select at least one item';
		}
		
		if (!borrowDate) {
			errors.borrowDate = 'Borrow date is required';
		} else if (borrowDate < today) {
			errors.borrowDate = 'Borrow date cannot be in the past';
		}
		
		if (!returnDate) {
			errors.returnDate = 'Return date is required';
		} else if (returnDate <= borrowDate) {
			errors.returnDate = 'Return date must be after borrow date';
		} else if (returnDate > maxReturnDate()) {
			errors.returnDate = 'Maximum borrow period is 7 days';
		}
		
		if (!selectedInstructor) {
			errors.instructor = 'Please select an instructor';
		}
		
		if (!purposeDetails.trim()) {
			errors.purposeDetails = 'Please provide purpose details';
		}
		
		if (!acknowledgeTerms) {
			errors.terms = 'You must acknowledge the terms and conditions';
		}
		
		return Object.keys(errors).length === 0;
	}
	
	function handleSubmit() {
		if (!validateForm()) {
			toastStore.error('Please fix the errors in the form', 'Validation Error');
			return;
		}
		
		// Here you would make an API call to submit the request
		toastStore.success('Your request has been submitted successfully', 'Request Submitted');
		goto('/student/requests');
	}
	
	function resetForm() {
		selectedItems = [];
		purpose = 'lab-exercise';
		purposeDetails = '';
		borrowDate = '';
		returnDate = '';
		selectedInstructor = '';
		notes = '';
		acknowledgeTerms = false;
		errors = {};
	}
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
		<a href="/student/catalog" class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500">
			<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
			</svg>
			Browse Catalog
		</a>
	</div>
	
	<!-- Request Form -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<!-- Main Form -->
		<div class="lg:col-span-2 space-y-6">
			<!-- Selected Items -->
			<div class="rounded-lg bg-white p-6 shadow">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-lg font-semibold text-gray-900">Selected Items</h2>
					<button
						onclick={() => showItemSelector = !showItemSelector}
						class="inline-flex items-center rounded-lg bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500"
					>
						<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
						</svg>
						Add Item
					</button>
				</div>
				
				{#if errors.items}
					<div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
						{errors.items}
					</div>
				{/if}
				
				{#if showItemSelector}
					<div class="mb-4 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4">
						<h3 class="text-sm font-medium text-gray-900 mb-3">Select Equipment</h3>
						<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
							{#each availableEquipment as item}
								<button
									onclick={() => addItemToCart(item)}
									disabled={selectedItems.find(i => i.id === item.id)}
									class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<span class="text-2xl">{item.image}</span>
									<div class="flex-1">
										<p class="text-sm font-medium text-gray-900">{item.name}</p>
										<p class="text-xs text-gray-500">{item.code} • {item.available} available</p>
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/if}
				
				{#if selectedItems.length > 0}
					<div class="space-y-2">
						{#each selectedItems as item}
							<div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
								<div class="flex items-center gap-3">
									<span class="text-2xl">{item.image}</span>
									<div>
										<p class="text-sm font-medium text-gray-900">{item.name}</p>
										<p class="text-xs text-gray-500">{item.code}</p>
									</div>
								</div>
								<button
									onclick={() => removeItemFromCart(item.id)}
									class="text-red-600 hover:text-red-800"
								>
									<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
									</svg>
								</button>
							</div>
						{/each}
					</div>
				{:else}
					<div class="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
						<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
						</svg>
						<p class="mt-2 text-sm text-gray-500">No items selected</p>
						<p class="text-xs text-gray-400">Click "Add Item" to select equipment</p>
					</div>
				{/if}
			</div>
			
			<!-- Borrow Period -->
			<div class="rounded-lg bg-white p-6 shadow">
				<h2 class="text-lg font-semibold text-gray-900 mb-4">Borrow Period</h2>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
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
					<div>
						<label for="returnDate" class="block text-sm font-medium text-gray-700 mb-1">
							Return Date <span class="text-red-500">*</span>
						</label>
						<input
							type="date"
							id="returnDate"
							bind:value={returnDate}
							min={minReturnDate()}
							max={maxReturnDate()}
							disabled={!borrowDate}
							class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500 disabled:bg-gray-100 disabled:cursor-not-allowed {errors.returnDate ? 'border-red-500' : ''}"
						/>
						{#if errors.returnDate}
							<p class="mt-1 text-xs text-red-600">{errors.returnDate}</p>
						{:else if borrowDate}
							<p class="mt-1 text-xs text-gray-500">Maximum 7 days borrow period</p>
						{/if}
					</div>
				</div>
			</div>
			
			<!-- Purpose -->
			<div class="rounded-lg bg-white p-6 shadow">
				<h2 class="text-lg font-semibold text-gray-900 mb-4">Purpose</h2>
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
			
			<!-- Instructor -->
			<div class="rounded-lg bg-white p-6 shadow">
				<h2 class="text-lg font-semibold text-gray-900 mb-4">Instructor Approval</h2>
				<div>
					<label for="instructor" class="block text-sm font-medium text-gray-700 mb-1">
						Select Instructor <span class="text-red-500">*</span>
					</label>
					<select
						id="instructor"
						bind:value={selectedInstructor}
						class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500 {errors.instructor ? 'border-red-500' : ''}"
					>
						<option value="">Choose an instructor...</option>
						{#each instructors as instructor}
							<option value={instructor.id}>{instructor.name}</option>
						{/each}
					</select>
					{#if errors.instructor}
						<p class="mt-1 text-xs text-red-600">{errors.instructor}</p>
					{/if}
					<p class="mt-1 text-xs text-gray-500">Your request will be sent to this instructor for approval</p>
				</div>
			</div>
			
			<!-- Additional Notes -->
			<div class="rounded-lg bg-white p-6 shadow">
				<h2 class="text-lg font-semibold text-gray-900 mb-4">Additional Information</h2>
				<div>
					<label for="notes" class="block text-sm font-medium text-gray-700 mb-1">
						Notes / Special Instructions <span class="text-gray-400">(Optional)</span>
					</label>
					<textarea
						id="notes"
						bind:value={notes}
						rows="3"
						placeholder="Any special instructions or notes for the custodian..."
						class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
					></textarea>
				</div>
			</div>
		</div>
		
		<!-- Summary Sidebar -->
		<div class="lg:col-span-1">
			<div class="sticky top-6 space-y-6">
				<!-- Request Summary -->
				<div class="rounded-lg bg-white p-6 shadow">
					<h2 class="text-lg font-semibold text-gray-900 mb-4">Request Summary</h2>
					<div class="space-y-3 text-sm">
						<div class="flex justify-between">
							<span class="text-gray-600">Items:</span>
							<span class="font-medium text-gray-900">{selectedItems.length}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600">Borrow Date:</span>
							<span class="font-medium text-gray-900">{borrowDate || '-'}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600">Return Date:</span>
							<span class="font-medium text-gray-900">{returnDate || '-'}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-600">Duration:</span>
							<span class="font-medium text-gray-900">
								{#if borrowDate && returnDate}
									{Math.ceil((new Date(returnDate).getTime() - new Date(borrowDate).getTime()) / (1000 * 60 * 60 * 24))} days
								{:else}
									-
								{/if}
							</span>
						</div>
					</div>
				</div>
				
				<!-- Terms and Conditions -->
				<div class="rounded-lg bg-white p-6 shadow">
					<h2 class="text-lg font-semibold text-gray-900 mb-4">Terms & Conditions</h2>
					<div class="space-y-3 text-sm text-gray-600">
						<div class="flex items-start gap-2">
							<svg class="h-5 w-5 flex-shrink-0 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							<p>I am responsible for any damage to the equipment</p>
						</div>
						<div class="flex items-start gap-2">
							<svg class="h-5 w-5 flex-shrink-0 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							<p>I will return the equipment on time</p>
						</div>
						<div class="flex items-start gap-2">
							<svg class="h-5 w-5 flex-shrink-0 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							<p>Late returns may incur penalties</p>
						</div>
						<div class="flex items-start gap-2">
							<svg class="h-5 w-5 flex-shrink-0 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							<p>Equipment must be used for educational purposes only</p>
						</div>
					</div>
					
					<div class="mt-4 pt-4 border-t border-gray-200">
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
						class="w-full inline-flex items-center justify-center rounded-lg bg-pink-600 px-4 py-3 text-sm font-medium text-white hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500"
					>
						<svg class="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
						</svg>
						Submit Request
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
