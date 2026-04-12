<script lang="ts">
	import { scale, fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import type { ConfirmDialog } from '$lib/stores/confirm';
	
	interface Props {
		dialog: ConfirmDialog;
	}
	
	let { dialog }: Props = $props();
	
	const typeConfig = {
		danger: {
			iconBg: 'bg-red-100',
			iconColor: 'text-red-600',
			confirmButton: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
			icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />`
		},
		warning: {
			iconBg: 'bg-yellow-100',
			iconColor: 'text-yellow-600',
			confirmButton: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
			icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />`
		},
		info: {
			iconBg: 'bg-blue-100',
			iconColor: 'text-blue-600',
			confirmButton: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
			icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />`
		},
		default: {
			iconBg: 'bg-gray-100',
			iconColor: 'text-gray-600',
			confirmButton: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
			icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />`
		}
	};
	
	const config = $derived(typeConfig[dialog.type]);
	
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			dialog.onCancel();
		} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			dialog.onConfirm();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<button
	type="button"
	class="fixed inset-0 z-[9998] min-h-[100dvh] w-screen bg-black/50 backdrop-blur-sm"
	transition:fade={{ duration: 200 }}
	onclick={dialog.onCancel}
	aria-label="Close dialog"
	tabindex="-1"
></button>

<!-- Dialog -->
<div
	role="dialog"
	aria-modal="true"
	aria-labelledby="dialog-title"
	aria-describedby="dialog-description"
	class="fixed inset-0 z-[9999] flex min-h-[100dvh] w-screen items-center justify-center p-4"
>
	<div
		class="w-full max-w-sm rounded-xl bg-white shadow-xl ring-1 ring-black ring-opacity-5 sm:max-w-md"
		transition:scale={{ duration: 200, start: 0.95, easing: quintOut }}
	>
		<div class="p-5 sm:p-6">
			<div class="flex items-start">
				<!-- Icon -->
				<div class="flex-shrink-0">
					<div class="flex h-12 w-12 items-center justify-center rounded-full {config.iconBg}">
						<svg
							class="h-6 w-6 {config.iconColor}"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							{@html config.icon}
						</svg>
					</div>
				</div>
				
				<!-- Content -->
				<div class="ml-4 flex-1">
					<h3 id="dialog-title" class="text-lg font-semibold text-gray-900">
						{dialog.title}
					</h3>
					<p id="dialog-description" class="mt-2 text-sm text-gray-600">
						{dialog.message}
					</p>
				</div>
			</div>
			
			<!-- Actions -->
			<div class="mt-6 flex items-center justify-end gap-3">
				<button
					type="button"
					onclick={dialog.onCancel}
					class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
				>
					{dialog.cancelText}
				</button>
				<button
					type="button"
					onclick={dialog.onConfirm}
					class="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 {config.confirmButton}"
				>
					{dialog.confirmText}
				</button>
			</div>
		</div>
	</div>
</div>
