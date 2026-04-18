<script lang="ts">
	/**
	 * SelectedItemsSkeletonLoader Component
	 * 
	 * Professional skeleton loader for the Selected Items section in Request Equipment page.
	 * Follows industry-standard skeleton loading patterns used by:
	 * - Shopify (product selection)
	 * - Amazon (cart items)
	 * - Stripe (payment items)
	 * 
	 * Features:
	 * - Animated shimmer effect
	 * - Responsive design
	 * - Matches actual item card layout
	 * - Accessible (aria-busy, aria-label)
	 */
	
	interface Props {
		count?: number; // Number of skeleton items to show
	}
	
	let { count = 3 }: Props = $props();
</script>

<div class="space-y-2" role="status" aria-busy="true" aria-label="Loading selected items">
	{#each Array(count) as _, index}
		<div class="group rounded-lg border border-gray-200 bg-white p-2.5 animate-pulse">
			<div class="flex items-start gap-2.5">
				<!-- Image Skeleton -->
				<div class="h-14 w-14 shrink-0 rounded-md bg-gray-200"></div>
				
				<!-- Content Skeleton -->
				<div class="min-w-0 flex-1">
					<div class="flex items-start justify-between gap-2">
						<div class="flex-1 space-y-2">
							<!-- Title -->
							<div class="h-3 w-3/4 rounded bg-gray-200"></div>
							
							<!-- Category and availability -->
							<div class="flex items-center gap-1.5">
								<div class="h-2.5 w-20 rounded bg-gray-200"></div>
								<div class="h-2 w-2 rounded-full bg-gray-200"></div>
								<div class="h-2.5 w-24 rounded bg-gray-200"></div>
							</div>
						</div>
						
						<!-- Remove button skeleton -->
						<div class="h-6 w-6 shrink-0 rounded-full bg-gray-200"></div>
					</div>
					
					<!-- Quantity controls skeleton -->
					<div class="mt-2 flex items-center gap-2">
						<div class="h-8 w-8 rounded-md bg-gray-200"></div>
						<div class="h-8 w-12 rounded-md bg-gray-200"></div>
						<div class="h-8 w-8 rounded-md bg-gray-200"></div>
					</div>
				</div>
			</div>
		</div>
	{/each}
	
	<!-- Screen reader text -->
	<span class="sr-only">Loading selected items...</span>
</div>

<style>
	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
	
	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
</style>
