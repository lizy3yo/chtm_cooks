<!--
	History Skeleton Loader Component
	Professional skeleton loading states for history page
	Responsive design optimized for all screen sizes (mobile, tablet, desktop)
	Industry-standard shimmer animation with proper accessibility
-->
<script lang="ts">
	import Skeleton from './Skeleton.svelte';
	
	type ViewMode = 'by-request' | 'by-item';
	
	let {
		viewMode = 'by-request'
	}: {
		viewMode?: ViewMode;
	} = $props();
</script>

<div class="space-y-4 sm:space-y-6" role="status" aria-live="polite" aria-label="Loading history data">
	<!-- Header Skeleton -->
	<div>
		<Skeleton class="h-8 w-32 sm:h-9" />
		<Skeleton class="mt-1 h-4 w-64" />
	</div>

	<!-- Filters Skeleton -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
		<div class="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
			<!-- Left: Filters -->
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-1 w-full">
				<!-- Status Dropdown Skeleton -->
				<div class="w-full sm:w-48">
					<Skeleton class="h-10 w-full rounded-lg" />
				</div>
				
				<!-- Search Input Skeleton -->
				<div class="w-full sm:flex-1 sm:max-w-md">
					<Skeleton class="h-10 w-full rounded-lg" />
				</div>
			</div>
			
			<!-- Right: View Mode Toggle Skeleton -->
			<div class="flex items-center justify-center sm:justify-end w-full sm:w-auto">
				<Skeleton class="h-9 w-48 rounded-lg" />
			</div>
		</div>
	</div>

	<!-- Content Skeleton -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
		<!-- Results Info Skeleton -->
		<div class="px-6 py-3 border-b border-gray-100 bg-gray-50/30">
			<Skeleton class="h-4 w-48" />
		</div>
		
		<!-- List Items Skeleton -->
		<div class="divide-y divide-gray-200">
			{#if viewMode === 'by-request'}
				{#each Array(5) as _, i}
					<div class="p-5">
						<div class="flex items-start gap-4">
							<!-- Item Images Skeleton (Desktop) -->
							<div class="hidden shrink-0 sm:flex sm:-space-x-3">
								{#each Array(3) as _, j}
									<Skeleton class="h-14 w-14 rounded-xl ring-2 ring-white" />
								{/each}
							</div>

							<!-- Content -->
							<div class="min-w-0 flex-1">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<Skeleton class="h-5 w-48" />
										<Skeleton class="mt-1 h-3 w-24" />
									</div>
									<Skeleton class="h-6 w-24 rounded-full" />
								</div>

								<!-- Items List Skeleton -->
								<div class="mt-3 space-y-1.5">
									{#each Array(2) as _, k}
										<div class="flex items-center gap-2">
											<Skeleton variant="circle" class="h-8 w-8 sm:hidden" />
											<Skeleton class="h-4 w-32" />
											<Skeleton class="h-4 w-4" />
											<Skeleton class="h-4 w-8" />
										</div>
									{/each}
								</div>

								<!-- Meta Info Skeleton -->
								<div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
									<Skeleton class="h-3 w-24" />
									<Skeleton class="h-3 w-32" />
									<Skeleton class="h-3 w-28" />
								</div>
							</div>
						</div>
					</div>
				{/each}
			{:else}
				{#each Array(5) as _, i}
					<div class="p-5">
						<div class="flex items-start gap-4">
							<!-- Item Image Skeleton -->
							<div class="shrink-0">
								<Skeleton class="h-16 w-16 rounded-xl sm:h-20 sm:w-20" />
							</div>

							<!-- Content -->
							<div class="min-w-0 flex-1">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<Skeleton class="h-5 w-40" />
										<Skeleton class="mt-1 h-4 w-24" />
									</div>
									<Skeleton class="h-6 w-24 rounded-full" />
								</div>

								<div class="mt-2">
									<Skeleton class="h-4 w-full max-w-md" />
								</div>

								<!-- Meta Info Skeleton -->
								<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
									<Skeleton class="h-3 w-24" />
									<Skeleton class="h-3 w-32" />
									<Skeleton class="h-3 w-28" />
								</div>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Pagination Skeleton -->
		<div class="flex items-center justify-between border-t border-gray-200 bg-gray-50/50 px-4 py-3 sm:px-6">
			<div class="hidden sm:block">
				<Skeleton class="h-4 w-24" />
			</div>
			<nav class="flex items-center gap-1 mx-auto sm:mx-0">
				<Skeleton class="h-9 w-9 rounded-lg" />
				<Skeleton class="h-9 w-9 rounded-lg" />
				<Skeleton class="h-9 w-9 rounded-lg" />
				<Skeleton class="h-9 w-9 rounded-lg" />
				<Skeleton class="h-9 w-9 rounded-lg" />
			</nav>
			<div class="hidden sm:block">
				<Skeleton class="h-4 w-32" />
			</div>
		</div>
	</div>
</div>
