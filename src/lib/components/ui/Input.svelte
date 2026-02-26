<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	
	interface Props extends Omit<HTMLInputAttributes, 'value'> {
		label?: string;
		error?: string;
		helperText?: string;
		id: string;
		value?: string;
	}
	
	let {
		label,
		error,
		helperText,
		id,
		class: className = '',
		type = 'text',
		value = $bindable(''),
		...restProps
	}: Props = $props();
	
	const inputClasses = $derived(
		`block w-full rounded-lg border px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-2 ${
			error
				? 'border-red-300 bg-red-50 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500'
				: 'border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:ring-pink-500'
		} disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 ${className}`
	);
</script>

<div class="w-full">
	{#if label}
		<label for={id} class="mb-2 block text-sm font-medium text-gray-700">
			{label}
			{#if restProps.required}
				<span class="text-red-500">*</span>
			{/if}
		</label>
	{/if}
	
	<input
		{id}
		{type}
		bind:value
		class={inputClasses}
		aria-invalid={error ? 'true' : 'false'}
		aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
		{...restProps}
	/>
	
	{#if error}
		<p id="{id}-error" class="mt-2 text-sm text-red-600" role="alert">
			{error}
		</p>
	{:else if helperText}
		<p id="{id}-helper" class="mt-2 text-sm text-gray-500">
			{helperText}
		</p>
	{/if}
</div>
