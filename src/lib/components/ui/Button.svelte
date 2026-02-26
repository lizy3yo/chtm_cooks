<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	
	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
		size?: 'sm' | 'md' | 'lg';
		fullWidth?: boolean;
		loading?: boolean;
		children: Snippet;
	}
	
	let {
		variant = 'primary',
		size = 'md',
		fullWidth = false,
		loading = false,
		disabled = false,
		type = 'button',
		class: className = '',
		children,
		...restProps
	}: Props = $props();
	
	const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
	
	const variantClasses = {
		primary: 'bg-gradient-to-r from-pink-600 to-rose-600 text-white hover:from-pink-700 hover:to-rose-700 focus:ring-pink-500 active:from-pink-800 active:to-rose-800 shadow-md hover:shadow-lg',
		secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500 active:bg-gray-800',
		outline: 'border-2 border-pink-300 bg-transparent text-pink-700 hover:bg-pink-50 focus:ring-pink-500',
		danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 active:bg-red-800',
		ghost: 'bg-transparent text-gray-700 hover:bg-pink-50 focus:ring-pink-500'
	};
	
	const sizeClasses = {
		sm: 'px-3 py-1.5 text-sm',
		md: 'px-4 py-2.5 text-sm',
		lg: 'px-6 py-3 text-base'
	};
	
	const buttonClasses = $derived(
		`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`
	);
</script>

<button
	{type}
	class={buttonClasses}
	disabled={disabled || loading}
	{...restProps}
>
	{#if loading}
		<svg 
			class="mr-2 h-4 w-4 animate-spin" 
			xmlns="http://www.w3.org/2000/svg" 
			fill="none" 
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<circle 
				class="opacity-25" 
				cx="12" 
				cy="12" 
				r="10" 
				stroke="currentColor" 
				stroke-width="4"
			></circle>
			<path 
				class="opacity-75" 
				fill="currentColor" 
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			></path>
		</svg>
		<span>Loading...</span>
	{:else}
		{@render children()}
	{/if}
</button>
