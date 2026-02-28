<script lang="ts">
	import { user } from '$lib/stores/auth';
</script>

<svelte:head>
	<title>Profile - CHTM Cooks</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Profile</h1>
		<p class="mt-1 text-sm text-gray-500">Manage your account information</p>
	</div>

	<div class="rounded-lg bg-white p-6 shadow">
		<div class="flex items-center space-x-6">
			<div class="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-3xl font-semibold text-emerald-700">
				{$user?.firstName?.charAt(0)}{$user?.lastName?.charAt(0)}
			</div>
			<div>
				<h2 class="text-2xl font-bold text-gray-900">
					{$user?.firstName} {$user?.lastName}
				</h2>
				<p class="text-sm text-gray-500 capitalize">{$user?.role}</p>
				<p class="mt-1 text-sm text-gray-500">{$user?.email}</p>
			</div>
		</div>

		<div class="mt-8 border-t border-gray-200 pt-6">
			<h3 class="text-lg font-semibold text-gray-900">Account Information</h3>
			<dl class="mt-4 space-y-4">
				<div>
					<dt class="text-sm font-medium text-gray-500">First Name</dt>
					<dd class="mt-1 text-sm text-gray-900">{$user?.firstName}</dd>
				</div>
				<div>
					<dt class="text-sm font-medium text-gray-500">Last Name</dt>
					<dd class="mt-1 text-sm text-gray-900">{$user?.lastName}</dd>
				</div>
				<div>
					<dt class="text-sm font-medium text-gray-500">Email</dt>
					<dd class="mt-1 text-sm text-gray-900">{$user?.email}</dd>
				</div>
				<div>
					<dt class="text-sm font-medium text-gray-500">Role</dt>
					<dd class="mt-1 text-sm capitalize text-gray-900">{$user?.role}</dd>
				</div>
			</dl>
		</div>
	</div>
</div>
