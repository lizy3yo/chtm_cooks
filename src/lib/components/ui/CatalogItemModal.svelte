<script lang="ts">
	import type { CatalogItem, CatalogCategory } from '$lib/api/catalog';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';

	interface Props {
		/** The item to display */
		item: CatalogItem;
		/** All categories — used to resolve category name from ID */
		categories: CatalogCategory[];
		/** Called when the modal should close */
		onClose: () => void;
		/**
		 * Optional footer action button rendered to the right of "Close".
		 * Pass a snippet for role-specific actions (e.g. "Edit Item" or "Add to Request List").
		 */
		footerAction?: import('svelte').Snippet;
		/**
		 * Optional content rendered below the details grid inside the scrollable body.
		 * Used by the instructor to inject the edit form.
		 */
		editContent?: import('svelte').Snippet;
		/** When true the image overlay and name/category overlay are suppressed (edit mode) */
		isEditMode?: boolean;
		/** When true, internal inventory fields (EOM count, variance) are hidden — for student-facing views */
		hideInventoryFields?: boolean;
		/** Save error message to display */
		saveError?: string | null;
		/** Whether a save succeeded (shows success banner) */
		saveSuccess?: boolean;
		/** Footer hint text */
		footerHint?: string;
	}

	let {
		item,
		categories,
		onClose,
		footerAction,
		editContent,
		isEditMode = false,
		hideInventoryFields = false,
		saveError = null,
		saveSuccess = false,
		footerHint = ''
	}: Props = $props();

	let showFullImage = $state(false);

	function openFullImage() {
		if (item.picture) showFullImage = true;
	}
	function closeFullImage() {
		showFullImage = false;
	}

	function getCategoryName(categoryId: string | undefined): string {
		if (!categoryId) return 'Uncategorized';
		const cat = categories.find((c) => c.id === categoryId);
		return cat?.name ?? 'Uncategorized';
	}

	function getAvailabilityColor(status: string): string {
		switch (status) {
			case 'In Stock':    return 'bg-green-100 text-green-800';
			case 'Available':   return 'bg-blue-100 text-blue-800';
			case 'Low Stock':   return 'bg-yellow-100 text-yellow-800';
			case 'Out of Stock':return 'bg-red-100 text-red-800';
			case 'Maintenance': return 'bg-orange-100 text-orange-800';
			default:            return 'bg-gray-100 text-gray-800';
		}
	}

	const currentCount = $derived(item.currentCount ?? (item.quantity + (item.donations ?? 0)));
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && showFullImage) { closeFullImage(); return; }
		if (e.key === 'Escape') onClose();
	}}
/>

<!-- Modal backdrop + container -->
<div class="fixed inset-0 z-50 overflow-y-auto">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
		onclick={onClose}
		aria-hidden="true"
	></div>

	<div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="catalog-item-modal-title"
			aria-describedby="catalog-item-modal-body"
			class="relative w-full max-w-2xl sm:max-w-3xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl animate-scaleIn overflow-hidden mx-0 sm:mx-auto"
		>
			<!-- ── Header ─────────────────────────────────────────────────── -->
			<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
				<div class="px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
					<div class="flex items-start gap-3 sm:gap-4">
						<!-- Thumbnail -->
						<div class="flex h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30 overflow-hidden">
							{#if item.picture}
								<img src={item.picture} alt={item.name} class="h-full w-full object-cover" loading="lazy" />
							{:else}
								<svg class="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
								</svg>
							{/if}
						</div>

						<div class="min-w-0 flex-1">
							<h2 id="catalog-item-modal-title" class="text-base font-bold text-gray-900 sm:text-lg lg:text-xl truncate">
								{isEditMode ? 'Edit Item' : item.name}
							</h2>
							<p class="mt-0.5 text-xs text-gray-500 sm:text-sm truncate">
								{isEditMode ? 'Update equipment information' : getCategoryName(item.categoryId)}
							</p>
							<div class="mt-2 flex flex-wrap items-center gap-2">
								{#if item.isrequired}
									<span class="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-800 ring-1 ring-purple-200">
										<svg class="h-3 w-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
										REQUIRED
									</span>
								{/if}
								<span class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold {getAvailabilityColor(item.status)}">
									{item.status}
								</span>
								<span class="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
									Qty: {currentCount}
								</span>
							</div>
						</div>

						<div class="flex items-center gap-2 shrink-0">
							{#if item.picture && !isEditMode}
								<button
									type="button"
									onclick={openFullImage}
									class="rounded-lg sm:rounded-xl p-1.5 sm:p-2 border border-pink-200 text-pink-600 transition-all hover:bg-pink-50 active:scale-95"
									aria-label="View full image"
									title="View full image"
								>
									<svg class="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
									</svg>
								</button>
							{/if}
							<button
								type="button"
								onclick={onClose}
								class="rounded-lg sm:rounded-xl p-1.5 sm:p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95"
								aria-label="Close modal"
								title="Close"
							>
								<svg class="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					</div>
				</div>
			</div>

			<!-- ── Scrollable body ────────────────────────────────────────── -->
			<div class="max-h-[calc(100vh-240px)] sm:max-h-[60vh] overflow-y-auto" id="catalog-item-modal-body">
				<div class="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 space-y-6">

					<!-- Save error / success banners -->
					{#if saveError}
						<div class="rounded-xl border border-rose-200 bg-rose-50 p-4">
							<div class="flex items-center gap-3">
								<svg class="h-5 w-5 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								<p class="text-sm font-medium text-rose-800">{saveError}</p>
							</div>
						</div>
					{/if}
					{#if saveSuccess}
						<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
							<div class="flex items-center gap-3">
								<svg class="h-5 w-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
								<p class="text-sm font-medium text-emerald-800">Changes saved successfully</p>
							</div>
						</div>
					{/if}

					<!-- Item image -->
					<div class="rounded-2xl border-2 border-gray-200 bg-linear-to-br from-white to-gray-50 p-4 sm:p-5 shadow-sm">
						<div class="relative aspect-21/8 overflow-hidden rounded-xl bg-gray-100">
							{#if item.picture}
								<button
									type="button"
									onclick={openFullImage}
									class="h-full w-full cursor-zoom-in"
									title="View full image"
									disabled={isEditMode}
								>
									<img src={item.picture} alt={item.name} class="h-full w-full object-cover" loading="lazy" />
								</button>
							{:else}
								<div class="flex h-full w-full items-center justify-center">
									<ItemImagePlaceholder size="lg" />
								</div>
							{/if}
							{#if !isEditMode}
								<div class="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 via-black/20 to-transparent p-3">
									<p class="truncate text-sm font-semibold text-white sm:text-base">{item.name}</p>
									<p class="truncate text-xs text-white/85">{getCategoryName(item.categoryId)}</p>
								</div>
							{/if}
						</div>
					</div>

					<!-- Details / edit form -->
					<div class="rounded-2xl border-2 border-gray-200 bg-linear-to-br from-white to-gray-50 p-5 sm:p-6 shadow-sm">
						{#if editContent && isEditMode}
							{@render editContent()}
						{:else}
							<!-- View mode details grid -->
							<div class="space-y-4">
								<div class="grid grid-cols-2 gap-4">
									<div>
										<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Item Name</p>
										<p class="text-sm font-semibold text-gray-900">{item.name}</p>
									</div>
									<div>
										<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Category</p>
										<p class="text-sm font-semibold text-gray-900">{getCategoryName(item.categoryId)}</p>
									</div>
								</div>

								<div class="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
									<div>
										<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Specification</p>
										<p class="text-sm text-gray-700">{item.specification || 'No specification provided'}</p>
									</div>
									<div>
										<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Quantity</p>
										<p class="text-sm font-semibold text-gray-900">{currentCount}</p>
									</div>
								</div>

								{#if !hideInventoryFields && (item.eomCount != null || item.variance != null)}
									<div class="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
										{#if item.eomCount != null}
											<div>
												<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">EOM Count</p>
												<p class="text-sm font-semibold text-gray-900">{item.eomCount}</p>
											</div>
										{/if}
										{#if item.variance != null}
											<div>
												<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Variance</p>
												<p class="text-sm font-semibold {item.variance < 0 ? 'text-red-600' : item.variance > 0 ? 'text-green-600' : 'text-gray-900'}">
													{item.variance > 0 ? '+' : ''}{item.variance}
												</p>
											</div>
										{/if}
									</div>
								{/if}

								{#if item.description}
									<div class="pt-4 border-t border-gray-200">
										<p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Description</p>
										<p class="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{item.description}</p>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- ── Footer ─────────────────────────────────────────────────── -->
			<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					{#if footerHint}
						<p class="text-xs text-gray-500 order-2 sm:order-1">{footerHint}</p>
					{:else}
						<span class="order-2 sm:order-1"></span>
					{/if}
					<div class="flex w-full items-center gap-2 sm:w-auto order-1 sm:order-2">
						{#if footerAction}
							{@render footerAction()}
						{/if}
						<button
							type="button"
							onclick={onClose}
							class="flex-1 sm:flex-none rounded-lg border-2 border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-[0.98]"
						>
							Close
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Full-image lightbox -->
{#if showFullImage && item.picture}
	<div class="fixed inset-0 z-60 flex items-center justify-center p-4">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 bg-black/90" aria-hidden="true" onclick={closeFullImage}></div>
		<div class="relative z-61 max-h-[90vh] max-w-[90vw]">
			<button
				type="button"
				onclick={closeFullImage}
				class="absolute -top-12 right-0 rounded-md p-2 text-white transition-colors hover:bg-white/10"
				aria-label="Close full image"
				title="Close"
			>
				<svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
			<img src={item.picture} alt={item.name} class="max-h-[90vh] max-w-full rounded-lg shadow-2xl" />
		</div>
	</div>
{/if}

<style>
	@keyframes scaleIn {
		from { opacity: 0; transform: scale(0.95); }
		to   { opacity: 1; transform: scale(1); }
	}
	.animate-scaleIn {
		animation: scaleIn 0.2s ease-out;
	}
</style>
