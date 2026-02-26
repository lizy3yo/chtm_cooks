<script lang="ts">
	import type { Snippet } from 'svelte';
	import logo from '$lib/assets/CHTM_LOGO.png';
	
	interface Props {
		title: string;
		subtitle?: string;
		children: Snippet;
		footer?: Snippet;
	}
	
	let { title, subtitle, children, footer }: Props = $props();
</script>

<div class="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8 relative overflow-hidden">
	<!-- Decorative Background Elements -->
	<div class="absolute inset-0 overflow-hidden pointer-events-none">
		<div class="absolute top-0 right-0 w-96 h-96 bg-pink-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
		<div class="absolute bottom-0 left-0 w-96 h-96 bg-rose-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
	</div>

	<!-- Main Content -->
	<div class="relative z-10 w-full max-w-md space-y-6 animate-scaleIn">
		<!-- Logo/Brand -->
		<div class="text-center">
			<div class="mx-auto mb-6 flex justify-center">
				<div class="relative group">
					<div class="absolute inset-0 bg-gradient-to-r from-pink-600 to-rose-600 rounded-3xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity duration-300"></div>
					<img 
						src={logo} 
						alt="CHTM Logo" 
						class="relative h-24 w-auto object-contain drop-shadow-2xl transform group-hover:scale-105 transition-transform duration-300"
					/>
				</div>
			</div>
			<h2 class="text-3xl md:text-4xl font-bold tracking-tight text-gray-900 mb-2">
				{title}
			</h2>
			{#if subtitle}
				<p class="text-sm md:text-base text-gray-600">
					{subtitle}
				</p>
			{/if}
		</div>

		<!-- Main Content Card -->
		<div class="relative bg-white rounded-3xl px-8 py-10 shadow-2xl border border-pink-100 backdrop-blur-sm">
			<!-- Decorative corner accents -->
			<div class="absolute top-0 left-0 w-20 h-20 bg-gradient-to-br from-pink-100 to-transparent rounded-tl-3xl opacity-50"></div>
			<div class="absolute bottom-0 right-0 w-20 h-20 bg-gradient-to-tl from-rose-100 to-transparent rounded-br-3xl opacity-50"></div>
			
			<div class="relative z-10">
				{@render children()}
			</div>
		</div>

		<!-- Footer -->
		{#if footer}
			<div class="text-center bg-white/50 backdrop-blur-sm rounded-2xl px-6 py-4 border border-pink-100">
				{@render footer()}
			</div>
		{/if}

		<!-- Back to Home Link -->
		<div class="text-center">
			<a 
				href="/" 
				class="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-pink-600 transition-colors duration-200 group"
			>
				<svg class="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
				</svg>
				Back to Home
			</a>
		</div>
	</div>
</div>

<style>
	@keyframes blob {
		0%, 100% {
			transform: translate(0, 0) scale(1);
		}
		33% {
			transform: translate(30px, -50px) scale(1.1);
		}
		66% {
			transform: translate(-20px, 20px) scale(0.9);
		}
	}

	.animate-blob {
		animation: blob 7s infinite;
	}

	.animation-delay-2000 {
		animation-delay: 2s;
	}
</style>
