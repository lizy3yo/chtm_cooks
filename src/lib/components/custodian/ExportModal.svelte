<script lang="ts">
	import { Download, Sliders, LayoutGrid, CheckSquare } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import { untrack } from 'svelte';

	interface Props {
		show?: boolean;
		items?: any[];
		isExporting?: boolean;
		onExport?: (selections: {
			sheets: string[];
			columns: string[];
			categories: string[];
			specifications: string[];
			tools: string[];
		}) => void;
	}

	let {
		show = $bindable(false),
		items = [],
		isExporting = false,
		onExport
	}: Props = $props();

	// Local states for sheet checkboxes
	let sheets = $state({
		'all-items': true,
		'items-tab': false,
		'required-tab': false,
		'low-stock': false
	});

	// Local states for column checkboxes
	let columns = $state({
		category: false,
		specification: false,
		tools: false,
		image: false
	});

	// Filter items based on selected sheets to populate sub-selection lists dynamically
	const activeItemsForDrawers = $derived.by(() => {
		// If all-items or items-tab is selected, or if no sheets are selected at all, use all items
		if (
			sheets['all-items'] ||
			sheets['items-tab'] ||
			(!sheets['all-items'] && !sheets['items-tab'] && !sheets['required-tab'] && !sheets['low-stock'])
		) {
			return items;
		}

		// Otherwise, get the union of items in required-tab and low-stock
		const matchingItems = new Set<any>();

		if (sheets['required-tab']) {
			items.forEach((item) => {
				if (item.isrequired) {
					matchingItems.add(item);
				}
			});
		}

		if (sheets['low-stock']) {
			items.forEach((item) => {
				const total = (item.quantity ?? 0) + (item.donations ?? 0);
				if (total <= 5) {
					matchingItems.add(item);
				}
			});
		}

		return Array.from(matchingItems);
	});

	// Derive unique lists of values from active items
	const uniqueCategories = $derived(
		Array.from(new Set(activeItemsForDrawers.map((item) => item.category?.trim()).filter(Boolean))).sort() as string[]
	);
	const uniqueSpecifications = $derived(
		Array.from(new Set(activeItemsForDrawers.map((item) => item.specification?.trim()).filter(Boolean))).sort() as string[]
	);
	const uniqueTools = $derived(
		Array.from(new Set(activeItemsForDrawers.map((item) => item.toolsOrEquipment?.trim()).filter(Boolean))).sort() as string[]
	);

	// Sub-selections dictionaries
	let selectedCategories = $state<Record<string, boolean>>({});
	let selectedSpecifications = $state<Record<string, boolean>>({});
	let selectedTools = $state<Record<string, boolean>>({});

	// Reset selections to defaults whenever the modal is opened
	$effect(() => {
		if (show) {
			untrack(() => {
				sheets['all-items'] = true;
				sheets['items-tab'] = false;
				sheets['required-tab'] = false;
				sheets['low-stock'] = false;

				columns.category = false;
				columns.specification = false;
				columns.tools = false;
				columns.image = false;
			});
		}
	});

	// Initialize and sync sub-selections whenever unique collections change
	$effect(() => {
		const cats = uniqueCategories;
		untrack(() => {
			const newCat: Record<string, boolean> = {};
			cats.forEach((cat) => {
				newCat[cat] = selectedCategories[cat] ?? true;
			});
			selectedCategories = newCat;
		});
	});

	$effect(() => {
		const specs = uniqueSpecifications;
		untrack(() => {
			const newSpec: Record<string, boolean> = {};
			specs.forEach((spec) => {
				newSpec[spec] = selectedSpecifications[spec] ?? true;
			});
			selectedSpecifications = newSpec;
		});
	});

	$effect(() => {
		const ts = uniqueTools;
		untrack(() => {
			const newTools: Record<string, boolean> = {};
			ts.forEach((t) => {
				newTools[t] = selectedTools[t] ?? true;
			});
			selectedTools = newTools;
		});
	});

	// Derived selection checks to enable/disable generate button
	const hasAnySheet = $derived(
		sheets['all-items'] || sheets['items-tab'] || sheets['required-tab'] || sheets['low-stock']
	);

	// Select / clear helper for sheets
	function toggleAllSheets(val: boolean) {
		sheets['all-items'] = val;
		sheets['items-tab'] = val;
		sheets['required-tab'] = val;
		sheets['low-stock'] = val;
	}

	// Select / clear helper for columns
	function toggleAllColumns(val: boolean) {
		columns.category = val;
		columns.specification = val;
		columns.tools = val;
		columns.image = val;
	}

	// Select / clear helper for sub-items
	function toggleSubItems(type: 'category' | 'specification' | 'tools', val: boolean) {
		if (type === 'category') {
			uniqueCategories.forEach((cat) => (selectedCategories[cat] = val));
		} else if (type === 'specification') {
			uniqueSpecifications.forEach((spec) => (selectedSpecifications[spec] = val));
		} else if (type === 'tools') {
			uniqueTools.forEach((t) => (selectedTools[t] = val));
		}
	}

	function handleExport() {
		const selectedSheets = Object.entries(sheets)
			.filter(([_, selected]) => selected)
			.map(([sheet, _]) => sheet);

		const selectedColumns = Object.entries(columns)
			.filter(([_, selected]) => selected)
			.map(([col, _]) => col);

		// If a column is excluded, don't filter by its values (which is equivalent to all allowed)
		const categories = columns.category
			? Object.entries(selectedCategories)
					.filter(([_, selected]) => selected)
					.map(([cat, _]) => cat)
			: [];

		const specifications = columns.specification
			? Object.entries(selectedSpecifications)
					.filter(([_, selected]) => selected)
					.map(([spec, _]) => spec)
			: [];

		const toolsList = columns.tools
			? Object.entries(selectedTools)
					.filter(([_, selected]) => selected)
					.map(([t, _]) => t)
			: [];

		if (onExport) {
			onExport({
				sheets: selectedSheets,
				columns: selectedColumns,
				categories,
				specifications,
				tools: toolsList
			});
		}
	}
</script>

{#if show}
	<div
		class="fixed inset-0 z-50 overflow-y-auto animate-fadeIn"
		role="dialog"
		aria-modal="true"
		aria-labelledby="export-modal-title"
	>
		<!-- Backdrop -->
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
			role="button"
			tabindex="0"
			aria-label="Close export modal"
			onclick={() => (show = false)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					show = false;
				}
			}}
		></div>

		<div class="flex min-h-full items-center justify-center p-4">
			<div
				class="animate-scaleIn relative z-50 w-full max-w-lg overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl transition-all"
			>
				<!-- Modal Header -->
				<div
					class="flex items-center justify-between border-b border-gray-200 bg-linear-to-r from-gray-50 to-white px-6 py-4"
				>
					<div>
						<h2
							id="export-modal-title"
							class="text-md flex items-center gap-2 font-bold text-gray-900"
						>
							<Download class="h-5 w-5 text-pink-600" />
							Export Inventory Report
						</h2>
						<p class="mt-0.5 text-xs text-gray-500">Configure your professional Excel spreadsheet export</p>
					</div>
					<button
						onclick={() => (show = false)}
						class="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
						aria-label="Close modal"
						disabled={isExporting}
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
				<div class="max-h-[60vh] space-y-6 overflow-y-auto p-6">
					<!-- Sheets Section -->
					<div class="space-y-3">
						<div class="flex items-center justify-between border-b border-gray-100 pb-2">
							<h3 class="text-sm font-bold flex items-center gap-1.5 text-gray-800">
								<LayoutGrid class="h-4 w-4 text-pink-500" />
								Worksheets to Include
							</h3>
							<div class="flex gap-2">
								<button
									type="button"
									onclick={() => toggleAllSheets(true)}
									class="text-xs font-semibold text-pink-600 hover:text-pink-700 transition-colors"
								>
									Select All
								</button>
								<span class="text-gray-300 text-xs">|</span>
								<button
									type="button"
									onclick={() => toggleAllSheets(false)}
									class="text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
								>
									Clear
								</button>
							</div>
						</div>

						<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
							<!-- All Items -->
							<label class="flex items-start gap-3 cursor-pointer rounded-xl border border-gray-200 p-3 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none">
								<input
									type="checkbox"
									bind:checked={sheets['all-items']}
									class="mt-1 h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
								/>
								<div class="min-w-0 flex-1">
									<p class="text-xs font-bold text-gray-900">All Items</p>
									<p class="text-[11px] leading-relaxed text-gray-500">Complete items database dump</p>
								</div>
							</label>

							<!-- Items Tab as a Whole -->
							<label class="flex items-start gap-3 cursor-pointer rounded-xl border border-gray-200 p-3 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none">
								<input
									type="checkbox"
									bind:checked={sheets['items-tab']}
									class="mt-1 h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
								/>
								<div class="min-w-0 flex-1">
									<p class="text-xs font-bold text-gray-900">Items Tab as a Whole</p>
									<p class="text-[11px] leading-relaxed text-gray-500">Currently active inventory items</p>
								</div>
							</label>

							<!-- Required Items -->
							<label class="flex items-start gap-3 cursor-pointer rounded-xl border border-gray-200 p-3 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none">
								<input
									type="checkbox"
									bind:checked={sheets['required-tab']}
									class="mt-1 h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
								/>
								<div class="min-w-0 flex-1">
									<p class="text-xs font-bold text-gray-900">Required</p>
									<p class="text-[11px] leading-relaxed text-gray-500">Items marked as required</p>
								</div>
							</label>

							<!-- Low Stock -->
							<label class="flex items-start gap-3 cursor-pointer rounded-xl border border-gray-200 p-3 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none">
								<input
									type="checkbox"
									bind:checked={sheets['low-stock']}
									class="mt-1 h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
								/>
								<div class="min-w-0 flex-1">
									<p class="text-xs font-bold text-gray-900">Low & Out of Stock</p>
									<p class="text-[11px] leading-relaxed text-gray-500">Items needing restocking or immediate attention</p>
								</div>
							</label>
						</div>
					</div>

					<!-- Columns Section -->
					<div class="space-y-4">
						<div class="flex items-center justify-between border-b border-gray-100 pb-2">
							<h3 class="text-sm font-bold flex items-center gap-1.5 text-gray-800">
								<Sliders class="h-4 w-4 text-pink-500" />
								Optional Columns to Include
							</h3>
							<div class="flex gap-2">
								<button
									type="button"
									onclick={() => toggleAllColumns(true)}
									class="text-xs font-semibold text-pink-600 hover:text-pink-700 transition-colors"
								>
									Select All
								</button>
								<span class="text-gray-300 text-xs">|</span>
								<button
									type="button"
									onclick={() => toggleAllColumns(false)}
									class="text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
								>
									Clear
								</button>
							</div>
						</div>

						<!-- Column Checkboxes Row -->
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
							<!-- Category -->
							<label class="flex items-center gap-2 cursor-pointer rounded-xl border border-gray-200 px-2 py-2.5 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none">
								<input
									type="checkbox"
									bind:checked={columns.category}
									class="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
								/>
								<span class="text-[11px] font-semibold text-gray-800 leading-tight">Category</span>
							</label>

							<!-- Specification -->
							<label class="flex items-center gap-2 cursor-pointer rounded-xl border border-gray-200 px-2 py-2.5 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none">
								<input
									type="checkbox"
									bind:checked={columns.specification}
									class="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
								/>
								<span class="text-[11px] font-semibold text-gray-800 leading-tight">Specification</span>
							</label>

							<!-- Tools / Equipment -->
							<label class="flex items-center gap-2 cursor-pointer rounded-xl border border-gray-200 px-2 py-2.5 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none">
								<input
									type="checkbox"
									bind:checked={columns.tools}
									class="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
								/>
								<span class="text-[11px] font-semibold text-gray-800 leading-tight">Tools / Equipment</span>
							</label>

							<!-- Image / Picture -->
							<label class="flex items-center gap-2 cursor-pointer rounded-xl border border-gray-200 px-2 py-2.5 hover:bg-pink-50/20 hover:border-pink-200 transition-all select-none">
								<input
									type="checkbox"
									bind:checked={columns.image}
									class="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
								/>
								<span class="text-[11px] font-semibold text-gray-800 leading-tight">Image</span>
							</label>
						</div>

						<!-- Categories Sub-Selection Drawer -->
						{#if columns.category && uniqueCategories.length > 0}
							<div transition:slide={{ duration: 250 }} class="rounded-xl border border-pink-100 bg-pink-50/10 p-4 space-y-2">
								<div class="flex items-center justify-between border-b border-pink-100/50 pb-1.5">
									<h4 class="text-xs font-bold text-pink-900">
										Select Categories ({Object.values(selectedCategories).filter(Boolean).length}/{uniqueCategories.length})
									</h4>
									<div class="flex gap-2">
										<button type="button" onclick={() => toggleSubItems('category', true)} class="text-[10px] font-semibold text-pink-600 hover:text-pink-700">All</button>
										<span class="text-gray-300 text-[10px]">|</span>
										<button type="button" onclick={() => toggleSubItems('category', false)} class="text-[10px] font-semibold text-gray-500 hover:text-gray-700">None</button>
									</div>
								</div>
								<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 max-h-36 overflow-y-auto pr-1">
									{#each uniqueCategories as cat}
										<label class="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white border border-transparent hover:border-pink-100/30 transition-all select-none">
											<input
												type="checkbox"
												bind:checked={selectedCategories[cat]}
												class="h-3.5 w-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
											/>
											<span class="text-[11px] text-gray-700 truncate" title={cat}>{cat}</span>
										</label>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Specifications Sub-Selection Drawer -->
						{#if columns.specification && uniqueSpecifications.length > 0}
							<div transition:slide={{ duration: 250 }} class="rounded-xl border border-pink-100 bg-pink-50/10 p-4 space-y-2">
								<div class="flex items-center justify-between border-b border-pink-100/50 pb-1.5">
									<h4 class="text-xs font-bold text-pink-900">
										Select Specifications ({Object.values(selectedSpecifications).filter(Boolean).length}/{uniqueSpecifications.length})
									</h4>
									<div class="flex gap-2">
										<button type="button" onclick={() => toggleSubItems('specification', true)} class="text-[10px] font-semibold text-pink-600 hover:text-pink-700">All</button>
										<span class="text-gray-300 text-[10px]">|</span>
										<button type="button" onclick={() => toggleSubItems('specification', false)} class="text-[10px] font-semibold text-gray-500 hover:text-gray-700">None</button>
									</div>
								</div>
								<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 max-h-36 overflow-y-auto pr-1">
									{#each uniqueSpecifications as spec}
										<label class="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white border border-transparent hover:border-pink-100/30 transition-all select-none">
											<input
												type="checkbox"
												bind:checked={selectedSpecifications[spec]}
												class="h-3.5 w-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
											/>
											<span class="text-[11px] text-gray-700 truncate" title={spec}>{spec}</span>
										</label>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Tools Sub-Selection Drawer -->
						{#if columns.tools && uniqueTools.length > 0}
							<div transition:slide={{ duration: 250 }} class="rounded-xl border border-pink-100 bg-pink-50/10 p-4 space-y-2">
								<div class="flex items-center justify-between border-b border-pink-100/50 pb-1.5">
									<h4 class="text-xs font-bold text-pink-900">
										Select Tools / Equipment ({Object.values(selectedTools).filter(Boolean).length}/{uniqueTools.length})
									</h4>
									<div class="flex gap-2">
										<button type="button" onclick={() => toggleSubItems('tools', true)} class="text-[10px] font-semibold text-pink-600 hover:text-pink-700">All</button>
										<span class="text-gray-300 text-[10px]">|</span>
										<button type="button" onclick={() => toggleSubItems('tools', false)} class="text-[10px] font-semibold text-gray-500 hover:text-gray-700">None</button>
									</div>
								</div>
								<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 max-h-36 overflow-y-auto pr-1">
									{#each uniqueTools as t}
										<label class="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white border border-transparent hover:border-pink-100/30 transition-all select-none">
											<input
												type="checkbox"
												bind:checked={selectedTools[t]}
												class="h-3.5 w-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
											/>
											<span class="text-[11px] text-gray-700 truncate" title={t}>{t}</span>
										</label>
									{/each}
								</div>
							</div>
						{/if}
					</div>

					<!-- Format Banner -->
					<div class="rounded-xl border border-pink-100 bg-pink-50/30 p-3 flex items-start gap-2.5">
						<CheckSquare class="h-4 w-4 text-pink-600 mt-0.5 shrink-0" />
						<div class="space-y-0.5">
							<p class="text-xs font-semibold text-pink-900">Standard Excel Document (.xlsx)</p>
							<p class="text-[10px] text-pink-700 leading-relaxed">
								Exports include official College of Hospitality and Tourism Management (CHTM) Gordon College seals, formatted meta-information, and styled alternating zebra rows.
							</p>
						</div>
					</div>
				</div>

				<!-- Modal Footer -->
				<div class="flex flex-col-reverse gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
					<button
						type="button"
						onclick={() => (show = false)}
						class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
						disabled={isExporting}
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={handleExport}
						class="inline-flex items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
						disabled={isExporting || !hasAnySheet}
					>
						{#if isExporting}
							<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
							Generating...
						{:else}
							<Download class="h-4 w-4" />
							Generate Report
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
