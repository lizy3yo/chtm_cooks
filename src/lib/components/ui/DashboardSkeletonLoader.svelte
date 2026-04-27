<!--
	Dashboard Skeleton Loader Component
	Professional skeleton loading states for the superadmin dashboard
-->
<script lang="ts">
	import Skeleton from './Skeleton.svelte';
</script>

<div class="space-y-6" role="status" aria-live="polite" aria-label="Loading dashboard data">
	<!-- KPI Strip Skeleton -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each Array(4) as _}
			<div class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100 space-y-3">
				<Skeleton class="h-3 w-24" />
				<Skeleton class="h-8 w-14" />
				<Skeleton class="h-3 w-20" />
			</div>
		{/each}
	</div>

	<!-- System Health & Alerts Skeleton -->
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
		{#each Array(4) as _}
			<div class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100 space-y-3">
				<div class="flex justify-between items-center">
					<Skeleton class="h-4 w-4 rounded-full" />
					<Skeleton class="h-3 w-16" />
				</div>
				<Skeleton class="h-7 w-12" />
				<Skeleton class="h-3 w-24" />
			</div>
		{/each}
	</div>

	<!-- Main Content Grid Skeleton -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		{#each Array(4) as _}
			<div class="rounded-xl bg-white shadow-sm ring-1 ring-gray-100 p-5 space-y-4">
				<div class="flex justify-between items-center border-b border-gray-100 pb-3">
					<div class="flex items-center gap-2">
						<Skeleton class="h-4 w-4 rounded-full" />
						<Skeleton class="h-4 w-24" />
					</div>
					<Skeleton class="h-3 w-16" />
				</div>
				<div class="space-y-4">
					{#each Array(3) as _}
						<div class="flex items-center gap-3">
							<Skeleton variant="circle" class="h-10 w-10 shrink-0" />
							<div class="flex-1 space-y-1.5">
								<Skeleton class="h-4 w-48" />
								<Skeleton class="h-3 w-32" />
							</div>
							<Skeleton class="h-5 w-16 rounded-full" />
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>
