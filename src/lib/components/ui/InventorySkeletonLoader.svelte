<!--
	Inventory Skeleton Loader Component
	Professional skeleton loading states for inventory management page
	Responsive design optimized for all screen sizes (mobile, tablet, desktop)
	Industry-standard shimmer animation with proper accessibility
-->
<script lang="ts">
	import Skeleton from './Skeleton.svelte';
	
	type LoadingView = 'all-items' | 'categories' | 'low-stock';
	
	let {
		view = 'all-items'
	}: {
		view?: LoadingView;
	} = $props();
</script>

<div class="space-y-6" role="status" aria-live="polite" aria-label="Loading inventory data">
	<!-- Stats Skeleton - Corporate Dashboard Style -->
	<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
		{#each Array(4) as _, i}
			<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6 space-y-3">
				<Skeleton class="h-3.5 w-24" />
				<Skeleton class="h-9 w-20" />
			</div>
		{/each}
	</div>

	<!-- Content Skeleton Based on Active View -->
	{#if view === 'all-items' || view === 'low-stock'}
		<!-- Table View Skeleton -->
		<div class="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
			<!-- Search and Filter Bar Skeleton -->
			<div class="p-4 sm:p-6 border-b border-gray-200 bg-gray-50">
				<div class="flex flex-col sm:flex-row gap-3 sm:gap-4">
					<Skeleton class="h-10 flex-1 max-w-md" />
					<Skeleton class="h-10 w-full sm:w-36" />
				</div>
			</div>
			
			<!-- Table Content Skeleton - 600px height -->
			<div class="overflow-x-auto" style="min-height: 600px;">
				<table class="min-w-full divide-y divide-gray-200">
					<!-- Table Header Skeleton - 6 Columns -->
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3">
								<Skeleton class="h-3 w-24" />
							</th>
							<th class="px-6 py-3">
								<Skeleton class="h-3 w-20" />
							</th>
							<th class="px-6 py-3">
								<Skeleton class="h-3 w-28" />
							</th>
							<th class="px-6 py-3">
								<Skeleton class="h-3 w-32" />
							</th>
							<th class="px-6 py-3">
								<Skeleton class="h-3 w-24" />
							</th>
							<th class="px-6 py-3">
								<Skeleton class="h-3 w-16" />
							</th>
						</tr>
					</thead>
					
					<!-- Table Rows Skeleton - 6 Columns -->
					<tbody class="divide-y divide-gray-200 bg-white">
						{#each Array(10) as _, i}
							<tr class="hover:bg-gray-50">
								<!-- Item Name -->
								<td class="px-6 py-4">
									<div class="flex items-center gap-3">
										<Skeleton variant="circle" class="h-6 w-6 flex-shrink-0" />
										<Skeleton class="h-4 w-40" />
									</div>
								</td>
								<!-- Category -->
								<td class="px-6 py-4">
									<Skeleton class="h-6 w-24 rounded-full" />
								</td>
								<!-- Specification -->
								<td class="px-6 py-4">
									<Skeleton class="h-4 w-32" />
								</td>
								<!-- Tools / Equipment -->
								<td class="px-6 py-4">
									<Skeleton class="h-4 w-28" />
								</td>
								<!-- Current Count -->
								<td class="px-6 py-4">
									<Skeleton class="h-4 w-12" />
								</td>
								<!-- Status -->
								<td class="px-6 py-4">
									<Skeleton class="h-6 w-20 rounded-full" />
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
		
	{:else if view === 'categories'}
		<!-- Categories Grid View Skeleton -->
		<div class="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
			<!-- Header with Add Button Skeleton -->
			<div class="p-6 border-b border-gray-200 bg-gray-50">
				<div class="flex justify-between items-center">
					<div class="space-y-2">
						<Skeleton class="h-6 w-40" />
						<Skeleton class="h-4 w-56" />
					</div>
					<Skeleton class="h-10 w-40" />
				</div>
			</div>
			
			<!-- Category Cards Grid -->
			<div class="p-6">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{#each Array(8) as _, i}
						<div class="rounded-lg border-2 border-gray-200 p-6 transition-all hover:border-gray-300">
							<div class="flex items-start justify-between">
								<div class="flex-1 space-y-3">
									<Skeleton class="h-5 w-32" />
									<Skeleton class="h-4 w-20" />
									<Skeleton class="h-3 w-full" />
								</div>
								<div class="ml-4 flex items-center gap-3">
									<Skeleton variant="circle" class="h-12 w-12 flex-shrink-0" />
									<Skeleton variant="circle" class="h-8 w-8 flex-shrink-0" />
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>
