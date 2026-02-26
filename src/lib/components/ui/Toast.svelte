<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import type { Toast } from '$lib/stores/toast';
	
	interface Props {
		toast: Toast;
		onDismiss: (id: string) => void;
	}
	
	let { toast, onDismiss }: Props = $props();
	
	const typeConfig = {
		success: {
			bgColor: 'bg-white',
			borderColor: 'border-green-500',
			iconBg: 'bg-green-100',
			iconColor: 'text-green-600',
			textColor: 'text-gray-900',
			icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />`
		},
		error: {
			bgColor: 'bg-white',
			borderColor: 'border-red-500',
			iconBg: 'bg-red-100',
			iconColor: 'text-red-600',
			textColor: 'text-gray-900',
			icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />`
		},
		warning: {
			bgColor: 'bg-white',
			borderColor: 'border-yellow-500',
			iconBg: 'bg-yellow-100',
			iconColor: 'text-yellow-600',
			textColor: 'text-gray-900',
			icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />`
		},
		info: {
			bgColor: 'bg-white',
			borderColor: 'border-blue-500',
			iconBg: 'bg-blue-100',
			iconColor: 'text-blue-600',
			textColor: 'text-gray-900',
			icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />`
		}
	};
	
	const config = $derived(typeConfig[toast.type]);
</script>

<div
	role="alert"
	aria-live="polite"
	class="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 {config.bgColor} border-l-4 {config.borderColor}"
	in:fly={{ y: -20, duration: 300, easing: quintOut }}
	out:fade={{ duration: 200 }}
>
	<div class="p-4">
		<div class="flex items-start">
			<!-- Icon -->
			<div class="flex-shrink-0">
				<div class="flex h-10 w-10 items-center justify-center rounded-full {config.iconBg}">
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
			<div class="ml-3 w-0 flex-1 pt-0.5">
				{#if toast.title}
					<p class="text-sm font-semibold {config.textColor}">
						{toast.title}
					</p>
				{/if}
				<p class="text-sm {config.textColor} {toast.title ? 'mt-1' : ''}">
					{toast.message}
				</p>
			</div>
			
			<!-- Dismiss Button -->
			{#if toast.dismissible}
				<div class="ml-4 flex flex-shrink-0">
					<button
						type="button"
						onclick={() => onDismiss(toast.id)}
						class="inline-flex rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 transition-colors"
						aria-label="Dismiss notification"
					>
						<svg
							class="h-5 w-5"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
							/>
						</svg>
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>
