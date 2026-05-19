<!--
	Offline Status Banner Component
	
	Industry Standard: Non-intrusive status indicator with sync controls
	Follows Material Design and iOS Human Interface Guidelines
-->

<script lang="ts">
	import { page } from '$app/stores';
	import { syncStatus, forceSyncNow, type SyncResult } from '$lib/services/syncService';
	import { fade, slide } from 'svelte/transition';

	let syncing = $state(false);
	let syncResult: SyncResult | null = $state(null);
	let showSyncResult = $state(false);

	async function handleManualSync() {
		if (syncing || !$syncStatus.online) return;

		syncing = true;
		syncResult = null;
		showSyncResult = false;

		try {
			const result = await forceSyncNow();
			syncResult = result;
			showSyncResult = true;

			// Hide result after 3 seconds
			setTimeout(() => {
				showSyncResult = false;
			}, 3000);
		} catch (error) {
			console.error('Manual sync failed:', error);
		} finally {
			syncing = false;
		}
	}

	function formatLastSync(timestamp: number | null): string {
		if (!timestamp) return 'Never';

		const seconds = Math.floor((Date.now() - timestamp) / 1000);

		if (seconds < 60) return 'Just now';
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
		if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
		return `${Math.floor(seconds / 86400)}d ago`;
	}
</script>

<!-- Offline Banner -->
{#if !$syncStatus.online}
	<div
		class="fixed top-0 right-0 left-0 z-50 bg-yellow-500 px-4 py-2 text-white shadow-lg"
		transition:slide={{ duration: 200 }}
		role="alert"
		aria-live="polite"
	>
		<div class="container mx-auto flex items-center justify-between">
			<div class="flex items-center gap-2">
				<svg
					class="h-5 w-5"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
					/>
				</svg>
				<span class="text-sm font-medium">You're offline</span>
			</div>
			<span class="text-xs opacity-90">Changes will sync when you're back online</span>
		</div>
	</div>
{/if}

<!-- Sync Status Badge (Bottom Right) -->
{#if $syncStatus.online && ($syncStatus.syncing || $syncStatus.pendingActions > 0 || showSyncResult)}
	<div
		class="fixed right-4 bottom-4 z-40"
		transition:fade={{ duration: 200 }}
		role="status"
		aria-live="polite"
	>
		{#if $syncStatus.syncing || syncing}
			<!-- Syncing -->
			<button
				class="flex cursor-wait items-center gap-2 rounded-lg bg-blue-500 px-4 py-3 text-white shadow-lg"
				disabled
				aria-label="Syncing in progress"
			>
				<svg
					class="h-5 w-5 animate-spin"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
				<span class="text-sm font-medium">Syncing...</span>
			</button>
		{:else if showSyncResult && syncResult}
			<!-- Sync Result -->
			<div
				class="border-2 bg-white {syncResult.success
					? 'border-green-500'
					: 'border-red-500'} rounded-lg px-4 py-3 shadow-lg"
				transition:fade={{ duration: 200 }}
			>
				<div class="flex items-center gap-2">
					{#if syncResult.success}
						<svg
							class="h-5 w-5 text-green-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						<span class="text-sm font-medium text-green-700">Synced successfully</span>
					{:else}
						<svg
							class="h-5 w-5 text-red-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
						<span class="text-sm font-medium text-red-700">Sync failed</span>
					{/if}
				</div>
				{#if syncResult.syncedActions > 0}
					<p class="mt-1 text-xs text-gray-600">{syncResult.syncedActions} action(s) synced</p>
				{/if}
			</div>
		{:else if $syncStatus.pendingActions > 0}
			<!-- Pending Actions -->
			<button
				onclick={handleManualSync}
				class="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-white shadow-lg transition-colors hover:bg-orange-600"
				aria-label="Sync {$syncStatus.pendingActions} pending action(s)"
			>
				<svg
					class="h-5 w-5"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div class="text-left">
					<div class="text-sm font-medium">{$syncStatus.pendingActions} pending</div>
					<div class="text-xs opacity-90">Tap to sync</div>
				</div>
			</button>
		{/if}
	</div>
{/if}

<!-- Sync Info (Bottom Left - Desktop Only) -->
{#if $syncStatus.online && $syncStatus.lastSync && ($page.url.pathname === '/' || $page.url.pathname.startsWith('/auth'))}
	<div
		class="sync-badge-left fixed bottom-4 left-4 z-40 hidden rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm transition-all duration-300 md:block"
		transition:fade={{ duration: 200 }}
	>
		<div class="flex items-center gap-2">
			<div
				class="h-2 w-2 rounded-full {$syncStatus.syncing
					? 'animate-pulse bg-blue-500'
					: 'bg-green-500'}"
				aria-hidden="true"
			></div>
			<span class="text-xs font-medium text-gray-600">
				Last sync: {formatLastSync($syncStatus.lastSync)}
			</span>
		</div>
	</div>
{/if}

<style>
	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	/* Adjust bottom-left sync badge position dynamically on desktop when a sidebar is present */
	@media (min-width: 1024px) {
		:global(body:has(aside)) .sync-badge-left {
			left: 19rem; /* Sidebar expanded width (18rem/w-72) + left-4 offset (1rem) */
		}

		:global(body:has(aside:has(.lg\:w-20))) .sync-badge-left {
			left: 6rem; /* Sidebar collapsed width (5rem/lg:w-20) + left-4 offset (1rem) */
		}
	}
</style>
