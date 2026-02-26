<script lang="ts">
	import type { Snippet } from 'svelte';
	
	interface Props {
		type?: 'success' | 'error' | 'warning' | 'info';
		title?: string;
		dismissible?: boolean;
		onDismiss?: () => void;
		children: Snippet;
	}
	
	let {
		type = 'info',
		title,
		dismissible = false,
		onDismiss,
		children
	}: Props = $props();
	
	const typeStyles = {
		success: {
			container: 'bg-green-50 border-green-200 text-green-800',
			icon: 'text-green-400',
			iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
		},
		error: {
			container: 'bg-red-50 border-red-200 text-red-800',
			icon: 'text-red-400',
			iconPath: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z'
		},
		warning: {
			container: 'bg-yellow-50 border-yellow-200 text-yellow-800',
			icon: 'text-yellow-400',
			iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
		},
		info: {
			container: 'bg-blue-50 border-blue-200 text-blue-800',
			icon: 'text-blue-400',
			iconPath: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
		}
	};
	
	const styles = $derived(typeStyles[type]);
</script>

<div class="rounded-lg border p-4 {styles.container}" role="alert">
	<div class="flex items-start">
		<div class="flex-shrink-0">
			<svg 
				class="h-5 w-5 {styles.icon}" 
				xmlns="http://www.w3.org/2000/svg" 
				fill="none" 
				viewBox="0 0 24 24" 
				stroke="currentColor"
				aria-hidden="true"
			>
				<path 
					stroke-linecap="round" 
					stroke-linejoin="round" 
					stroke-width="2" 
					d={styles.iconPath}
				/>
			</svg>
		</div>
		
		<div class="ml-3 flex-1">
			{#if title}
				<h3 class="text-sm font-medium">
					{title}
				</h3>
			{/if}
			<div class="text-sm {title ? 'mt-2' : ''}">
				{@render children()}
			</div>
		</div>
		
		{#if dismissible}
			<div class="ml-auto pl-3">
				<button
					type="button"
					class="-mx-1.5 -my-1.5 inline-flex rounded-lg p-1.5 hover:bg-opacity-20 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 {styles.icon}"
					onclick={onDismiss}
					aria-label="Dismiss"
				>
					<svg 
						class="h-5 w-5" 
						xmlns="http://www.w3.org/2000/svg" 
						fill="none" 
						viewBox="0 0 24 24" 
						stroke="currentColor"
					>
						<path 
							stroke-linecap="round" 
							stroke-linejoin="round" 
							stroke-width="2" 
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>
		{/if}
	</div>
</div>
