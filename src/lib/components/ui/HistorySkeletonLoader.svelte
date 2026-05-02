<script lang="ts">
	type Tab = 'activity-logs' | 'request-history' | 'archived' | 'deleted';
	
	interface Props {
		activeTab?: Tab;
	}
	
	let { activeTab = 'activity-logs' }: Props = $props();
</script>

<div class="space-y-6 animate-pulse">
	<!-- Header Skeleton -->
	<div>
		<div class="h-8 w-64 bg-gray-200 rounded"></div>
		<div class="mt-1 h-4 w-96 bg-gray-100 rounded"></div>
	</div>

	<!-- Tabs Skeleton -->
	<div class="rounded-t-lg border-b border-gray-200 bg-white shadow-sm">
		<nav class="-mb-px flex" aria-label="Tabs">
			{#each Array(4) as _, i}
				<div class="whitespace-nowrap border-b-2 border-transparent px-6 py-4">
					<div class="flex items-center">
						<div class="mr-2 h-5 w-5 bg-gray-200 rounded"></div>
						<div class="h-4 w-24 bg-gray-200 rounded"></div>
					</div>
				</div>
			{/each}
		</nav>
	</div>

	<!-- Content Skeleton -->
	<div class="rounded-b-lg bg-white shadow-sm p-6">
		{#if activeTab === 'activity-logs'}
			<!-- Search Bar Skeleton -->
			<div class="mb-6">
				<div class="h-12 w-full bg-gray-100 rounded-lg"></div>
			</div>

			<!-- Filters Skeleton -->
			<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
				{#each Array(4) as _}
					<div>
						<div class="mb-1 h-4 w-20 bg-gray-200 rounded"></div>
						<div class="h-11 w-full bg-gray-100 rounded-lg"></div>
					</div>
				{/each}
			</div>

			<!-- Table Skeleton -->
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr class="border-b border-gray-200 bg-gray-50">
							{#each Array(7) as _}
								<th class="px-6 py-3 text-left">
									<div class="h-4 w-24 bg-gray-200 rounded"></div>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each Array(10) as _}
							<tr>
								{#each Array(7) as _}
									<td class="px-6 py-4">
										<div class="h-4 w-32 bg-gray-100 rounded"></div>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

		{:else if activeTab === 'request-history'}
			<!-- Search Bar Skeleton -->
			<div class="mb-6">
				<div class="h-12 w-full bg-gray-100 rounded-lg"></div>
			</div>

			<!-- Table Skeleton -->
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr class="border-b border-gray-200 bg-gray-50">
							{#each Array(5) as _}
								<th class="px-6 py-3 text-left">
									<div class="h-4 w-24 bg-gray-200 rounded"></div>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each Array(10) as _}
							<tr>
								<td class="px-6 py-4">
									<div class="h-4 w-24 bg-gray-100 rounded"></div>
								</td>
								<td class="px-6 py-4">
									<div class="flex items-center gap-3">
										<div class="h-10 w-10 bg-gray-200 rounded-full"></div>
										<div class="space-y-2">
											<div class="h-4 w-32 bg-gray-100 rounded"></div>
											<div class="h-3 w-40 bg-gray-100 rounded"></div>
										</div>
									</div>
								</td>
								<td class="px-6 py-4">
									<div class="h-4 w-20 bg-gray-100 rounded"></div>
								</td>
								<td class="px-6 py-4">
									<div class="h-6 w-24 bg-gray-100 rounded-full"></div>
								</td>
								<td class="px-6 py-4">
									<div class="h-4 w-32 bg-gray-100 rounded"></div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

		{:else if activeTab === 'archived'}
			<!-- Search Bar Skeleton -->
			<div class="mb-6 flex items-center justify-between">
				<div>
					<div class="h-6 w-32 bg-gray-200 rounded"></div>
					<div class="mt-1 h-4 w-64 bg-gray-100 rounded"></div>
				</div>
				<div class="h-10 w-64 bg-gray-100 rounded-md"></div>
			</div>

			<!-- Table Skeleton -->
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr class="border-b border-gray-200 bg-gray-50">
							{#each Array(6) as _}
								<th class="px-6 py-3 text-left">
									<div class="h-4 w-24 bg-gray-200 rounded"></div>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each Array(10) as _}
							<tr>
								{#each Array(6) as _}
									<td class="px-6 py-4">
										<div class="h-4 w-32 bg-gray-100 rounded"></div>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

		{:else if activeTab === 'deleted'}
			<!-- Search Bar Skeleton -->
			<div class="mb-6 flex items-center justify-between">
				<div>
					<div class="h-6 w-40 bg-gray-200 rounded"></div>
					<div class="mt-1 h-4 w-80 bg-gray-100 rounded"></div>
				</div>
				<div class="h-10 w-64 bg-gray-100 rounded-md"></div>
			</div>

			<!-- Table Skeleton -->
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr class="border-b border-gray-200 bg-gray-50">
							{#each Array(7) as _}
								<th class="px-6 py-3 text-left">
									<div class="h-4 w-24 bg-gray-200 rounded"></div>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each Array(10) as _}
							<tr>
								{#each Array(7) as _}
									<td class="px-6 py-4">
										<div class="h-4 w-32 bg-gray-100 rounded"></div>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
