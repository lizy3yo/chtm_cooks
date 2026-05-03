<script lang="ts">
	interface Props {
		currentPage: number;
		totalPages: number;
		totalItems: number;
		itemsPerPage: number;
		onPageChange: (page: number) => void;
		class?: string;
	}

	let {
		currentPage,
		totalPages,
		totalItems,
		itemsPerPage,
		onPageChange,
		class: className = ''
	}: Props = $props();

	const rangeStart = $derived((currentPage - 1) * itemsPerPage + 1);
	const rangeEnd   = $derived(Math.min(currentPage * itemsPerPage, totalItems));

	/**
	 * Compact page list — max 7 slots including ellipsis.
	 * Works at any container width without relying on breakpoints.
	 *
	 * Pattern:
	 *   Near start:  1  2  3  …  N
	 *   Middle:      1  …  p-1  p  p+1  …  N
	 *   Near end:    1  …  N-2  N-1  N
	 */
	const pages = $derived.by((): (number | '…')[] => {
		if (totalPages <= 5) {
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}

		const p = currentPage;
		const n = totalPages;

		// Near start — show first 4 consecutive pages then last
		if (p <= 3) return [1, 2, 3, 4, '…', n];
		// Near end — show first then last 4 consecutive pages
		if (p >= n - 2) return [1, '…', n - 3, n - 2, n - 1, n];
		// Middle — first, ellipsis, p-1, p, p+1, ellipsis, last
		return [1, '…', p - 1, p, p + 1, '…', n];
	});

	function prev() { if (currentPage > 1) onPageChange(currentPage - 1); }
	function next() { if (currentPage < totalPages) onPageChange(currentPage + 1); }

	function pageClass(page: number) {
		return currentPage === page
			? 'bg-pink-600 text-white shadow-sm'
			: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50';
	}
</script>

<div class="rounded-lg border border-gray-200 bg-white shadow-sm {className}">
	<div class="flex flex-col items-center gap-2 px-4 py-3 min-[480px]:flex-row min-[480px]:justify-between min-[480px]:gap-0 min-[480px]:px-6">

		<p class="text-sm text-gray-500">
			Showing <span class="font-medium text-gray-700">{rangeStart}–{rangeEnd}</span>
			of <span class="font-medium text-gray-700">{totalItems}</span> items
		</p>

		<nav class="flex items-center gap-0.5 sm:gap-1" aria-label="Pagination">
			<!-- Prev -->
			<button
				type="button"
				onclick={prev}
				disabled={currentPage === 1}
				class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8"
				aria-label="Previous page"
			>
				<svg class="h-3 w-3 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
				</svg>
			</button>

			{#each pages as entry}
				{#if entry === '…'}
					<span class="inline-flex h-7 w-5 shrink-0 items-center justify-center text-[10px] text-gray-400 sm:h-8 sm:w-6 sm:text-xs" aria-hidden="true">…</span>
				{:else}
					<button
						type="button"
						onclick={() => onPageChange(entry as number)}
						class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-medium transition-colors sm:h-8 sm:w-8 sm:text-sm {pageClass(entry as number)}"
						aria-label="Page {entry}"
						aria-current={currentPage === entry ? 'page' : undefined}
					>{entry}</button>
				{/if}
			{/each}

			<!-- Next -->
			<button
				type="button"
				onclick={next}
				disabled={currentPage === totalPages}
				class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8"
				aria-label="Next page"
			>
				<svg class="h-3 w-3 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
				</svg>
			</button>
		</nav>
	</div>
</div>
