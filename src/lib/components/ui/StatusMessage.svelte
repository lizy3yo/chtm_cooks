<script lang="ts">
	import { fade } from 'svelte/transition';
	
	interface Props {
		type: 'success' | 'error' | 'warning' | 'info';
		title?: string;
		message?: string;
		children?: import('svelte').Snippet;
		action?: {
			label: string;
			onClick: () => void;
		};
		class?: string;
	}
	
	let { 
		type, 
		title, 
		message,
		children,
		action,
		class: className = ''
	}: Props = $props();
	
	const config = $derived({
		success: {
			bgColor: 'bg-green-50',
			borderColor: 'border-green-200',
			textColor: 'text-green-900',
			iconColor: 'text-green-600',
			icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
		},
		error: {
			bgColor: 'bg-red-50',
			borderColor: 'border-red-200',
			textColor: 'text-red-900',
			iconColor: 'text-red-600',
			icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z'
		},
		warning: {
			bgColor: 'bg-yellow-50',
			borderColor: 'border-yellow-200',
			textColor: 'text-yellow-900',
			iconColor: 'text-yellow-600',
			icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
		},
		info: {
			bgColor: 'bg-blue-50',
			borderColor: 'border-blue-200',
			textColor: 'text-blue-900',
			iconColor: 'text-blue-600',
			icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
		}
	}[type]);
</script>

<div 
	class="rounded-lg border p-4 {config.bgColor} {config.borderColor} {className}"
	role="alert"
	transition:fade={{ duration: 200 }}
>
	<div class="flex items-start">
		<!-- Icon -->
		<svg 
			class="h-6 w-6 flex-shrink-0 {config.iconColor}" 
			fill="none" 
			stroke="currentColor" 
			viewBox="0 0 24 24"
		>
			<path 
				stroke-linecap="round" 
				stroke-linejoin="round" 
				stroke-width="2" 
				d={config.icon}
			/>
		</svg>
		
		<!-- Content -->
		<div class="ml-3 flex-1">
			{#if title}
				<h3 class="text-sm font-semibold {config.textColor}">
					{title}
				</h3>
			{/if}
			
			{#if message}
				<p class="text-sm {config.textColor} {title ? 'mt-1' : ''}">
					{message}
				</p>
			{/if}
			
			{#if children}
				<div class="text-sm {config.textColor} {title || message ? 'mt-2' : ''}">
					{@render children()}
				</div>
			{/if}
			
			{#if action}
				<button
					type="button"
					onclick={action.onClick}
					class="mt-3 inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors {config.textColor} hover:bg-white/50"
				>
					{action.label}
					<svg class="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
					</svg>
				</button>
			{/if}
		</div>
	</div>
</div>
