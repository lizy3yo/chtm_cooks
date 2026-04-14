<script lang="ts">
	import type { BorrowRequestItem } from '$lib/api/borrowRequests';

	interface Props {
		items: BorrowRequestItem[];
		requestId: string;
		onSubmit: (inspections: Array<{
			itemId: string;
			status: 'good' | 'damaged' | 'missing';
			notes: string;
			replacementQuantity: number;
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
	let inspections = $state<ItemInspection[]>(
		items.map((item) => ({
			itemId: item.itemId,
			name: item.name,
			quantity: item.quantity,
			picture: item.picture ?? null,
			status: null,
			notes: '',
			replacementQuantity: 0
		}))
	);

	let submitting = $state(false);
	let error = $state<string | null>(null);

	function getInspection(itemId: string): ItemInspection {
		return inspections.find((i) => i.itemId === itemId)!;
	}

	function setInspectionStatus(itemId: string, status: 'good' | 'damaged' | 'missing') {
		const inspection = getInspection(itemId);
		inspection.status = status;
		if (status === 'good') {
			inspection.replacementQuantity = 0;
		}
	}

	const allInspected = $derived(
		inspections.every((i) => i.status !== null)
	);
	const hasIssues = $derived(
		inspections.some((i) => i.status === 'damaged' || i.status === 'missing')
	);

	function getItemEmoji(name: string): string {
		const normalized = name.toLowerCase();
		if (normalized.includes('knife')) return '🔪';
		if (normalized.includes('bowl')) return '🥣';
		if (normalized.includes('scale')) return '⚖️';
		if (normalized.includes('mixer')) return '🧁';
		if (normalized.includes('processor')) return '🍽️';
		return '📦';
	}

	function getStatusColor(status: 'good' | 'damaged' | 'missing' | null): string {
		switch (status) {
			case 'good':
				return 'bg-emerald-100 text-emerald-800 border-emerald-300';
			case 'damaged':
				return 'bg-rose-100 text-rose-800 border-rose-300';
			case 'missing':
				return 'bg-red-100 text-red-800 border-red-300';
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
			await onSubmit(
				inspections.map((i) => {
					const baseInspection = {
						itemId: i.itemId,
						status: i.status!,
						notes: i.notes
					};

					// Only include replacementQuantity for damaged/missing items
					if (i.status === 'damaged' || i.status === 'missing') {
						return {
							...baseInspection,
							replacementQuantity: i.replacementQuantity
						};
					}

					return baseInspection;
				})
			);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to submit inspection';
			submitting = false;
		}
	}
</script>

<!-- Modal Container -->
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
	<!-- Backdrop -->
	<button
		type="button"
		class="fixed inset-0 bg-black/50"
		onclick={onCancel}
		onkeydown={(e) => e.key === 'Escape' && onCancel()}
		aria-label="Close modal"
		tabindex="-1"
	></button>
	
	<!-- Modal -->
	<div
		class="relative w-full max-w-4xl rounded-lg bg-white shadow-xl z-10"
		role="dialog"
		aria-labelledby="modal-title"
		aria-modal="true"
		tabindex="-1"
	>
		<!-- Header -->
		<div class="border-b border-gray-200 px-6 py-4">
			<div class="flex items-center justify-between">
				<div>
					<h2 id="modal-title" class="text-2xl font-bold text-gray-900">Item Inspection</h2>
					<p class="mt-1 text-sm text-gray-600">
						Inspect each item and document its condition. Replacement obligations will be created for damaged or missing items.
					</p>
				</div>
				<button
					type="button"
					onclick={onCancel}
					class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
					aria-label="Close modal"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>

		<!-- Content -->
		<div class="max-h-[60vh] overflow-y-auto px-6 py-4">
			{#if error}
				<div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
					<div class="flex items-center gap-3">
						<svg class="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<p class="text-sm font-medium text-red-800">{error}</p>
					</div>
				</div>
			{/if}

			<div class="space-y-4">
				{#each inspections as inspection, index (inspection.itemId)}
					<div class="rounded-lg border border-gray-200 bg-white p-4">
						<!-- Item Header -->
						<div class="mb-4 flex items-start gap-4">
							{#if inspection.picture}
								<img
									src={inspection.picture}
									alt={inspection.name}
									class="h-12 w-12 rounded-lg border border-gray-200 object-cover"
									loading="lazy"
									onerror={() => {
										inspection.picture = null;
									}}
								/>
							{:else}
								<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 text-2xl">
									{getItemEmoji(inspection.name)}
								</div>
							{/if}
							<div class="flex-1">
								<h3 class="font-semibold text-gray-900">{inspection.name}</h3>
								<p class="text-sm text-gray-600">Quantity: {inspection.quantity}</p>
							</div>
							<div class={`rounded-full border px-3 py-1 text-sm font-medium ${getStatusColor(inspection.status)}`}>
								{getStatusLabel(inspection.status)}
							</div>
						</div>

						<!-- Status Selection -->
						<div class="mb-4">
							<span id={`status-label-${index}`} class="mb-2 block text-sm font-medium text-gray-700">Condition Status *</span>
							<div class="grid grid-cols-3 gap-3" role="group" aria-labelledby={`status-label-${index}`}>
								<button
									type="button"
									class={`rounded-lg border-2 p-3 text-center transition-all hover:scale-105 active:scale-95 ${
										inspection.status === 'good'
											? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
											: 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300 hover:bg-emerald-50'
									}`}
									onclick={() => setInspectionStatus(inspection.itemId, 'good')}
									aria-pressed={inspection.status === 'good'}
								>
									<svg class="mx-auto mb-1 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
									</svg>
									<span class="text-sm font-medium">Good</span>
								</button>

								<button
									type="button"
									class={`rounded-lg border-2 p-3 text-center transition-all hover:scale-105 active:scale-95 ${
										inspection.status === 'damaged'
											? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm'
											: 'border-gray-200 bg-white text-gray-700 hover:border-rose-300 hover:bg-rose-50'
									}`}
									onclick={() => setInspectionStatus(inspection.itemId, 'damaged')}
									aria-pressed={inspection.status === 'damaged'}
								>
									<svg class="mx-auto mb-1 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
									</svg>
									<span class="text-sm font-medium">Damaged</span>
								</button>

								<button
									type="button"
									class={`rounded-lg border-2 p-3 text-center transition-all hover:scale-105 active:scale-95 ${
										inspection.status === 'missing'
											? 'border-red-500 bg-red-50 text-red-700 shadow-sm'
											: 'border-gray-200 bg-white text-gray-700 hover:border-red-300 hover:bg-red-50'
									}`}
									onclick={() => setInspectionStatus(inspection.itemId, 'missing')}
									aria-pressed={inspection.status === 'missing'}
								>
									<svg class="mx-auto mb-1 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
									<span class="text-sm font-medium">Missing</span>
								</button>
							</div>
						</div>

						<!-- Replacement Quantity (for damaged/missing) -->
						{#if inspection.status === 'damaged' || inspection.status === 'missing'}
							<div class="mb-4">
								<label for={`replacement-quantity-${index}`} class="mb-2 block text-sm font-medium text-gray-700">
									Replacement Quantity *
								</label>
								<input
									id={`replacement-quantity-${index}`}
									type="number"
									min="1"
									max={inspection.quantity}
									step="1"
									bind:value={inspection.replacementQuantity}
									class="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
									placeholder="Enter quantity to replace"
									required
								/>
								<p class="mt-1 text-sm text-gray-600">
									Selected replacement quantity: {inspection.replacementQuantity} (max: {inspection.quantity})
								</p>
							</div>
						{/if}

						<!-- Notes -->
						<div>
							<label for={`notes-${index}`} class="mb-2 block text-sm font-medium text-gray-700">
								Notes (Optional)
							</label>
							<textarea
								id={`notes-${index}`}
								bind:value={inspection.notes}
								rows="2"
								class="block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
								placeholder={
									inspection.status === 'good'
										? 'Any observations about this item...'
										: 'Describe the damage or circumstances of loss...'
								}
							></textarea>
						</div>
					</div>
				{/each}
			</div>

			<!-- Summary -->
			{#if allInspected && hasIssues}
				<div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
					<div class="flex items-start gap-3">
						<svg class="mt-0.5 h-5 w-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
						<div class="flex-1">
							<p class="font-medium text-amber-900">Replacement obligations will be created</p>
							<p class="mt-1 text-sm text-amber-800">
								Items marked as damaged or missing will generate replacement obligations for the student.
								Total quantity to replace: {inspections
									.filter((i) => i.status === 'damaged' || i.status === 'missing')
									.reduce((sum, i) => sum + i.replacementQuantity, 0)
									.toLocaleString()}
							</p>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Footer -->
		<div class="border-t border-gray-200 px-6 py-4">
			<div class="flex items-center justify-between">
				<p class="text-sm text-gray-600">
					{inspections.filter((i) => i.status !== null).length} of {inspections.length} items inspected
				</p>
				<div class="flex gap-3">
					<button
						type="button"
						onclick={onCancel}
						disabled={submitting}
						class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={handleSubmit}
						disabled={!allInspected || submitting}
						class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if submitting}
							<span class="flex items-center gap-2">
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
				</div>
			</div>
		</div>
	</div>
</div>
