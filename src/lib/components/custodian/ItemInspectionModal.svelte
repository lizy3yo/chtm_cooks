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
				dueDate?: string;
				additionalReturned?: number;
			}>
		) => Promise<void>;
		onCancel: () => void;
	}

	let { items, requestId, onSubmit, onCancel }: Props = $props();

	type UnitCondition = 'good' | 'damaged' | 'missing' | null;

	interface UnitRow {
		unitIndex: number; // 1-based display label
		condition: UnitCondition;
	}

	interface ItemInspection {
		itemId: string;
		name: string;
		quantity: number;
		picture?: string | null;
		status: 'good' | 'damaged' | 'missing' | null;
		notes: string;
		reportedQuantity: number;
		replacementQuantity: number;
		additionalReturned: number; // units returned beyond the expected quantity (over-return)
		dueDate?: string; // date needed to resolve the obligation
		unitRows: UnitRow[];
	}

	function buildUnitRows(quantity: number): UnitRow[] {
		return Array.from({ length: quantity }, (_, i) => ({ unitIndex: i + 1, condition: null }));
	}

	/** Derive the aggregate status from unit rows (worst-case wins: missing > damaged > good). */
	function deriveStatus(rows: UnitRow[]): 'good' | 'damaged' | 'missing' | null {
		if (rows.some((r) => r.condition === null)) return null;
		if (rows.some((r) => r.condition === 'missing')) return 'missing';
		if (rows.some((r) => r.condition === 'damaged')) return 'damaged';
		return 'good';
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
					replacementQuantity: 0,
					additionalReturned: 0,
					dueDate: '',
					unitRows: buildUnitRows(item.quantity)
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
							replacementQuantity: 0,
							additionalReturned: 0,
							dueDate: '',
							unitRows: buildUnitRows(item.quantity)
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

	function setUnitCondition(itemId: string, unitIndex: number, condition: UnitCondition) {
		const inspection = getInspection(itemId);
		inspection.unitRows[unitIndex].condition = condition;
		// Sync aggregate fields from rows
		const derived = deriveStatus(inspection.unitRows);
		inspection.status = derived;
		inspection.reportedQuantity = inspection.unitRows.filter((r) => r.condition !== null).length;
		// Always reset to the exact floor (damaged + missing count) when any row changes
		inspection.replacementQuantity = inspection.unitRows.filter(
			(r) => r.condition === 'damaged' || r.condition === 'missing'
		).length;
		// Reset over-return when rows change — only valid once all rows are confirmed Good
		inspection.additionalReturned = 0;
	}

	function bulkSetCondition(itemId: string, condition: UnitCondition) {
		const inspection = getInspection(itemId);
		inspection.unitRows = inspection.unitRows.map((r) => ({ ...r, condition }));
		const derived = deriveStatus(inspection.unitRows);
		inspection.status = derived;
		inspection.reportedQuantity = inspection.unitRows.length;
		inspection.replacementQuantity = inspection.unitRows.filter(
			(r) => r.condition === 'damaged' || r.condition === 'missing'
		).length;
		inspection.additionalReturned = 0;
	}

	const allInspected = $derived(
		inspections.every((i) => i.unitRows.every((r) => r.condition !== null))
	);
	const hasIssues = $derived(
		inspections.some((i) => i.status === 'damaged' || i.status === 'missing')
	);

	const inspectedCount = $derived(inspections.filter((i) => i.status !== null).length);

	// Professional Lucide icon fallback for missing item images
	function getItemIcon(name: string) {
		const normalized = name.toLowerCase();
		if (normalized.includes('knife')) return CheckCircle2;
		if (normalized.includes('bowl')) return Package;
		if (normalized.includes('scale')) return AlertTriangle;
		if (normalized.includes('mixer')) return Package;
		if (normalized.includes('processor')) return Package;
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

		// Validate all unit rows are assigned
		for (const inspection of inspections) {
			const unassigned = inspection.unitRows.filter((r) => r.condition === null).length;
			if (unassigned > 0) {
				error = `Please assign a condition to all ${inspection.quantity} unit(s) of "${inspection.name}".`;
				return;
			}
		}

		submitting = true;
		error = null;

		try {
			const payload = inspections.map((i) => {
				const replacementQty = i.replacementQuantity;
				const derivedStatus = deriveStatus(i.unitRows)!;
				const totalReturned = i.unitRows.filter((r) => r.condition !== null).length + i.additionalReturned;

				const baseInspection: any = {
					itemId: i.itemId,
					status: derivedStatus,
					notes: i.notes || '',
					additionalReturned: i.additionalReturned || 0,
					// Only send replacementQuantity for damaged/missing — server rejects 0 or undefined for good
					...(derivedStatus !== 'good' && replacementQty > 0 ? { replacementQuantity: replacementQty } : {}),
					...(i.dueDate ? { dueDate: i.dueDate } : {})
				};
				
				// Append per-unit breakdown to notes for audit trail
				const breakdown = i.unitRows.map((r) => `Unit ${r.unitIndex}: ${r.condition}`).join(', ');
				const overReturn = i.additionalReturned > 0 ? ` Over-return: +${i.additionalReturned}` : '';
				baseInspection.notes = `[Unit breakdown: ${breakdown}${overReturn}]${i.notes ? ' ' + i.notes : ''}`;

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
										<span class="text-sm font-medium text-gray-600">Expected Return Qty:</span>
										<span class="inline-flex min-w-10 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm font-bold text-gray-900">
											{currentItem.quantity}
										</span>
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

							<!-- Per-Unit Condition Table -->
							<div class="mb-5">
								<div class="mb-3 flex items-center justify-between">
									<span class="text-sm font-bold text-gray-900">
										Unit Condition <span class="text-pink-500">*</span>
									</span>
									<span class="text-xs text-gray-500">
										{currentItem.unitRows.filter((r) => r.condition !== null).length} / {currentItem.quantity} inspected
									</span>
								</div>

								<div class="overflow-hidden rounded-xl border border-gray-200">
									<!-- Bulk Action Bar (only shown when quantity > 1) -->
									{#if currentItem.quantity > 1}
										<div class="flex items-center gap-2 border-b border-gray-200 bg-gray-50/80 px-4 py-2">
											<span class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Mark all:</span>
											<button
												type="button"
												onclick={() => bulkSetCondition(currentItem.itemId, 'good')}
												class="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 active:scale-95"
											>
												<CheckCircle2 class="h-3 w-3" /> Good
											</button>
											<button
												type="button"
												onclick={() => bulkSetCondition(currentItem.itemId, 'damaged')}
												class="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-50 active:scale-95"
											>
												<AlertTriangle class="h-3 w-3" /> Damaged
											</button>
											<button
												type="button"
												onclick={() => bulkSetCondition(currentItem.itemId, 'missing')}
												class="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 active:scale-95"
											>
												<XCircle class="h-3 w-3" /> Missing
											</button>
										</div>
									{/if}

									<!-- Table Header -->
									<div class="grid grid-cols-[48px_1fr_1fr_1fr] border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
										<span class="text-center">Unit</span>
										<span class="text-center">Good</span>
										<span class="text-center">Damaged</span>
										<span class="text-center">Missing</span>
									</div>

									<!-- Unit Rows -->
									<div class="divide-y divide-gray-100">
										{#each currentItem.unitRows as row, rowIdx}
											<div class="grid grid-cols-[48px_1fr_1fr_1fr] items-center px-4 py-3 transition-colors {row.condition ? 'bg-white' : 'bg-gray-50/50'}">
												<!-- Unit label -->
												<span class="text-center text-xs font-semibold text-gray-500">#{row.unitIndex}</span>

												<!-- Good -->
												<div class="flex justify-center">
													<button
														type="button"
														onclick={() => setUnitCondition(currentItem.itemId, rowIdx, 'good')}
														aria-pressed={row.condition === 'good'}
														aria-label="Mark unit {row.unitIndex} as good"
														class="flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all active:scale-95 {row.condition === 'good' ? 'border-emerald-500 bg-emerald-500 shadow-md shadow-emerald-500/30' : 'border-gray-200 bg-white hover:border-emerald-400 hover:bg-emerald-50'}"
													>
														<CheckCircle2 class="h-4 w-4 {row.condition === 'good' ? 'text-white' : 'text-gray-400'}" />
													</button>
												</div>

												<!-- Damaged -->
												<div class="flex justify-center">
													<button
														type="button"
														onclick={() => setUnitCondition(currentItem.itemId, rowIdx, 'damaged')}
														aria-pressed={row.condition === 'damaged'}
														aria-label="Mark unit {row.unitIndex} as damaged"
														class="flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all active:scale-95 {row.condition === 'damaged' ? 'border-amber-500 bg-amber-500 shadow-md shadow-amber-500/30' : 'border-gray-200 bg-white hover:border-amber-400 hover:bg-amber-50'}"
													>
														<AlertTriangle class="h-4 w-4 {row.condition === 'damaged' ? 'text-white' : 'text-gray-400'}" />
													</button>
												</div>

												<!-- Missing -->
												<div class="flex justify-center">
													<button
														type="button"
														onclick={() => setUnitCondition(currentItem.itemId, rowIdx, 'missing')}
														aria-pressed={row.condition === 'missing'}
														aria-label="Mark unit {row.unitIndex} as missing"
														class="flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all active:scale-95 {row.condition === 'missing' ? 'border-rose-500 bg-rose-500 shadow-md shadow-rose-500/30' : 'border-gray-200 bg-white hover:border-rose-400 hover:bg-rose-50'}"
													>
														<XCircle class="h-4 w-4 {row.condition === 'missing' ? 'text-white' : 'text-gray-400'}" />
													</button>
												</div>
											</div>
										{/each}
									</div>

									<!-- Summary Footer -->
									{#if currentItem.unitRows.some((r) => r.condition !== null)}
										{@const goodCount = currentItem.unitRows.filter((r) => r.condition === 'good').length}
										{@const damagedCount = currentItem.unitRows.filter((r) => r.condition === 'damaged').length}
										{@const missingCount = currentItem.unitRows.filter((r) => r.condition === 'missing').length}
										{@const allGood = goodCount === currentItem.quantity && damagedCount === 0 && missingCount === 0}
										<div class="flex flex-wrap items-center gap-3 border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-xs">
											{#if goodCount > 0}
												<span class="flex items-center gap-1 font-semibold text-emerald-700">
													<CheckCircle2 class="h-3.5 w-3.5" /> {goodCount} Good
												</span>
											{/if}
											{#if damagedCount > 0}
												<span class="flex items-center gap-1 font-semibold text-amber-700">
													<AlertTriangle class="h-3.5 w-3.5" /> {damagedCount} Damaged
												</span>
											{/if}
											{#if missingCount > 0}
												<span class="flex items-center gap-1 font-semibold text-rose-700">
													<XCircle class="h-3.5 w-3.5" /> {missingCount} Missing
												</span>
											{/if}

											{#if allGood}
												<!-- Over-return input: only relevant when all units are Good -->
												<div class="ml-auto flex items-center gap-2">
													<label
														for="additional-returned-{currentItem.itemId}"
														class="font-bold text-gray-700"
													>
														Additional items returned:
													</label>
													<input
														id="additional-returned-{currentItem.itemId}"
														type="number"
														min="0"
														step="1"
														bind:value={currentItem.additionalReturned}
														oninput={(e) => {
															const val = parseInt(e.currentTarget.value);
															if (isNaN(val) || val < 0) {
																currentItem.additionalReturned = 0;
																e.currentTarget.value = '0';
															}
														}}
														class="w-14 rounded-lg border-2 border-gray-300 bg-white px-2 py-0.5 text-xs font-bold text-gray-900 shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
														title="Enter the number of extra units returned beyond the expected quantity."
													/>
												</div>
												{#if currentItem.additionalReturned > 0}
													<span class="ml-2 font-semibold text-blue-600">
														Over-return: +{currentItem.additionalReturned}
													</span>
												{/if}
											{:else if damagedCount > 0 || missingCount > 0}
												<div class="ml-auto flex items-center gap-2">
													<label
														for="replacement-qty-{currentItem.itemId}"
														class="font-bold text-gray-700"
													>
														Replacement required:
													</label>
													<input
														id="replacement-qty-{currentItem.itemId}"
														type="number"
														min={damagedCount + missingCount}
														step="1"
														bind:value={currentItem.replacementQuantity}
														oninput={(e) => {
															const val = parseInt(e.currentTarget.value);
															const floor = damagedCount + missingCount;
															if (!isNaN(val) && val < floor) {
																currentItem.replacementQuantity = floor;
																e.currentTarget.value = String(floor);
															}
														}}
														class="w-14 rounded-lg border-2 border-gray-300 bg-white px-2 py-0.5 text-xs font-bold text-gray-900 shadow-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
														title="Minimum is the number of damaged + missing units. Increase only if additional replacements are required."
													/>
												</div>
											{/if}
										</div>
									{/if}
								</div>

								<!-- Liability notice when issues exist -->
								{#if currentItem.unitRows.some((r) => r.condition === 'damaged' || r.condition === 'missing')}
									<p class="mt-2 text-xs text-amber-700">
										<span class="font-semibold">Note:</span> The student is liable for providing an exact replacement for all damaged or missing units.
									</p>
								{/if}
							</div>

							<!-- Due Date (for replacements) -->
							{#if currentItem.unitRows.some((r) => r.condition === 'damaged' || r.condition === 'missing')}
								<div class="mb-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
									<label for="dueDate-{currentItem.itemId}" class="mb-1.5 block text-sm font-bold text-gray-900">
										Date needed to resolve this
									</label>
									<p class="mb-3 text-xs text-gray-600">
										Set a deadline for the student to provide the exact replacement.
									</p>
									<input
										id="dueDate-{currentItem.itemId}"
										type="date"
										min={new Date().toLocaleDateString('en-CA')}
										onkeydown={(e) => e.preventDefault()}
										bind:value={currentItem.dueDate}
										class="block w-full max-w-xs rounded-lg border-2 border-gray-200 px-4 py-2.5 text-sm shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none"
									/>
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
