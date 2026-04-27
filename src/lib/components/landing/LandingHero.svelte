<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	// @ts-ignore - Package has incorrect type definitions but works at runtime
	import { DotLottieSvelte } from '@lottiefiles/dotlottie-svelte';
	import type { DotLottie } from '@lottiefiles/dotlottie-svelte';
	import { School, LogIn, UserPlus } from 'lucide-svelte';
	import equipmentImg from '$lib/assets/Equipment/v1/equipment.png';

	let visible = $state(false);
	let animationLoaded = $state(false);
	let animationError = $state(false);
	let dotLottieRef: DotLottie | null = $state(null);
	let shouldLoadAnimation = $state(false);
	let animationContainer: HTMLElement | null = $state(null);

	// Preload animation data
	const ANIMATION_URL = 'https://lottie.host/3f8f045f-a7f9-467c-b90e-5d8fec25020d/2QVqFu04nF.lottie';
	
	onMount(() => {
		// Show content immediately
		setTimeout(() => (visible = true), 80);
		
		// Use Intersection Observer for lazy loading animation
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						shouldLoadAnimation = true;
						observer.disconnect();
					}
				});
			},
			{
				rootMargin: '50px', // Start loading 50px before visible
				threshold: 0.1
			}
		);

		if (animationContainer) {
			observer.observe(animationContainer);
		}
		
		// Preload animation in background with priority
		const preloadAnimation = async () => {
			try {
				const response = await fetch(ANIMATION_URL, {
					priority: 'high',
					cache: 'force-cache'
				} as RequestInit);
				if (response.ok) {
					console.log('Animation preloaded successfully');
				}
			} catch (error) {
				console.warn('Animation preload failed:', error);
			}
		};
		
		// Start preloading after a short delay to prioritize critical content
		setTimeout(preloadAnimation, 100);

		// Set timeout fallback for animation loading
		const loadTimeout = setTimeout(() => {
			if (!animationLoaded && shouldLoadAnimation) {
				console.warn('Animation load timeout - showing fallback');
				animationError = true;
				animationLoaded = true;
			}
		}, 5000); // 5 second timeout

		return () => {
			clearTimeout(loadTimeout);
			observer.disconnect();
		};
	});

	function handleDotLottieRef(ref: DotLottie) {
		dotLottieRef = ref;
		
		// Listen for ready event (when animation is loaded)
		ref.addEventListener('ready', () => {
			animationLoaded = true;
		});

		// Use try-catch for error handling
		try {
			if (!ref) {
				animationError = true;
				animationLoaded = true;
			}
		} catch (e) {
			animationError = true;
			animationLoaded = true;
		}
	}
</script>

<section id="home" class="hero">
	<!-- Background -->
	<div class="hero-bg" aria-hidden="true">
		<div class="gradient-layer"></div>
		<img 
			src={equipmentImg} 
			alt="" 
			class="bg-image" 
			draggable="false"
			loading="eager"
			decoding="async"
			fetchpriority="high"
		/>
	</div>

	<!-- Two-column layout -->
	<div class="hero-container">
		<!-- Left: Content -->
		<div class="hero-content" class:visible>
			<h1 class="hero-h1">
				CHTM <span class="h1-gradient">Cooks</span>
			</h1>

			<p class="hero-p">
				Culinary Operations and Organizational Kitchen System
			</p>

			<span class="hero-chip">
				<School size={16} />
				Gordon College
			</span>

			<div class="hero-btns">
				<button class="btn-primary" onclick={() => goto('/auth/login')}>
					<LogIn size={18} />
					Sign In
				</button>
				<button class="btn-ghost" onclick={() => goto('/auth/register')}>
					<UserPlus size={18} />
					Create Account
				</button>
			</div>
		</div>

		<!-- Right: Lottie Animations -->
		<div class="hero-animations" class:visible bind:this={animationContainer}>
			<!-- Loading skeleton -->
			{#if !animationLoaded}
				<div class="animation-skeleton">
					<div class="skeleton-pulse"></div>
				</div>
			{/if}

			<!-- Lottie Animation with lazy loading -->
			{#if shouldLoadAnimation}
				<div class="lottie-secondary" class:loaded={animationLoaded}>
					<DotLottieSvelte
						src={ANIMATION_URL}
						autoplay
						loop
						speed={1}
						dotLottieRefCallback={handleDotLottieRef}
					/>
				</div>
			{/if}

			<!-- Fallback static image if animation fails or not loaded -->
			{#if animationError}
				<div class="animation-fallback">
					<img 
						src={equipmentImg} 
						alt="Cooking equipment" 
						class="fallback-img"
						loading="lazy"
						decoding="async"
					/>
				</div>
			{/if}
		</div>
	</div>
</section>

<style>
	.hero {
		position: relative;
		min-height: 100vh;
		padding-top: 0;
		margin-top: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		/* Performance optimizations */
		contain: layout style paint;
		will-change: auto;
	}

	/* ── Background ───────────────────────── */
	.hero-bg {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	/* White → pink gradient sits on top of the image */
	.gradient-layer {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to bottom,
			rgba(255, 255, 255, 0) 0%,
			rgba(255, 255, 255, 0) 15%,
			rgba(253, 232, 240, 0.35) 55%,
			rgba(251, 182, 205, 0.65) 100%
		);
		z-index: 1;
	}

	/* The equipment image fills the full hero area */
	.bg-image {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center top;
		opacity: 0.55;
		pointer-events: none;
		user-select: none;
		z-index: 0;
		/* Performance optimizations */
		will-change: auto;
		content-visibility: auto;
	}

	/* ── Foreground ───────────────────────── */
	.hero-container {
		position: relative;
		z-index: 10;
		max-width: 1280px;
		margin: 0 auto;
		padding: 7rem 1.5rem 5rem;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4rem;
		align-items: center;
	}

	@media (max-width: 1024px) {
		.hero-container {
			grid-template-columns: 1fr;
			gap: 3rem;
		}
	}

	@media (max-width: 480px) {
		.hero-container {
			padding: 5rem 1rem 3rem;
			gap: 2rem;
		}
	}

	.hero-content {
		opacity: 0;
		transform: translateX(-30px);
		transition:
			opacity 0.9s ease,
			transform 0.9s ease;
	}
	.hero-content.visible {
		opacity: 1;
		transform: translateX(0);
	}

	@media (max-width: 1024px) {
		.hero-content {
			text-align: center;
			transform: translateY(30px);
		}
		.hero-content.visible {
			transform: translateY(0);
		}
	}

	.hero-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #c2185b;
		background: rgba(255, 255, 255, 0.82);
		border: 1px solid rgba(194, 24, 91, 0.2);
		backdrop-filter: blur(10px);
		padding: 0.375rem 1rem;
		border-radius: 999px;
		margin-bottom: 1.75rem;
	}

	@media (max-width: 1024px) {
		.hero-chip {
			justify-content: center;
		}
	}

	@media (max-width: 480px) {
		.hero-chip {
			font-size: 0.625rem;
			padding: 0.3rem 0.75rem;
			gap: 0.375rem;
			margin-bottom: 1.25rem;
		}
	}

	.hero-h1 {
		font-family: 'Inter', system-ui, sans-serif;
		font-size: clamp(2.25rem, 5.5vw, 3.75rem);
		font-weight: 900;
		color: #1a0a12;
		line-height: 1.1;
		letter-spacing: -0.03em;
		margin: 0 0 1.25rem;
	}

	@media (max-width: 1024px) {
		.hero-h1 {
			text-align: center;
		}
	}

	@media (max-width: 480px) {
		.hero-h1 {
			font-size: clamp(1.875rem, 8vw, 2.5rem);
			margin: 0 0 1rem;
		}
	}

	.h1-gradient {
		background: linear-gradient(135deg, #e91e63, #ad1457);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.hero-p {
		font-size: clamp(0.9375rem, 2vw, 1.125rem);
		color: #6b3a52;
		line-height: 1.75;
		margin: 0 0 2.25rem;
	}

	@media (max-width: 1024px) {
		.hero-p {
			max-width: 580px;
			margin-left: auto;
			margin-right: auto;
		}
	}

	@media (max-width: 480px) {
		.hero-p {
			font-size: 0.875rem;
			line-height: 1.6;
			margin: 0 0 1.75rem;
			padding: 0 0.5rem;
		}
	}

	.hero-btns {
		display: flex;
		gap: 0.875rem;
		flex-wrap: wrap;
	}

	@media (max-width: 1024px) {
		.hero-btns {
			justify-content: center;
		}
	}

	@media (max-width: 480px) {
		.hero-btns {
			flex-direction: column;
			gap: 0.75rem;
			width: 100%;
			max-width: 320px;
			margin: 0 auto;
		}
	}

	/* ── Right: Animations ───────────────────────── */
	.hero-animations {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transform: translateX(30px);
		transition:
			opacity 0.9s ease 0.2s,
			transform 0.9s ease 0.2s;
		width: 100%;
		max-width: 500px;
		height: 500px;
		/* Performance optimizations */
		will-change: opacity, transform;
		contain: layout style paint;
	}
	.hero-animations.visible {
		opacity: 1;
		transform: translateX(0);
	}

	/* Loading skeleton */
	.animation-skeleton {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(253, 232, 240, 0.3);
		border-radius: 2rem;
		z-index: 1;
	}

	.skeleton-pulse {
		width: 60%;
		height: 60%;
		background: linear-gradient(
			90deg,
			rgba(233, 30, 99, 0.1) 0%,
			rgba(233, 30, 99, 0.2) 50%,
			rgba(233, 30, 99, 0.1) 100%
		);
		background-size: 200% 100%;
		border-radius: 50%;
		animation: shimmer 1.5s ease-in-out infinite;
	}

	@keyframes shimmer {
		0% {
			background-position: -200% 0;
		}
		100% {
			background-position: 200% 0;
		}
	}

	@media (max-width: 1024px) {
		.hero-animations {
			transform: translateY(30px);
		}
		.hero-animations.visible {
			transform: translateY(0);
		}
	}

	/* Temporarily commented out phone animation styles */
	/* .lottie-primary {
		width: 100%;
		height: 100%;
		position: relative;
		z-index: 2;
	} */

	.lottie-secondary {
		position: absolute;
		width: 100%;
		height: 100%;
		inset: 0;
		z-index: 3;
		opacity: 0;
		transition: opacity 0.4s ease-in-out;
		/* Performance optimizations */
		will-change: opacity;
		contain: layout style paint;
		/* Ensure crisp rendering */
		image-rendering: -webkit-optimize-contrast;
		image-rendering: crisp-edges;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		backface-visibility: hidden;
		transform: translateZ(0);
	}

	.lottie-secondary.loaded {
		opacity: 1;
		animation: float-lottie 6s ease-in-out infinite 0.5s;
	}

	/* Fallback image */
	.animation-fallback {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2;
		animation: fadeIn 0.5s ease-in-out;
	}

	.fallback-img {
		width: 80%;
		height: 80%;
		object-fit: contain;
		filter: drop-shadow(0 15px 25px rgba(233, 30, 99, 0.15));
		animation: float-lottie 6s ease-in-out infinite;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.hero-animations :global(div),
	.hero-animations :global(canvas),
	.hero-animations :global(svg) {
		width: 100% !important;
		height: 100% !important;
		display: block !important;
		/* Ensure sharp rendering for SVG and canvas */
		image-rendering: -webkit-optimize-contrast !important;
		image-rendering: crisp-edges !important;
		shape-rendering: geometricPrecision !important;
		/* Performance optimizations */
		will-change: auto !important;
		contain: layout style paint !important;
	}

	/* Optimize Lottie container */
	.hero-animations :global(.lottie-container) {
		transform: translateZ(0);
		backface-visibility: hidden;
		perspective: 1000px;
	}

	@media (max-width: 768px) {
		.hero-animations {
			max-width: 400px;
			height: 400px;
		}
		.lottie-secondary {
			right: -2%;
		}
	}

	@media (max-width: 480px) {
		.hero-animations {
			max-width: 280px;
			height: 280px;
		}
		.animation-skeleton {
			border-radius: 1.5rem;
		}
		.skeleton-pulse {
			width: 70%;
			height: 70%;
		}
	}

	@keyframes float-lottie {
		0%, 100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-12px);
		}
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.875rem 2rem;
		background: linear-gradient(135deg, #e91e63, #c2185b);
		color: #fff;
		font-weight: 700;
		font-size: 0.9375rem;
		font-family: inherit;
		border: none;
		border-radius: 0.875rem;
		cursor: pointer;
		box-shadow: 0 4px 20px rgba(233, 30, 99, 0.35);
		transition:
			transform 0.25s ease,
			box-shadow 0.25s ease;
	}
	.btn-primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 32px rgba(233, 30, 99, 0.45);
	}

	@media (max-width: 480px) {
		.btn-primary {
			width: 100%;
			padding: 0.875rem 1.5rem;
			font-size: 0.875rem;
		}
	}

	.btn-ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.875rem 2rem;
		background: rgba(255, 255, 255, 0.75);
		color: #c2185b;
		font-weight: 700;
		font-size: 0.9375rem;
		font-family: inherit;
		border: 1.5px solid rgba(194, 24, 91, 0.22);
		border-radius: 0.875rem;
		cursor: pointer;
		backdrop-filter: blur(8px);
		transition:
			background 0.25s ease,
			border-color 0.25s ease;
	}
	.btn-ghost:hover {
		background: rgba(255, 255, 255, 0.95);
		border-color: #e91e63;
	}

	@media (max-width: 480px) {
		.btn-ghost {
			width: 100%;
			padding: 0.875rem 1.5rem;
			font-size: 0.875rem;
		}
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.4;
			transform: scale(0.75);
		}
	}
</style>
