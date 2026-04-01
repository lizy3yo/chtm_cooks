<script lang="ts">
	import { onMount } from 'svelte';
	
	let { show = $bindable(false) } = $props();
	let progress = $state(0);
	let intervalId: ReturnType<typeof setInterval> | null = null;
	
	$effect(() => {
		if (show) {
			progress = 0;
			startProgress();
		} else {
			completeProgress();
		}
	});
	
	function startProgress() {
		if (intervalId) clearInterval(intervalId);
		
		intervalId = setInterval(() => {
			if (progress < 90) {
				// Slow down as we approach 90%
				const increment = Math.random() * (90 - progress) * 0.1;
				progress = Math.min(progress + increment, 90);
			}
		}, 200);
	}
	
	function completeProgress() {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
		
		progress = 100;
		
		// Reset after animation completes
		setTimeout(() => {
			if (!show) {
				progress = 0;
			}
		}, 400);
	}
	
	onMount(() => {
		return () => {
			if (intervalId) clearInterval(intervalId);
		};
	});
</script>

{#if show || progress > 0}
	<div class="loading-bar-container" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress)}>
		<div class="loading-bar" style="width: {progress}%"></div>
	</div>
{/if}

<style>
	.loading-bar-container {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		z-index: 9999;
		background-color: transparent;
		overflow: hidden;
	}
	
	.loading-bar {
		height: 100%;
		background: linear-gradient(90deg, #ec4899 0%, #db2777 50%, #be185d 100%);
		box-shadow: 0 0 10px rgba(236, 72, 153, 0.5), 0 0 5px rgba(236, 72, 153, 0.3);
		transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		transform-origin: left;
	}
	
	.loading-bar::after {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: 100px;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4));
		animation: shimmer 1s infinite;
	}
	
	@keyframes shimmer {
		0% {
			transform: translateX(-100px);
		}
		100% {
			transform: translateX(100px);
		}
	}
	
	/* Dark mode support */
	:global(html.dark) .loading-bar {
		background: linear-gradient(90deg, #db2777 0%, #be185d 50%, #9f1239 100%);
		box-shadow: 0 0 10px rgba(219, 39, 119, 0.6), 0 0 5px rgba(219, 39, 119, 0.4);
	}
</style>
