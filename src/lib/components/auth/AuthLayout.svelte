<script lang="ts">
	import type { Snippet } from 'svelte';
	
	interface Props {
		title: string;
		subtitle?: string;
		children: Snippet;
		footer?: Snippet;
	}
	
	let { title, subtitle, children, footer }: Props = $props();
</script>

<div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
	<div class="w-full max-w-md space-y-8">
		<!-- Logo/Brand -->
		<div class="text-center">
			<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 shadow-lg">
				<svg 
					class="h-10 w-10 text-white" 
					fill="none" 
					stroke="currentColor" 
					viewBox="0 0 24 24"
				>
					<path 
						stroke-linecap="round" 
						stroke-linejoin="round" 
						stroke-width="2" 
						d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
					/>
				</svg>
			</div>
			<h2 class="mt-6 text-3xl font-bold tracking-tight text-gray-900">
				{title}
			</h2>
			{#if subtitle}
				<p class="mt-2 text-sm text-gray-600">
					{subtitle}
				</p>
			{/if}
		</div>

		<!-- Main Content Card -->
		<div class="rounded-xl bg-white px-8 py-10 shadow-2xl ring-1 ring-gray-900/5">
			{@render children()}
		</div>

		<!-- Footer -->
		{#if footer}
			<div class="text-center">
				{@render footer()}
			</div>
		{/if}
	</div>
</div>
