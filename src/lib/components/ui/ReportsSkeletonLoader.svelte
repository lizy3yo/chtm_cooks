<!--
	Reports Skeleton Loader Component
	Professional skeleton loading states for analytics reports page
	Industry-standard shimmer animation with proper accessibility
-->
<script lang="ts">
	import Skeleton from './Skeleton.svelte';
	
	type LoadingView = 'overview' | 'borrowing' | 'loss-damage' | 'inventory' | 'students';
	
	let {
		view = 'overview'
	}: {
		view?: LoadingView;
	} = $props();
</script>

<div class="space-y-6" role="status" aria-live="polite" aria-label="Loading analytics data">
	<!-- KPI Cards Skeleton -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each Array(4) as _}
			<div class="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-5">
				<div class="flex items-start justify-between">
					<div class="space-y-3 flex-1">
						<Skeleton class="h-3.5 w-24" />
						<Skeleton class="h-9 w-20" />
						<Skeleton class="h-3 w-32" />
					</div>
					<Skeleton variant="circle" class="h-12 w-12" />
				</div>
			</div>
		{/each}
	</div>

	{#if view === 'overview'}
		<!-- Overview Content Skeleton -->
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
				<Skeleton class="h-6 w-40" />
				<div class="space-y-3">
					{#each Array(3) as _}
						<div class="rounded-lg bg-gray-50 p-3 flex items-center justify-between">
							<Skeleton class="h-4 w-32" />
							<Skeleton class="h-5 w-16" />
						</div>
					{/each}
				</div>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
				<Skeleton class="h-6 w-40" />
				<div class="grid grid-cols-3 gap-3">
					{#each Array(3) as _}
						<div class="rounded-lg bg-gray-50 p-3 text-center space-y-2">
							<Skeleton class="h-3 w-16 mx-auto" />
							<Skeleton class="h-7 w-10 mx-auto" />
							<Skeleton class="h-2.5 w-20 mx-auto" />
						</div>
					{/each}
				</div>
			</div>
		</div>

	{:else if view === 'borrowing'}
		<!-- Borrowing Analytics Skeleton -->
		<div class="grid gap-4 lg:grid-cols-3">
			{#each Array(3) as _}
				<div class="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
					<div class="space-y-2">
						<Skeleton class="h-5 w-40" />
						<Skeleton class="h-3 w-24" />
					</div>
					<div class="space-y-2">
						{#each Array(5) as _}
							<div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
								<div class="flex items-center justify-between">
									<div class="flex-1 space-y-2">
										<Skeleton class="h-4 w-32" />
										<Skeleton class="h-3 w-20" />
									</div>
									<div class="ml-3 text-right space-y-1">
										<Skeleton class="h-4 w-8" />
										<Skeleton class="h-3 w-12" />
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>

	{:else if view === 'loss-damage'}
		<!-- Loss & Damage Skeleton -->
		<div class="space-y-6">
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each Array(4) as _}
					<div class="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-5 space-y-3">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-8 w-16" />
						<div class="flex items-center gap-2">
							<Skeleton class="h-6 w-20 rounded-full" />
							<Skeleton class="h-6 w-20 rounded-full" />
						</div>
					</div>
				{/each}
			</div>

			<div class="rounded-xl border border-gray-200 bg-white p-5">
				<div class="mb-4 flex items-center justify-between">
					<Skeleton class="h-6 w-48" />
					<Skeleton class="h-4 w-24" />
				</div>
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								{#each Array(7) as _}
									<th class="px-4 py-3">
										<Skeleton class="h-3 w-20" />
									</th>
								{/each}
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each Array(5) as _}
								<tr>
									<td class="px-4 py-3"><Skeleton class="h-6 w-16 rounded-full" /></td>
									<td class="px-4 py-3"><Skeleton class="h-4 w-32" /></td>
									<td class="px-4 py-3"><Skeleton class="h-4 w-24" /></td>
									<td class="px-4 py-3"><Skeleton class="h-6 w-16 rounded-full" /></td>
									<td class="px-4 py-3"><Skeleton class="h-4 w-20" /></td>
									<td class="px-4 py-3"><Skeleton class="h-4 w-16" /></td>
									<td class="px-4 py-3"><Skeleton class="h-4 w-16" /></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>

	{:else if view === 'inventory' || view === 'students'}
		<!-- Inventory/Students Skeleton -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
			<Skeleton class="h-6 w-40" />
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each Array(6) as _}
					<div class="rounded-lg bg-gray-50 p-4 space-y-2">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-7 w-16" />
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
