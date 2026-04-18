<script lang="ts">
	type ViewMode = 'card' | 'list';
	
	let { viewMode = 'card' }: { viewMode?: ViewMode } = $props();
</script>

<div class="animate-pulse space-y-6">
	<!-- Statistics Cards Skeleton -->
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
		{#each Array(5) as _, i}
			<div class="rounded-lg bg-white p-3 shadow sm:p-5">
				<div class="flex items-center justify-between gap-2">
					<div class="min-w-0 flex-1">
						<div class="h-3 w-16 rounded bg-gray-200 sm:h-4"></div>
						<div class="mt-2 h-6 w-12 rounded bg-gray-300 sm:h-8"></div>
					</div>
					<div class="h-9 w-9 shrink-0 rounded-full bg-gray-200 sm:h-12 sm:w-12"></div>
				</div>
			</div>
		{/each}
	</div>

	<!-- Tabs Skeleton -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex" aria-label="Tabs">
			{#each Array(5) as _, i}
				<div class="flex flex-1 items-center justify-center gap-1 border-b-2 border-transparent px-1 py-3">
					<div class="h-3 w-12 rounded bg-gray-200"></div>
					<div class="h-4 w-6 rounded-full bg-gray-200"></div>
				</div>
			{/each}
		</nav>
	</div>

	<!-- Content Container -->
	<div class="rounded-xl bg-white shadow-sm">
		<div class="p-6">
			<!-- Filters Skeleton -->
			<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-1 gap-2">
					<div class="h-10 flex-1 rounded-lg bg-gray-200"></div>
					<div class="h-10 w-32 rounded-lg bg-gray-200"></div>
				</div>
				<div class="flex gap-2">
					<div class="h-10 w-24 rounded-lg bg-gray-200"></div>
					<div class="h-10 w-10 rounded-lg bg-gray-200"></div>
				</div>
			</div>

			{#if viewMode === 'card'}
				<!-- Card View Skeleton -->
				<div class="space-y-4" style="min-height: 600px;">
					{#each Array(3) as _, i}
						<div class="overflow-hidden rounded-xl border-l-4 border-gray-300 bg-white shadow-sm ring-1 ring-gray-200">
							<div class="p-4 sm:p-5">
								<!-- Header -->
								<div class="mb-3 flex items-start justify-between gap-3">
									<div class="flex flex-1 flex-col gap-2">
										<div class="flex flex-wrap items-center gap-2">
											<div class="h-4 w-24 rounded bg-gray-300"></div>
											<div class="h-5 w-32 rounded-full bg-gray-200"></div>
										</div>
										<div class="flex items-center gap-2">
											<div class="h-6 w-6 rounded-full bg-gray-200"></div>
											<div class="h-3 w-32 rounded bg-gray-200"></div>
											<div class="h-3 w-20 rounded bg-gray-200"></div>
										</div>
									</div>
									<div class="h-3 w-24 rounded bg-gray-200"></div>
								</div>

								<!-- Equipment Chips -->
								<div class="mt-4">
									<div class="mb-2 h-3 w-32 rounded bg-gray-200"></div>
									<div class="flex flex-wrap gap-1.5">
										{#each Array(3) as _, j}
											<div class="h-7 w-24 rounded-md bg-gray-200"></div>
										{/each}
									</div>
								</div>

								<!-- Metadata -->
								<div class="mt-3 flex flex-wrap gap-4">
									<div class="h-3 w-32 rounded bg-gray-200"></div>
									<div class="h-3 w-40 rounded bg-gray-200"></div>
									<div class="h-3 w-24 rounded bg-gray-200"></div>
								</div>
							</div>

							<!-- Footer -->
							<div class="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:px-5">
								<div class="h-3 w-48 rounded bg-gray-200"></div>
								<div class="flex gap-2">
									<div class="h-8 w-24 rounded-lg bg-gray-200"></div>
									<div class="h-8 w-24 rounded-lg bg-gray-200"></div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<!-- List View Skeleton -->
				<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
					<!-- Header -->
					<div class="hidden border-b border-gray-200 bg-gray-50 px-4 py-3 md:grid md:grid-cols-[1.1fr_1fr_1.5fr_1fr_auto] md:gap-3">
						{#each Array(5) as _, i}
							<div class="h-3 w-20 rounded bg-gray-200"></div>
						{/each}
					</div>
					
					<!-- Rows -->
					<div class="divide-y divide-gray-100">
						{#each Array(5) as _, i}
							<div class="grid gap-3 p-4 md:grid-cols-[1.1fr_1fr_1.5fr_1fr_auto] md:gap-3">
								<div class="space-y-2">
									<div class="h-3 w-24 rounded bg-gray-300"></div>
									<div class="h-3 w-32 rounded bg-gray-200"></div>
								</div>
								<div class="flex items-center gap-2">
									<div class="h-8 w-8 rounded-full bg-gray-200"></div>
									<div class="h-3 w-24 rounded bg-gray-200"></div>
								</div>
								<div class="flex flex-wrap gap-1">
									{#each Array(2) as _, j}
										<div class="h-6 w-20 rounded-md bg-gray-200"></div>
									{/each}
								</div>
								<div class="h-5 w-28 rounded-full bg-gray-200"></div>
								<div class="flex justify-end gap-2">
									<div class="h-8 w-20 rounded-lg bg-gray-200"></div>
									<div class="h-8 w-8 rounded-lg bg-gray-200"></div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Pagination Skeleton -->
			<div class="mt-6 flex items-center justify-between">
				<div class="h-3 w-32 rounded bg-gray-200"></div>
				<div class="flex gap-2">
					<div class="h-9 w-9 rounded-lg bg-gray-200"></div>
					<div class="h-9 w-9 rounded-lg bg-gray-200"></div>
					<div class="h-9 w-9 rounded-lg bg-gray-200"></div>
					<div class="h-9 w-9 rounded-lg bg-gray-200"></div>
				</div>
			</div>
		</div>
	</div>
</div>
