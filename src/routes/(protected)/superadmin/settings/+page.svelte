<script lang="ts">
	import { userSettingsStore } from '$lib/stores/userSettings';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import { Moon, Sun, Type, Eye, RotateCcw } from 'lucide-svelte';

	let settings = $state($userSettingsStore);

	userSettingsStore.subscribe(value => {
		settings = value;
	});

	function toggleSetting(key: keyof typeof settings) {
		userSettingsStore.updateSetting(key, !settings[key]);
		toastStore.success('Setting updated successfully');
	}

	function updateFontSize(size: 'small' | 'medium' | 'large' | 'extra-large') {
		userSettingsStore.updateSetting('fontSize', size);
		toastStore.success('Font size updated');
	}

	async function resetSettings() {
		const confirmed = await confirmStore.warning(
			'Are you sure you want to reset all settings to default values? This action cannot be undone.',
			'Reset Settings',
			'Reset to Default',
			'Keep Current Settings'
		);

		if (confirmed) {
			userSettingsStore.reset();
			toastStore.success('Settings reset to default values', 'Settings Reset');
		}
	}
</script>

<svelte:head>
	<title>Settings - Superadmin</title>
</svelte:head>

<div class="space-y-6 pb-8">
	<!-- Page Header -->
	<div class="flex items-start justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Settings</h1>
			<p class="mt-1 text-sm text-gray-500">Manage your account preferences and accessibility options</p>
		</div>
		<button
			onclick={resetSettings}
			class="flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 whitespace-nowrap"
		>
			<RotateCcw size={14} />
			Reset to Default
		</button>
	</div>

	<!-- Settings Sections -->
	<div class="space-y-4">
		<!-- Appearance Section -->
		<div class="rounded-lg bg-white shadow">
			<div class="border-b border-gray-200 px-6 py-4">
				<h2 class="text-base font-semibold text-gray-900">Appearance</h2>
				<p class="mt-1 text-sm text-gray-500">Customize how the application looks</p>
			</div>
			<div class="divide-y divide-gray-200">
				<!-- Dark Mode -->
				<div class="flex items-center justify-between px-6 py-4">
					<div class="flex items-start gap-3">
						<div class="mt-0.5 rounded-lg bg-pink-50 p-2">
							{#if settings.darkMode}
								<Moon size={18} class="text-pink-600" />
							{:else}
								<Sun size={18} class="text-pink-600" />
							{/if}
						</div>
						<div>
							<h3 class="text-sm font-medium text-gray-900">Dark Mode</h3>
							<p class="mt-0.5 text-xs text-gray-500">Switch between light and dark theme</p>
						</div>
					</div>
					<button
						onclick={() => toggleSetting('darkMode')}
						class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 {settings.darkMode ? 'bg-pink-600' : 'bg-gray-300'}"
						role="switch"
						aria-checked={settings.darkMode}
						aria-label="Toggle dark mode"
					>
						<span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {settings.darkMode ? 'translate-x-6' : 'translate-x-1'}"></span>
					</button>
				</div>

				<!-- Font Size -->
				<div class="px-6 py-4">
					<div class="flex items-start gap-3">
						<div class="mt-0.5 rounded-lg bg-pink-50 p-2">
							<Type size={18} class="text-pink-600" />
						</div>
						<div class="flex-1">
							<h3 class="text-sm font-medium text-gray-900">Font Size</h3>
							<p class="mt-0.5 text-xs text-gray-500">Adjust text size for better readability</p>
							<div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
								<button
									onclick={() => updateFontSize('small')}
									class="flex h-10 items-center justify-center rounded-lg border font-medium transition-all {settings.fontSize === 'small' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-pink-500'}"
								>
									<span class="text-xs">Small</span>
								</button>
								<button
									onclick={() => updateFontSize('medium')}
									class="flex h-10 items-center justify-center rounded-lg border font-medium transition-all {settings.fontSize === 'medium' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-pink-500'}"
								>
									<span class="text-sm">Medium</span>
								</button>
								<button
									onclick={() => updateFontSize('large')}
									class="flex h-10 items-center justify-center rounded-lg border font-medium transition-all {settings.fontSize === 'large' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-pink-500'}"
								>
									<span class="text-base">Large</span>
								</button>
								<button
									onclick={() => updateFontSize('extra-large')}
									class="flex h-10 items-center justify-center rounded-lg border font-medium transition-all {settings.fontSize === 'extra-large' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-pink-500'}"
								>
									<span class="text-lg leading-none">XL</span>
								</button>
							</div>
						</div>
					</div>
				</div>

				<!-- High Contrast -->
				<div class="flex items-center justify-between px-6 py-4">
					<div class="flex items-start gap-3">
						<div class="mt-0.5 rounded-lg bg-pink-50 p-2">
							<Eye size={18} class="text-pink-600" />
						</div>
						<div>
							<h3 class="text-sm font-medium text-gray-900">High Contrast</h3>
							<p class="mt-0.5 text-xs text-gray-500">Increase text contrast for better visibility (WCAG AAA)</p>
						</div>
					</div>
					<button
						onclick={() => toggleSetting('highContrast')}
						class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 {settings.highContrast ? 'bg-pink-600' : 'bg-gray-300'}"
						role="switch"
						aria-checked={settings.highContrast}
						aria-label="Toggle high contrast"
					>
						<span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {settings.highContrast ? 'translate-x-6' : 'translate-x-1'}"></span>
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
