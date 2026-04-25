<script lang="ts">
	import type { BorrowRequestItem } from '$lib/api/borrowRequests';
	import { CheckCircle2, AlertTriangle, XCircle, Package, Search } from 'lucide-svelte';
	import { untrack } from 'svelte';

	interface Props {
		items: BorrowRequestItem[];
		requestId: string;
		onSubmit: (
			inspections: Array<{
				itemId: string;
				status: 'good' | 'damaged' | 'missing';
				notes: string;
				replacementQuantity?: number;
			}>
		) => Promise<void>;
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
		reportedQuantity: number;
		replacementQuantity: number;
	}

	// Initialize inspection data from items (stable reference)
	let inspections = $state<ItemInspection[]>([]);

	// Sync inspections when items change (e.g. from background polling) without resetting user state
	$effect(() => {
		const currentItems = items;

		untrack(() => {
			if (inspections.length === 0) {
				// Initial load
				inspections = currentItems.map((item) => ({
					itemId: item.itemId,
					name: item.name,
					quantity: item.quantity,
					picture: item.picture ?? null,
					status: null,
					notes: '',
					reportedQuantity: item.quantity,
					replacementQuantity: item.quantity
				}));
			} else {
				// Prevent resetting local state on background refresh
				const updatedInspections = [...inspections];
				for (const item of currentItems) {
					const existing = updatedInspections.find((i) => i.itemId === item.itemId);
					if (!existing) {
						updatedInspections.push({
							itemId: item.itemId,
							name: item.name,
							quantity: item.quantity,
							picture: item.picture ?? null,
							status: null,
							notes: '',
							reportedQuantity: item.quantity,
							replacementQuantity: item.quantity
						});
					} else {
						// Only update non-editable data
						existing.name = item.name;
						if (item.picture) existing.picture = item.picture;
					}
				}
				inspections = updatedInspections;
			}
		});
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
	}

	const allInspected = $derived(inspections.every((i) => i.status !== null));
	const hasIssues = $derived(
		inspections.some((i) => i.status === 'damaged' || i.status === 'missing')
	);

	const inspectedCount = $derived(inspections.filter((i) => i.status !== null).length);

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

		// Require a valid quantity for all returns
		for (const inspection of inspections) {
			if (!Number.isInteger(inspection.reportedQuantity) || inspection.reportedQuantity <= 0) {
				error = `Please enter a valid reported quantity for ${inspection.name}`;
				return;
			}
			if (inspection.status === 'good') {
				inspection.replacementQuantity = inspection.reportedQuantity;
			} else if (
				!Number.isInteger(inspection.replacementQuantity) ||
				inspection.replacementQuantity < 0
			) {
				error = `Please enter a valid replacement quantity for ${inspection.name}`;
				return;
			}
		}

		submitting = true;
		error = null;

		try {
			const payload = inspections.map((i) => {
				const baseInspection: any = {
					itemId: i.itemId,
					status: i.status!,
					notes: i.notes || '',
					replacementQuantity: i.status === 'good' ? i.reportedQuantity : i.replacementQuantity
				};

				if (i.status !== 'good' && i.reportedQuantity !== i.replacementQuantity) {
					baseInspection.notes =
						`[System: Reported ${i.reportedQuantity} ${i.status}, but recorded ${i.replacementQuantity} for replacement] ` +
						baseInspection.notes;
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
			class="animate-scaleIn relative mx-0 w-full max-w-2xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:mx-auto sm:max-w-4xl sm:rounded-3xl"
			role="dialog"
			aria-labelledby="modal-title"
			aria-modal="true"
		>
			<!-- Header -->
			<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
				<div class="px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
					<div class="flex items-start gap-3 sm:gap-4">
						<!-- Icon -->
						<div
							class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30 sm:h-14 sm:w-14 sm:rounded-2xl lg:h-16 lg:w-16"
						>
							<Search class="h-6 w-6 text-white sm:h-7 sm:w-7 lg:h-8 lg:w-8" />
						</div>

						<div class="min-w-0 flex-1">
							<h2 id="modal-title" class="text-base font-bold text-gray-900 sm:text-lg lg:text-xl">
								Item Inspection
							</h2>
							<p class="mt-0.5 text-xs text-gray-500 sm:text-sm">
								Inspect each item and document its condition
							</p>

							<!-- Progress Bar -->
							<div class="mt-3">
								<div class="mb-1.5 flex items-center justify-between text-xs text-gray-600">
									<span class="font-medium">{inspectedCount} of {inspections.length} inspected</span
									>
									<span class="font-bold text-pink-600">{Math.round(progress)}%</span>
								</div>
								<div class="h-2 overflow-hidden rounded-full bg-gray-100">
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
							class="shrink-0 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 sm:rounded-xl sm:p-2"
							aria-label="Close modal"
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
			<div class="max-h-[calc(100vh-240px)] overflow-y-auto sm:max-h-[60vh]">
				<div class="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
					{#if error}
						<div class="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
							<div class="flex items-center gap-3">
								<AlertTriangle class="h-5 w-5 shrink-0 text-rose-500" />
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
									class="group relative rounded-lg px-3 py-2 text-xs font-medium transition-all {currentItemIndex ===
									index
										? 'bg-pink-600 text-white shadow-md'
										: inspection.status
											? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
											: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
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
						<div
							class="rounded-2xl border-2 border-gray-200 bg-linear-to-br from-white to-gray-50 p-5 shadow-sm sm:p-6"
						>
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
									<div
										class="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-pink-200 bg-linear-to-br from-pink-50 to-pink-100 shadow-md"
									>
										{#key currentItem.name}
											{@const Icon = getItemIcon(currentItem.name)}
											<Icon class="h-8 w-8 text-pink-400" aria-label="No image available" />
										{/key}
									</div>
								{/if}
								<div class="min-w-0 flex-1">
									<h3 class="truncate text-lg font-bold text-gray-900" title={currentItem.name}>
										{currentItem.name}
									</h3>
									<div class="mt-1.5 flex items-center gap-2">
										<label
											for="expected-qty-{currentItem.itemId}"
											class="text-sm font-medium text-gray-600">Expected Return Qty:</label
										>
										<input
											id="expected-qty-{currentItem.itemId}"
											type="number"
											min="1"
											step="1"
											value={currentItem.quantity}
											oninput={(e) => {
												const newQty = parseInt(e.currentTarget.value);
												if (!isNaN(newQty)) {
													const oldQty = currentItem.quantity;
													currentItem.quantity = newQty;
													if (currentItem.reportedQuantity === oldQty) {
														currentItem.reportedQuantity = newQty;
													}
													if (currentItem.replacementQuantity === oldQty) {
														currentItem.replacementQuantity = newQty;
													}
												}
											}}
											class="w-20 rounded-lg border-2 border-gray-200 bg-white px-2.5 py-1 text-sm font-bold text-gray-900 shadow-sm transition-colors hover:border-pink-300 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
											title="Edit if the physical expected quantity differs from the recorded system quantity"
										/>
									</div>
									<div class="mt-2">
										<span
											class={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${getStatusColor(currentItem.status)}`}
										>
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
								<div
									class="mb-3 text-sm font-bold text-gray-900"
									role="group"
									aria-label="Condition Status"
								>
									Condition Status <span class="text-pink-500">*</span>
								</div>
								<div class="grid grid-cols-3 gap-2 sm:gap-3">
									<button
										type="button"
										class={`group relative rounded-xl border-2 p-3 text-center transition-all hover:scale-105 active:scale-95 sm:p-4 ${
											currentItem.status === 'good'
												? 'border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-500/20'
												: 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50'
										}`}
										onclick={() => setInspectionStatus(currentItem.itemId, 'good')}
										aria-pressed={currentItem.status === 'good'}
									>
										<CheckCircle2
											class={`mx-auto mb-1 h-6 w-6 transition-colors sm:mb-2 sm:h-8 sm:w-8 ${
												currentItem.status === 'good'
													? 'text-emerald-600'
													: 'text-gray-400 group-hover:text-emerald-500'
											}`}
										/>
										<span
											class={`text-xs font-bold sm:text-sm ${
												currentItem.status === 'good' ? 'text-emerald-700' : 'text-gray-700'
											}`}>Good</span
										>
										{#if currentItem.status === 'good'}
											<div
												class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500"
											>
												<svg class="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
													<path
														fill-rule="evenodd"
														d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
														clip-rule="evenodd"
													/>
												</svg>
											</div>
										{/if}
									</button>

									<button
										type="button"
										class={`group relative rounded-xl border-2 p-3 text-center transition-all hover:scale-105 active:scale-95 sm:p-4 ${
											currentItem.status === 'damaged'
												? 'border-amber-500 bg-amber-50 shadow-lg shadow-amber-500/20'
												: 'border-gray-200 bg-white hover:border-amber-300 hover:bg-amber-50'
										}`}
										onclick={() => setInspectionStatus(currentItem.itemId, 'damaged')}
										aria-pressed={currentItem.status === 'damaged'}
									>
										<AlertTriangle
											class={`mx-auto mb-1 h-6 w-6 transition-colors sm:mb-2 sm:h-8 sm:w-8 ${
												currentItem.status === 'damaged'
													? 'text-amber-600'
													: 'text-gray-400 group-hover:text-amber-500'
											}`}
										/>
										<span
											class={`text-xs font-bold sm:text-sm ${
												currentItem.status === 'damaged' ? 'text-amber-700' : 'text-gray-700'
											}`}>Damaged</span
										>
										{#if currentItem.status === 'damaged'}
											<div
												class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500"
											>
												<svg class="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
													<path
														fill-rule="evenodd"
														d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
														clip-rule="evenodd"
													/>
												</svg>
											</div>
										{/if}
									</button>

									<button
										type="button"
										class={`group relative rounded-xl border-2 p-3 text-center transition-all hover:scale-105 active:scale-95 sm:p-4 ${
											currentItem.status === 'missing'
												? 'border-rose-500 bg-rose-50 shadow-lg shadow-rose-500/20'
												: 'border-gray-200 bg-white hover:border-rose-300 hover:bg-rose-50'
										}`}
										onclick={() => setInspectionStatus(currentItem.itemId, 'missing')}
										aria-pressed={currentItem.status === 'missing'}
									>
										<XCircle
											class={`mx-auto mb-1 h-6 w-6 transition-colors sm:mb-2 sm:h-8 sm:w-8 ${
												currentItem.status === 'missing'
													? 'text-rose-600'
													: 'text-gray-400 group-hover:text-rose-500'
											}`}
										/>
										<span
											class={`text-xs font-bold sm:text-sm ${
												currentItem.status === 'missing' ? 'text-rose-700' : 'text-gray-700'
											}`}>Missing</span
										>
										{#if currentItem.status === 'missing'}
											<div
												class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500"
											>
												<svg class="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
													<path
														fill-rule="evenodd"
														d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
														clip-rule="evenodd"
													/>
												</svg>
											</div>
										{/if}
									</button>
								</div>
							</div>

							<!-- Inspected Quantity -->
							{#if currentItem.status}
								<div
									class="mb-5 rounded-xl border-2 p-4 transition-colors {currentItem.status ===
									'good'
										? 'border-emerald-200 bg-emerald-50'
										: currentItem.status === 'damaged'
											? 'border-amber-200 bg-amber-50'
											: 'border-rose-200 bg-rose-50'}"
								>
									<label
										for="inspected-quantity"
										class="mb-1.5 block text-sm font-bold {currentItem.status === 'good'
											? 'text-emerald-900'
											: currentItem.status === 'damaged'
												? 'text-amber-900'
												: 'text-rose-900'}"
									>
										{#if currentItem.status === 'good'}
											Items in Good Condition <span class="text-emerald-500">*</span>
										{:else if currentItem.status === 'damaged'}
											Reported Damaged Quantity <span class="text-rose-500">*</span>
										{:else}
											Reported Missing Quantity <span class="text-rose-500">*</span>
										{/if}
									</label>

									<p
										class="mb-3 text-xs leading-relaxed {currentItem.status === 'good'
											? 'text-emerald-700'
											: currentItem.status === 'damaged'
												? 'text-amber-700'
												: 'text-rose-700'}"
									>
										{#if currentItem.status === 'good'}
											Number of items returned meeting standard operational condition.
										{:else if currentItem.status === 'damaged'}
											Number of items returned with physical damage or operational defects. <span
												class="font-semibold"
												>The student is liable for providing an exact replacement.</span
											>
										{:else}
											Number of items not returned. <span class="font-semibold"
												>The student is liable for providing an exact replacement to clear this
												discrepancy.</span
											>
										{/if}
									</p>

									<input
										id="inspected-quantity"
										type="number"
										min="1"
										step="1"
										bind:value={currentItem.reportedQuantity}
										class="block w-full rounded-lg border-2 bg-white px-4 py-2.5 text-sm font-medium shadow-sm focus:ring-2 focus:outline-none {currentItem.status ===
										'good'
											? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20'
											: currentItem.status === 'damaged'
												? 'border-amber-300 focus:border-amber-500 focus:ring-amber-500/20'
												: 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20'}"
										placeholder="Enter quantity"
										required
									/>

									<div
										class="mt-3 flex items-center justify-between border-t {currentItem.status ===
										'good'
											? 'border-emerald-200/60'
											: currentItem.status === 'damaged'
												? 'border-amber-200/60'
												: 'border-rose-200/60'} pt-3 text-xs"
									>
										{#if currentItem.status === 'good'}
											<span class="text-emerald-800">
												<span class="font-semibold">Total Borrowed:</span>
												{currentItem.quantity}
											</span>
											{#if currentItem.reportedQuantity !== currentItem.quantity}
												<span
													class="font-bold {currentItem.reportedQuantity - currentItem.quantity > 0
														? 'text-blue-600'
														: 'text-orange-600'}"
												>
													Variance: {currentItem.reportedQuantity - currentItem.quantity > 0
														? '+'
														: ''}{currentItem.reportedQuantity - currentItem.quantity}
												</span>
											{/if}
										{:else}
											<span
												class={currentItem.status === 'damaged'
													? 'text-amber-800'
													: 'text-rose-800'}
											>
												<span class="font-semibold">Total Borrowed:</span>
												{currentItem.quantity}
											</span>
											<div
												class="flex items-center gap-2 {currentItem.status === 'damaged'
													? 'text-amber-900'
													: 'text-rose-900'}"
											>
												<label for="replacement-qty-{currentItem.itemId}" class="font-bold"
													>Required Replacement:</label
												>
												<input
													id="replacement-qty-{currentItem.itemId}"
													type="number"
													min="0"
													step="1"
													bind:value={currentItem.replacementQuantity}
													class="w-16 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs font-bold shadow-sm focus:ring-2 focus:outline-none {currentItem.status ===
													'damaged'
														? 'focus:border-amber-500 focus:ring-amber-500/20'
														: 'focus:border-rose-500 focus:ring-rose-500/20'}"
													title="Edit to waive or modify the chargeable replacement amount"
												/>
											</div>
										{/if}
									</div>
								</div>
							{/if}

							<!-- Notes -->
							<div>
								<label for="notes" class="mb-2 block text-sm font-bold text-gray-900">
									Notes <span class="font-normal text-gray-500">(Optional)</span>
								</label>
								<textarea
									id="notes"
									bind:value={currentItem.notes}
									rows="3"
									class="block w-full rounded-lg border-2 border-gray-200 px-4 py-2.5 text-sm shadow-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
									placeholder={currentItem.status === 'good'
										? 'Any observations about this item...'
										: 'Describe the damage or circumstances of loss...'}
								></textarea>
							</div>
						</div>
					{/if}

					<!-- Summary Alert -->
					{#if allInspected && hasIssues}
						<div class="mt-6 rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
							<div class="flex items-start gap-3">
								<AlertTriangle class="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
								<div class="flex-1">
									<p class="font-bold text-amber-900">Replacement obligations will be created</p>
									<p class="mt-1 text-sm text-amber-800">
										Items marked as damaged or missing will generate replacement obligations for the
										student.
										<span class="font-semibold"
											>Total quantity to replace: {inspections
												.filter((i) => i.status === 'damaged' || i.status === 'missing')
												.reduce((sum, i) => sum + i.replacementQuantity, 0)
												.toLocaleString()}</span
										>
									</p>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Footer -->
			<div
				class="sticky bottom-0 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-6 sm:py-5 lg:px-8"
			>
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
							class="flex-1 rounded-lg border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
								class="flex-1 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
							>
								{#if submitting}
									<span class="flex items-center justify-center gap-2">
										<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
											<circle
												class="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												stroke-width="4"
											></circle>
											<path
												class="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											></path>
										</svg>
										<span class="xs:inline hidden">Processing...</span>
									</span>
								{:else}
									Complete
								{/if}
							</button>
						{/if}
					</div>
				</div>

				<!-- Desktop Layout (single row) -->
				<div class="hidden items-center justify-between gap-3 sm:flex">
					<!-- Cancel Button (left side) -->
					<button
						type="button"
						onclick={onCancel}
						disabled={submitting}
						class="rounded-lg border-2 border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
								class="rounded-lg bg-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-600/30 transition-all hover:bg-pink-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
							>
								{#if submitting}
									<span class="flex items-center justify-center gap-2">
										<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
											<circle
												class="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												stroke-width="4"
											></circle>
											<path
												class="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											></path>
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
