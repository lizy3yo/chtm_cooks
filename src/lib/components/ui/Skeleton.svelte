<!--
	Skeleton Loader Component
	Professional skeleton loading component for content placeholders
	Industry standard shimmer animation with accessibility support
	
	Usage:
		<Skeleton class="h-4 w-32" />
		<Skeleton variant="circle" class="h-12 w-12" />
		<Skeleton variant="text" lines={3} />
-->
<script lang="ts">
	type SkeletonVariant = 'default' | 'circle' | 'text';
	
	let {
		variant = 'default',
		lines = 1,
		class: className = '',
		...props
	}: {
		variant?: SkeletonVariant;
		lines?: number;
		class?: string;
		[key: string]: any;
	} = $props();
</script>

{#if variant === 'text'}
	<div class="space-y-2" role="status" aria-label="Loading content">
		{#each Array(lines) as _, i}
			<div 
				class="h-4 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded animate-shimmer bg-[length:200%_100%] {className}"
				style="width: {i === lines - 1 ? '75%' : '100%'}"
			></div>
		{/each}
	</div>
{:else if variant === 'circle'}
	<div 
		class="rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer bg-[length:200%_100%] {className}"
		role="status"
		aria-label="Loading"
		{...props}
	></div>
{:else}
	<div 
		class="rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-shimmer bg-[length:200%_100%] {className}"
		role="status"
		aria-label="Loading"
		{...props}
	></div>
{/if}

<style>
	@keyframes shimmer {
		0% {
			background-position: -200% 0;
		}
		100% {
			background-position: 200% 0;
		}
	}
	
	.animate-shimmer {
		animation: shimmer 1.5s ease-in-out infinite;
	}
</style>
