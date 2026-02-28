<script lang="ts">
	// Placeholder page for Notifications
	const notifications = [
		// Placeholder data
	];
</script>

<svelte:head>
	<title>Notifications - CHTM Cooks</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Notifications</h1>
			<p class="mt-1 text-sm text-gray-500">Stay updated with system alerts and reminders</p>
		</div>
		<button class="text-sm font-medium text-emerald-600 hover:text-emerald-700">
			Mark all as read
		</button>
	</div>

	<div class="rounded-lg bg-white p-12 text-center shadow">
		<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
		</svg>
		<h3 class="mt-4 text-lg font-medium text-gray-900">No new notifications</h3>
		<p class="mt-2 text-sm text-gray-500">You're all caught up!</p>
	</div>
</div>
