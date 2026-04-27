<!--
	Users Skeleton Loader Component
	Professional skeleton loading states for user management page
	Responsive design optimized for all screen sizes (mobile, tablet, desktop)
	Industry-standard shimmer animation with proper accessibility
-->
<script lang="ts">
	import Skeleton from './Skeleton.svelte';
</script>

<div class="space-y-6" role="status" aria-live="polite" aria-label="Loading users data">
	<!-- Stats Skeleton -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each Array(4) as _}
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
				<Skeleton class="h-4 w-24" />
				<Skeleton class="h-9 w-20" />
				<Skeleton class="h-3 w-32" />
			</div>
		{/each}
	</div>

	<!-- Role distribution pills Skeleton -->
	<div class="flex flex-wrap gap-2">
		{#each Array(3) as _}
			<Skeleton class="h-6 w-24 rounded-full" />
		{/each}
	</div>

	<!-- Filters Skeleton -->
	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
			<Skeleton class="h-10 flex-1 rounded-lg" />
			<Skeleton class="h-10 w-32 rounded-lg" />
			<Skeleton class="h-10 w-32 rounded-lg" />
			<div class="flex gap-2">
				<Skeleton class="h-10 w-24 rounded-lg" />
				<Skeleton class="h-10 w-28 rounded-lg" />
			</div>
		</div>
	</div>

	<!-- Table Skeleton -->
	<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
		<!-- Desktop table -->
		<div class="hidden overflow-x-auto md:block" style="min-height: 400px;">
			<table class="w-full">
				<thead class="border-b border-gray-200 bg-gray-50">
					<tr>
						<th class="px-6 py-3"><Skeleton class="h-3 w-24" /></th>
						<th class="px-6 py-3"><Skeleton class="h-3 w-16" /></th>
						<th class="px-6 py-3"><Skeleton class="h-3 w-16" /></th>
						<th class="px-6 py-3"><Skeleton class="h-3 w-24" /></th>
						<th class="px-6 py-3"><Skeleton class="h-3 w-20" /></th>
						<th class="px-6 py-3"><Skeleton class="h-3 w-20" /></th>
						<th class="px-6 py-3"><Skeleton class="h-3 w-12 ml-auto" /></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#each Array(8) as _}
						<tr>
							<td class="px-6 py-4">
								<div class="flex items-center gap-3">
									<Skeleton variant="circle" class="h-10 w-10 shrink-0" />
									<div class="space-y-2">
										<Skeleton class="h-4 w-32" />
										<Skeleton class="h-3 w-40" />
									</div>
								</div>
							</td>
							<td class="px-6 py-4"><Skeleton class="h-6 w-20 rounded-full" /></td>
							<td class="px-6 py-4"><Skeleton class="h-6 w-16 rounded-full" /></td>
							<td class="px-6 py-4"><Skeleton class="h-4 w-28" /></td>
							<td class="px-6 py-4"><Skeleton class="h-4 w-24" /></td>
							<td class="px-6 py-4"><Skeleton class="h-4 w-24" /></td>
							<td class="px-6 py-4"><Skeleton class="h-8 w-8 ml-auto rounded-lg" /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Mobile cards -->
		<div class="divide-y divide-gray-100 md:hidden">
			{#each Array(6) as _}
				<div class="p-4 space-y-4">
					<div class="flex justify-between items-center">
						<div class="flex items-center gap-3">
							<Skeleton variant="circle" class="h-10 w-10 shrink-0" />
							<div class="space-y-2">
								<Skeleton class="h-4 w-32" />
								<Skeleton class="h-3 w-40" />
							</div>
						</div>
						<Skeleton class="h-6 w-20 rounded-full" />
					</div>
					<Skeleton class="h-3 w-full" />
				</div>
			{/each}
		</div>
	</div>
</div>
