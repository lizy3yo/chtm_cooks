<script lang="ts">
	// Placeholder page for Settings
</script>

<svelte:head>
	<title>Settings - CHTM Cooks</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Settings</h1>
		<p class="mt-1 text-sm text-gray-500">Manage your preferences and account settings</p>
	</div>

	<div class="space-y-6">
		<!-- Notification Settings -->
		<div class="rounded-lg bg-white p-6 shadow">
			<h3 class="text-lg font-semibold text-gray-900">Notification Preferences</h3>
			<div class="mt-4 space-y-4">
				<label class="flex items-center">
					<input type="checkbox" class="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" checked />
					<span class="ml-3 text-sm text-gray-700">Email notifications for new requests</span>
				</label>
				<label class="flex items-center">
					<input type="checkbox" class="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" checked />
					<span class="ml-3 text-sm text-gray-700">Email notifications for overdue items</span>
				</label>
				<label class="flex items-center">
					<input type="checkbox" class="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
					<span class="ml-3 text-sm text-gray-700">Email notifications for low stock alerts</span>
				</label>
			</div>
		</div>

		<!-- Password Change -->
		<div class="rounded-lg bg-white p-6 shadow">
			<h3 class="text-lg font-semibold text-gray-900">Change Password</h3>
			<form class="mt-4 space-y-4">
				<div>
					<label for="currentPassword" class="block text-sm font-medium text-gray-700">Current Password</label>
					<input
						type="password"
						id="currentPassword"
						class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500"
					/>
				</div>
				<div>
					<label for="newPassword" class="block text-sm font-medium text-gray-700">New Password</label>
					<input
						type="password"
						id="newPassword"
						class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500"
					/>
				</div>
				<div>
					<label for="confirmPassword" class="block text-sm font-medium text-gray-700">Confirm New Password</label>
					<input
						type="password"
						id="confirmPassword"
						class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500"
					/>
				</div>
				<button
					type="submit"
					class="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
				>
					Update Password
				</button>
			</form>
		</div>
	</div>
</div>
