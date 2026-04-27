<!--
	Class Codes Skeleton Loader Component
	Professional skeleton loading states for class code management page
-->
<script lang="ts">
	import Skeleton from './Skeleton.svelte';
</script>

<div class="animate-pulse space-y-6" role="status" aria-live="polite" aria-label="Loading class codes data">
	<!-- Stats Cards Skeleton -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each Array(4) as _}
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
				<div class="flex items-center justify-between">
					<Skeleton class="h-4 w-24" />
					<Skeleton class="h-8 w-8 rounded-lg" />
				</div>
				<Skeleton class="h-9 w-16" />
				<Skeleton class="h-3 w-32" />
			</div>
		{/each}
	</div>

	<!-- Filters Skeleton -->
	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
			<Skeleton class="h-10 flex-1 rounded-lg" />
			<Skeleton class="h-10 w-32 rounded-lg" />
			<Skeleton class="h-10 w-32 rounded-lg" />
			<Skeleton class="h-10 w-32 rounded-lg" />
		</div>
	</div>

	<!-- Grid Skeleton -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each Array(6) as _}
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
				<div class="flex items-start justify-between">
					<div class="space-y-2 flex-1">
						<div class="flex gap-2 items-center">
							<Skeleton variant="circle" class="h-5 w-5" />
							<Skeleton class="h-5 w-24" />
						</div>
						<Skeleton class="h-4 w-40" />
					</div>
					<div class="flex gap-1 ml-2">
						<Skeleton class="h-8 w-8 rounded-lg" />
						<Skeleton class="h-8 w-8 rounded-lg" />
						<Skeleton class="h-8 w-8 rounded-lg" />
					</div>
				</div>

				<div class="mt-4 space-y-2">
					<div class="flex justify-between items-center"><Skeleton class="h-4 w-16" /><Skeleton class="h-4 w-20 rounded-full" /></div>
					<div class="flex justify-between items-center"><Skeleton class="h-4 w-24" /><Skeleton class="h-4 w-24" /></div>
					<div class="flex justify-between items-center"><Skeleton class="h-4 w-16" /><Skeleton class="h-4 w-24" /></div>
				</div>

				<div class="mt-4">
					<div class="flex justify-between items-center mb-1.5">
						<Skeleton class="h-4 w-20" />
						<Skeleton class="h-4 w-12" />
					</div>
					<Skeleton class="h-2 w-full rounded-full" />
					<div class="flex justify-end mt-1"><Skeleton class="h-3 w-16" /></div>
				</div>

				<div class="mt-4 border-t border-gray-100 pt-4">
					<Skeleton class="h-3 w-24 mb-2" />
					<div class="flex -space-x-2">
						{#each Array(3) as _}
							<Skeleton variant="circle" class="h-7 w-7 border-2 border-white" />
						{/each}
					</div>
				</div>

				<div class="mt-4">
					<Skeleton class="h-9 w-full rounded-lg" />
				</div>
			</div>
		{/each}
	</div>
</div>
