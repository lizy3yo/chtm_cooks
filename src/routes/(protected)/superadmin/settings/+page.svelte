<script lang="ts">
	import { Settings as SettingsIcon, Mail, Bell, Shield, Database, Info } from 'lucide-svelte';
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900">System Settings</h1>
			<p class="mt-1 text-sm text-gray-500">Configure system-wide parameters and preferences</p>
			
			<div class="mt-4 flex items-start gap-3 rounded-lg border border-pink-200 bg-pink-50 p-4">
				<Info size={20} class="mt-0.5 shrink-0 text-pink-600" />
				<div class="flex-1 text-sm">
					<p class="font-medium text-pink-900">System Configuration Features</p>
					<ul class="mt-2 space-y-1 text-pink-800">
						<li>• Email template customization for notifications and alerts</li>
						<li>• Notification settings: enable/disable by type, frequency controls</li>
						<li>• Request workflow configuration: auto-approval rules, thresholds</li>
						<li>• Inventory settings: low stock thresholds, reorder points</li>
						<li>• Academic calendar configuration for semester dates</li>
						<li>• Maintenance mode toggle for system updates</li>
						<li>• Feature flags for gradual rollouts and A/B testing</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<!-- Settings Sections -->
	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Email Settings -->
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<div class="flex items-center gap-3 mb-4">
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-100">
					<Mail size={20} class="text-pink-600" />
				</div>
				<div>
					<h3 class="font-semibold text-gray-900">Email Templates</h3>
					<p class="text-sm text-gray-500">Customize email notifications</p>
				</div>
			</div>
			<button class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
				Manage Templates
			</button>
		</div>

		<!-- Notification Settings -->
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<div class="flex items-center gap-3 mb-4">
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
					<Bell size={20} class="text-blue-600" />
				</div>
				<div>
					<h3 class="font-semibold text-gray-900">Notifications</h3>
					<p class="text-sm text-gray-500">Configure notification preferences</p>
				</div>
			</div>
			<button class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
				Configure
			</button>
		</div>

		<!-- Security Settings -->
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<div class="flex items-center gap-3 mb-4">
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
					<Shield size={20} class="text-purple-600" />
				</div>
				<div>
					<h3 class="font-semibold text-gray-900">Security</h3>
					<p class="text-sm text-gray-500">Password policies and access control</p>
				</div>
			</div>
			<button class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
				Manage Security
			</button>
		</div>

		<!-- Maintenance Mode -->
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
			<div class="flex items-center gap-3 mb-4">
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
					<SettingsIcon size={20} class="text-amber-600" />
				</div>
				<div>
					<h3 class="font-semibold text-gray-900">Maintenance Mode</h3>
					<p class="text-sm text-gray-500">Enable for system updates</p>
				</div>
			</div>
			<button class="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
				Toggle Mode
			</button>
		</div>
	</div>
</div>
