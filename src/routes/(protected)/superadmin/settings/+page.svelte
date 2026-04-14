<script lang="ts">
	import { Save, Globe, Mail, Shield, Database, Bell } from 'lucide-svelte';

	let settings = $state({
		siteName: 'CHTM-Cooks System',
		siteUrl: 'https://chtm-cooks.example.com',
		adminEmail: 'admin@chtm-cooks.com',
		maintenanceMode: false,
		registrationEnabled: true,
		emailNotifications: true,
		twoFactorAuth: false,
		sessionTimeout: 30,
		maxLoginAttempts: 5,
		backupFrequency: 'daily',
		dataRetention: 90
	});

	function handleSave() {
		// Save settings logic here
		console.log('Saving settings:', settings);
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">System Settings</h1>
			<p class="mt-1 text-sm text-gray-500">Configure global system parameters</p>
		</div>
		<button
			onclick={handleSave}
			class="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700"
		>
			<Save size={18} />
			Save Changes
		</button>
	</div>

	<!-- General Settings -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 px-6 py-4">
			<div class="flex items-center gap-2">
				<Globe size={20} class="text-purple-600" />
				<h2 class="text-lg font-semibold text-gray-900">General Settings</h2>
			</div>
		</div>
		<div class="space-y-6 p-6">
			<div>
				<label for="siteName" class="block text-sm font-medium text-gray-700">Site Name</label>
				<input
					id="siteName"
					type="text"
					bind:value={settings.siteName}
					class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
				/>
			</div>
			<div>
				<label for="siteUrl" class="block text-sm font-medium text-gray-700">Site URL</label>
				<input
					id="siteUrl"
					type="url"
					bind:value={settings.siteUrl}
					class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
				/>
			</div>
			<div>
				<label for="adminEmail" class="block text-sm font-medium text-gray-700">Admin Email</label>
				<input
					id="adminEmail"
					type="email"
					bind:value={settings.adminEmail}
					class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
				/>
			</div>
		</div>
	</div>

	<!-- Security Settings -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 px-6 py-4">
			<div class="flex items-center gap-2">
				<Shield size={20} class="text-purple-600" />
				<h2 class="text-lg font-semibold text-gray-900">Security Settings</h2>
			</div>
		</div>
		<div class="space-y-6 p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="font-medium text-gray-900">Two-Factor Authentication</p>
					<p class="text-sm text-gray-500">Require 2FA for all users</p>
				</div>
				<label class="relative inline-flex cursor-pointer items-center">
					<input type="checkbox" bind:checked={settings.twoFactorAuth} class="peer sr-only" />
					<div class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300"></div>
				</label>
			</div>

			<div>
				<label for="sessionTimeout" class="block text-sm font-medium text-gray-700">Session Timeout (minutes)</label>
				<input
					id="sessionTimeout"
					type="number"
					bind:value={settings.sessionTimeout}
					class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
				/>
			</div>

			<div>
				<label for="maxLoginAttempts" class="block text-sm font-medium text-gray-700">Max Login Attempts</label>
				<input
					id="maxLoginAttempts"
					type="number"
					bind:value={settings.maxLoginAttempts}
					class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
				/>
			</div>
		</div>
	</div>

	<!-- System Settings -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 px-6 py-4">
			<div class="flex items-center gap-2">
				<Database size={20} class="text-purple-600" />
				<h2 class="text-lg font-semibold text-gray-900">System Settings</h2>
			</div>
		</div>
		<div class="space-y-6 p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="font-medium text-gray-900">Maintenance Mode</p>
					<p class="text-sm text-gray-500">Disable access for all users except superadmins</p>
				</div>
				<label class="relative inline-flex cursor-pointer items-center">
					<input type="checkbox" bind:checked={settings.maintenanceMode} class="peer sr-only" />
					<div class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300"></div>
				</label>
			</div>

			<div class="flex items-center justify-between">
				<div>
					<p class="font-medium text-gray-900">User Registration</p>
					<p class="text-sm text-gray-500">Allow new users to register</p>
				</div>
				<label class="relative inline-flex cursor-pointer items-center">
					<input type="checkbox" bind:checked={settings.registrationEnabled} class="peer sr-only" />
					<div class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300"></div>
				</label>
			</div>

			<div>
				<label for="backupFrequency" class="block text-sm font-medium text-gray-700">Backup Frequency</label>
				<select
					id="backupFrequency"
					bind:value={settings.backupFrequency}
					class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
				>
					<option value="hourly">Hourly</option>
					<option value="daily">Daily</option>
					<option value="weekly">Weekly</option>
					<option value="monthly">Monthly</option>
				</select>
			</div>

			<div>
				<label for="dataRetention" class="block text-sm font-medium text-gray-700">Data Retention (days)</label>
				<input
					id="dataRetention"
					type="number"
					bind:value={settings.dataRetention}
					class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
				/>
			</div>
		</div>
	</div>

	<!-- Notification Settings -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 px-6 py-4">
			<div class="flex items-center gap-2">
				<Bell size={20} class="text-purple-600" />
				<h2 class="text-lg font-semibold text-gray-900">Notification Settings</h2>
			</div>
		</div>
		<div class="space-y-6 p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="font-medium text-gray-900">Email Notifications</p>
					<p class="text-sm text-gray-500">Send email notifications for system events</p>
				</div>
				<label class="relative inline-flex cursor-pointer items-center">
					<input type="checkbox" bind:checked={settings.emailNotifications} class="peer sr-only" />
					<div class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300"></div>
				</label>
			</div>
		</div>
	</div>
</div>
