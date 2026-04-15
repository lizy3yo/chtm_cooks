<script lang="ts">
	interface Props {
		progress?: number; // 0-100, undefined for indeterminate
		class?: string;
		color?: 'pink' | 'blue' | 'green' | 'amber';
	}

	let { progress, class: className = '', color = 'pink' }: Props = $props();

	const colorClasses = {
		pink: 'bg-pink-500',
		blue: 'bg-blue-500',
		green: 'bg-green-500',
		amber: 'bg-amber-500'
	};

	const barColor = $derived(colorClasses[color]);
</script>

<div class="w-full overflow-hidden rounded-full bg-gray-200 {className}">
	{#if progress !== undefined}
		<div
			class="h-full transition-all duration-300 ease-out {barColor}"
			style="width: {Math.min(100, Math.max(0, progress))}%"
			role="progressbar"
			aria-valuenow={progress}
			aria-valuemin={0}
			aria-valuemax={100}
		></div>
	{:else}
		<div
			class="h-full animate-pulse {barColor}"
			style="width: 40%"
			role="progressbar"
			aria-label="Loading"
		></div>
	{/if}
</div>
