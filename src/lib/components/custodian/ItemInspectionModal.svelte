<script lang="ts">
	import type { BorrowRequestItem } from '$lib/api/borrowRequests';
	import { CheckCircle2, AlertTriangle, XCircle, Package, Search } from 'lucide-svelte';

	interface Props {
		items: BorrowRequestItem[];
		requestId: string;
		onSubmit: (inspections: Array<{
			itemId: string;
			status: 'good' | 'damaged' | 'missing';
			notes: string;
			replacementQuantity?: number;
		}>) => Promise<void>;
		onCancel: () => void;
	}

	let { items, requestId, onSubmit, onCancel }: Props = $props();

	interface ItemInspection {
		itemId: string;
		name: string;
		quantity: number;
		picture?: string | null;
		status: 'good' | 'damaged' | 'missing' | null;
		notes: string;
		replacementQuantity: number;
	}

	// Initialize inspection data from items (stable reference)
	let inspections = $state<ItemInspection[]>([]);

	// Initialize inspections when items change
	$effect(() => {
		inspections = items.map((item) => ({
			itemId: item.itemId,
			name: item.name,
			quantity: item.quantity,
			picture: item.picture ?? null,
			status: null,
			notes: '',
			replacementQuantity: 0
		}));
	});

	let submitting = $state(false);
	let error = $state<string | null>(null);
	let currentItemIndex = $state(0);

	const currentItem = $derived(inspections[currentItemIndex]);
	const progress = $derived(((currentItemIndex + 1) / inspections.length) * 100);

	function getInspection(itemId: string): ItemInspection {
		return inspections.find((i) => i.itemId === itemId)!;
	}

	function setInspectionStatus(itemId: string, status: 'good' | 'damaged' | 'missing') {
		const inspection = getInspection(itemId);
		inspection.status = status;
		if (status === 'good') {
			inspection.replacementQuantity = 0;
		} else if (inspection.replacementQuantity === 0) {
			inspection.replacementQuantity = inspection.quantity;
		}
	}

	const allInspected = $derived(
		inspections.every((i) => i.status !== null)
	);
	const hasIssues = $derived(
		inspections.some((i) => i.status === 'damaged' || i.status === 'missing')
	);

	const inspectedCount = $derived(
		inspections.filter((i) => i.status !== null).length
	);


	// Professional Lucide icon fallback for missing item images
	function getItemIcon(name: string) {
		const normalized = name.toLowerCase();
		// You can expand this mapping as needed for more item types
		if (normalized.includes('knife')) return CheckCircle2; // Example: use CheckCircle2 for knife
		if (normalized.includes('bowl')) return Package; // Example: use Package for bowl
		if (normalized.includes('scale')) return AlertTriangle; // Example: use AlertTriangle for scale
		if (normalized.includes('mixer')) return Package; // Example: use Package for mixer
		if (normalized.includes('processor')) return Package; // Example: use Package for processor
		return Package;
	}

	function getStatusColor(status: 'good' | 'damaged' | 'missing' | null): string {
		switch (status) {
			case 'good':
				return 'bg-emerald-100 text-emerald-800 border-emerald-300';
			case 'damaged':
				return 'bg-amber-100 text-amber-800 border-amber-300';
			case 'missing':
				return 'bg-rose-100 text-rose-800 border-rose-300';
			default:
				return 'bg-gray-100 text-gray-800 border-gray-300';
		}
	}

	function getStatusLabel(status: 'good' | 'damaged' | 'missing' | null): string {
		switch (status) {
			case 'good':
				return 'Good Condition';
			case 'damaged':
				return 'Damaged';
			case 'missing':
				return 'Missing';
			default:
				return 'Not Inspected';
		}
	}

	function nextItem() {
		if (currentItemIndex < inspections.length - 1) {
			currentItemIndex++;
		}
	}

	function previousItem() {
		if (currentItemIndex > 0) {
			currentItemIndex--;
		}
	}

	function goToItem(index: number) {
		currentItemIndex = index;
	}

	async function handleSubmit() {
		if (!allInspected) {
			error = 'Please inspect all items before submitting';
			return;
		}

		// Require a valid replacement quantity for non-good returns
		for (const inspection of inspections) {
			if (
				(inspection.status === 'damaged' || inspection.status === 'missing') &&
				(!Number.isInteger(inspection.replacementQuantity) || inspection.replacementQuantity <= 0)
			) {
				error = `Please enter a replacement quantity for ${inspection.name}`;
				return;
			}
		}

		submitting = true;
		error = null;

		try {
			// Only include replacementQuantity for damaged/missing items
			const payload = inspections.map((i) => {
				const baseInspection: any = {
					itemId: i.itemId,
					status: i.status!,
					notes: i.notes || ''
				};

				// Only include replacementQuantity for damaged/missing items
				if (i.status === 'damaged' || i.status === 'missing') {
					baseInspection.replacementQuantity = i.replacementQuantity;
				}

				return baseInspection;
			});

			console.log('[ItemInspectionModal] Submitting inspection payload:', payload);
			await onSubmit(payload);
			console.log('[ItemInspectionModal] Inspection submitted successfully');
		} catch (err) {
			console.error('[ItemInspectionModal] Inspection submission failed:', err);
			error = err instanceof Error ? err.message : 'Failed to submit inspection';
			submitting = false;
		}
	}
</script>

<!-- Modal Container -->
<div class="fixed inset-0 z-50 overflow-y-auto">
	<!-- Backdrop -->
	<button
		type="button"
		class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
		onclick={onCancel}
		aria-label="Close modal"
		tabindex="-1"
	></button>
	
	<!-- Modal -->
	<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
		<div
			class="relative w-full max-w-2xl sm:max-w-4xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl animate-scaleIn overflow-hidden mx-0 sm:mx-auto"
			role="dialog"
			aria-labelledby="modal-title"
			aria-modal="true"
		>
			<!-- Header -->
			<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
				<div class="px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
					<div class="flex items-start gap-3 sm:gap-4">
						<!-- Icon -->
						<div class="flex h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30">
							<Search class="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-white" />
						</div>
						
						<div class="min-w-0 flex-1">
							<h2 id="modal-title" class="text-base font-bold text-gray-900 sm:text-lg lg:text-xl">Item Inspection</h2>
							<p class="mt-0.5 text-xs text-gray-500 sm:text-sm">Inspect each item and document its condition</p>
							
							<!-- Progress Bar -->
							<div class="mt-3">
								<div class="flex items-center justify-between text-xs text-gray-600 mb-1.5">
									<span class="font-medium">{inspectedCount} of {inspections.length} inspected</span>
									<span class="font-bold text-pink-600">{Math.round(progress)}%</span>
								</div>
								<div class="h-2 rounded-full bg-gray-100 overflow-hidden">
									<div 
										class="h-full bg-linear-to-r from-pink-500 to-pink-600 transition-all duration-500 ease-out"
										style="width: {progress}%"
									></div>
								</div>
							</div>
						</div>

						<button
							type="button"
							onclick={onCancel}
							class="rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 shrink-0"
							aria-label="Close modal"
						>
							<svg class="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				</div>
			</div>

			<!-- Content -->
			<div class="max-h-[calc(100vh-240px)] sm:max-h-[60vh] overflow-y-auto">
				<div class="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
					{#if error}
						<div class="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
							<div class="flex items-center gap-3">
								<AlertTriangle class="h-5 w-5 text-rose-500 shrink-0" />
								<p class="text-sm font-medium text-rose-800">{error}</p>
							</div>
						</div>
					{/if}

					<!-- Item Navigation Pills -->
					{#if inspections.length > 1}
						<div class="mb-6 flex flex-wrap gap-2">
							{#each inspections as inspection, index}
								<button
									type="button"
									onclick={() => goToItem(index)}
									class="group relative rounded-lg px-3 py-2 text-xs font-medium transition-all {
										currentItemIndex === index
											? 'bg-pink-600 text-white shadow-md'
											: inspection.status
												? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
												: 'bg-gray-100 text-gray-600 hover:bg-gray-200'
									}"
								>
									<span class="flex items-center gap-1.5">
										{#if inspection.status}
											<CheckCircle2 class="h-3 w-3" />
										{/if}
										Item {index + 1}
									</span>
								</button>
							{/each}
						</div>
					{/if}

					<!-- Current Item Card -->
					{#if currentItem}
						<div class="rounded-2xl border-2 border-gray-200 bg-linear-to-br from-white to-gray-50 p-5 sm:p-6 shadow-sm">
							<!-- Item Header -->
							<div class="mb-5 flex items-start gap-4">
								{#if currentItem.picture}
									<img
										src={currentItem.picture}
										alt={currentItem.name}
										class="h-16 w-16 rounded-xl border-2 border-gray-200 object-cover shadow-md"
										loading="lazy"
										onerror={() => {
											inspections[currentItemIndex].picture = null;
										}}
									/>
								{:else}
									<div class="flex h-16 w-16 items-center justify-center rounded-xl bg-linear-to-br from-pink-50 to-pink-100 border-2 border-pink-200 shadow-md">
										{#key currentItem.name}
											{@const Icon = getItemIcon(currentItem.name)}
											<Icon class="h-8 w-8 text-pink-400" aria-label="No image available" />
										{/key}
									</div>
								{/if}
								<div class="flex-1 min-w-0">
									<h3 class="text-lg font-bold text-gray-900 truncate">{currentItem.name}</h3>
									<p class="text-sm text-gray-600 mt-0.5">Quantity: <span class="font-semibold text-gray-900">{currentItem.quantity}</span></p>
									<div class="mt-2">
										<span class={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${getStatusColor(currentItem.status)}`}>
											{#if currentItem.status === 'good'}
												<CheckCircle2 class="h-3 w-3" />
											{:else if currentItem.status === 'damaged'}
												<AlertTriangle class="h-3 w-3" />
											{:else if currentItem.status === 'missing'}
												<XCircle class="h-3 w-3" />
											{/if}
											{getStatusLabel(currentItem.status)}
										</span>
									</div>
								</div>
							</div>

							<!-- Status Selection -->
							<div class="mb-5">
								<div class="mb-3 text-sm font-bold text-gray-900" role="group" aria-label="Condition Status">
									Condition Status <span class="text-pink-500">*</span>`n</div>
								<div class="grid grid-cols-3 gap-2 sm:gap-3">
									<button
										type="button"
										class={`group relative rounded-xl border-2 p-3 sm:p-4 text-center transition-all hover:scale-105 active:scale-95 ${
											currentItem.status === 'good'
												? 'border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-500/20'
												: 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50'
										}`}
										onclick={() => setInspectionStatus(currentItem.itemId, 'good')}
										aria-pressed={currentItem.status === 'good'}
									>
										<CheckCircle2 class={`mx-auto mb-1 sm:mb-2 h-6 w-6 sm:h-8 sm:w-8 transition-colors ${
											currentItem.status === 'good' ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-500'
										}`} />
										<span class={`text-xs sm:text-sm font-bold ${
											currentItem.status === 'good' ? 'text-emerald-700' : 'text-gray-700'
										}`}>Good</span>
										{#if currentItem.status === 'good'}
											<div class="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
												<svg class="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
													<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
												</svg>
											</div>
										{/if}
									</button>

									<button
										type="button"
										class={`group relative rounded-xl border-2 p-3 sm:p-4 text-center transition-all hover:scale-105 active:scale-95 ${
											currentItem.status === 'damaged'
												? 'border-amber-500 bg-amber-50 shadow-lg shadow-amber-500/20'
												: 'border-gray-200 bg-white hover:border-amber-300 hover:bg-amber-50'
										}`}
										onclick={() => setInspectionStatus(currentItem.itemId, 'damaged')}
										aria-pressed={currentItem.status === 'damaged'}
									>
										<AlertTriangle class={`mx-auto mb-1 sm:mb-2 h-6 w-6 sm:h-8 sm:w-8 transition-colors ${
											currentItem.status === 'damaged' ? 'text-amber-600' : 'text-gray-400 group-hover:text-amber-500'
										}`} />
										<span class={`text-xs sm:text-sm font-bold ${
											currentItem.status === 'damaged' ? 'text-amber-700' : 'text-gray-700'
										}`}>Damaged</span>
										{#if currentItem.status === 'damaged'}
											<div class="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center">
												<svg class="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
													<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
												</svg>
											</div>
										{/if}
									</button>

									<button
										type="button"
										class={`group relative rounded-xl border-2 p-3 sm:p-4 text-center transition-all hover:scale-105 active:scale-95 ${
											currentItem.status === 'missing'
												? 'border-rose-500 bg-rose-50 shadow-lg shadow-rose-500/20'
												: 'border-gray-200 bg-white hover:border-rose-300 hover:bg-rose-50'
										}`}
										onclick={() => setInspectionStatus(currentItem.itemId, 'missing')}
										aria-pressed={currentItem.status === 'missing'}
									>
										<XCircle class={`mx-auto mb-1 sm:mb-2 h-6 w-6 sm:h-8 sm:w-8 transition-colors ${
											currentItem.status === 'missing' ? 'text-rose-600' : 'text-gray-400 group-hover:text-rose-500'
										}`} />
										<span class={`text-xs sm:text-sm font-bold ${
											currentItem.status === 'missing' ? 'text-rose-700' : 'text-gray-700'
										}`}>Missing</span>
										{#if currentItem.status === 'missing'}
											<div class="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-rose-500 flex items-center justify-center">
												<svg class="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
													<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
												</svg>
											</div>
										{/if}
									</button>
								</div>
							</div>

							<!-- Replacement Quantity (for damaged/missing) -->
							{#if currentItem.status === 'damaged' || currentItem.status === 'missing'}
								<div class="mb-5 rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
									<label for="replacement-quantity" class="mb-2 block text-sm font-bold text-amber-900">
										Replacement Quantity <span class="text-rose-500">*</span>
									</label>
									<input
										id="replacement-quantity"
										type="number"
										min="1"
										step="1"
										bind:value={currentItem.replacementQuantity}
										class="block w-full rounded-lg border-2 border-amber-300 bg-white px-4 py-2.5 text-sm font-medium shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
										placeholder="Enter quantity to replace"
										required
									/>
									<p class="mt-2 text-xs text-amber-800">
										<span class="font-semibold">Borrowed quantity:</span> {currentItem.quantity}
										<span class="text-amber-600 ml-2">• Enter the quantity that needs replacement</span>
									</p>
								</div>
							{/if}

							<!-- Notes -->
							<div>
								<label for="notes" class="mb-2 block text-sm font-bold text-gray-900">
									Notes <span class="text-gray-500 font-normal">(Optional)</span>
								</label>
								<textarea
									id="notes"
									bind:value={currentItem.notes}
									rows="3"
									class="block w-full rounded-lg border-2 border-gray-200 px-4 py-2.5 text-sm shadow-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
									placeholder={
										currentItem.status === 'good'
											? 'Any observations about this item...'
											: 'Describe the damage or circumstances of loss...'
									}
								></textarea>
							</div>
						</div>
					{/if}

					<!-- Summary Alert -->
					{#if allInspected && hasIssues}
						<div class="mt-6 rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
							<div class="flex items-start gap-3">
								<AlertTriangle class="mt-0.5 h-5 w-5 text-amber-600 shrink-0" />
								<div class="flex-1">
									<p class="font-bold text-amber-900">Replacement obligations will be created</p>
									<p class="mt-1 text-sm text-amber-800">
										Items marked as damaged or missing will generate replacement obligations for the student.
										<span class="font-semibold">Total quantity to replace: {inspections
											.filter((i) => i.status === 'damaged' || i.status === 'missing')
											.reduce((sum, i) => sum + i.replacementQuantity, 0)
											.toLocaleString()}</span>
									</p>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Footer -->
			<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
				<!-- Mobile Layout (stacked) -->
				<div class="flex flex-col gap-3 sm:hidden">
					<!-- Progress Indicator (top on mobile) -->
					{#if inspections.length > 1}
						<div class="text-center text-sm font-medium text-gray-600">
							{currentItemIndex + 1} / {inspections.length}
						</div>
					{/if}
					
					<!-- Buttons Row -->
					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={onCancel}
							disabled={submitting}
							class="flex-1 rounded-lg border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
						>
							Cancel
						</button>
						
						{#if inspections.length > 1 && currentItemIndex > 0}
							<button
								type="button"
								onclick={previousItem}
								class="flex-1 rounded-lg border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98]"
							>
								← Prev
							</button>
						{/if}
						
						{#if currentItemIndex < inspections.length - 1}
							<button
								type="button"
								onclick={nextItem}
								class="flex-1 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-700 active:scale-[0.98]"
							>
								Next →
							</button>
						{:else}
							<button
								type="button"
								onclick={handleSubmit}
								disabled={!allInspected || submitting}
								class="flex-1 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none active:scale-[0.98]"
							>
								{#if submitting}
									<span class="flex items-center justify-center gap-2">
										<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
											<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
											<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
										</svg>
										<span class="hidden xs:inline">Processing...</span>
									</span>
								{:else}
									Complete
								{/if}
							</button>
						{/if}
					</div>
				</div>

				<!-- Desktop Layout (single row) -->
				<div class="hidden sm:flex items-center justify-between gap-3">
					<!-- Cancel Button (left side) -->
					<button
						type="button"
						onclick={onCancel}
						disabled={submitting}
						class="rounded-lg border-2 border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
					>
						Cancel
					</button>

					<!-- Progress Indicator (center) -->
					{#if inspections.length > 1}
						<span class="absolute left-1/2 -translate-x-1/2 text-sm font-medium text-gray-600">
							{currentItemIndex + 1} / {inspections.length}
						</span>
					{/if}

					<!-- Navigation Buttons (right side) -->
					<div class="flex items-center gap-3">
						<!-- Previous Button -->
						{#if inspections.length > 1 && currentItemIndex > 0}
							<button
								type="button"
								onclick={previousItem}
								class="rounded-lg border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98]"
							>
								← Previous
							</button>
						{/if}
						
						{#if currentItemIndex < inspections.length - 1}
							<!-- Show Next button when not on last item -->
							<button
								type="button"
								onclick={nextItem}
								class="rounded-lg bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-700 active:scale-[0.98]"
							>
								Next →
							</button>
						{:else}
							<!-- Show Complete Inspection button on last item -->
							<button
								type="button"
								onclick={handleSubmit}
								disabled={!allInspected || submitting}
								class="rounded-lg bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none active:scale-[0.98]"
							>
								{#if submitting}
									<span class="flex items-center justify-center gap-2">
										<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
											<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
											<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
										</svg>
										Processing...
									</span>
								{:else}
									Complete Inspection
								{/if}
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>


