<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	// @ts-ignore - Package has incorrect type definitions but works at runtime
	import { DotLottieSvelte } from '@lottiefiles/dotlottie-svelte';
	import type { DotLottie } from '@lottiefiles/dotlottie-svelte';
	import equipmentImg from '$lib/assets/Equipment/v1/equipment.png';

	let visible = $state(false);
	let dotLottie: DotLottie | null = $state(null); // Svelte 5 rune

	function play() {
		dotLottie?.play();
	}
	function pause() {
		dotLottie?.pause();
	}

	onMount(() => {
		setTimeout(() => (visible = true), 80);
	});
</script>

<section id="home" class="hero">
	<!-- Background -->
	<div class="hero-bg" aria-hidden="true">
		<div class="gradient-layer"></div>
		<img src={equipmentImg} alt="" class="bg-image" draggable="false" />
	</div>

	<!-- Two-column layout -->
	<div class="hero-container">
		<!-- Left: Content -->
		<div class="hero-content" class:visible>
			<span class="hero-chip">
				<span class="chip-dot"></span>
				For Students · CHTM Cooks
			</span>

			<h1 class="hero-h1">
				Your Complete Guide to<br />
				<span class="h1-gradient">CHTM Cooks</span>
			</h1>

			<p class="hero-p">
				Learn how to borrow cooking equipment, track your requests, manage your Trust Score, and
				make every lab session count.
			</p>

			<div class="hero-btns">
				<button class="btn-primary" onclick={() => goto('/auth/login')}>
					Sign In to Portal
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M13 7l5 5-5 5M6 12h12" />
					</svg>
				</button>
				<button
					class="btn-ghost"
					onclick={() =>
						document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth' })}
				>
					Explore Features
				</button>
			</div>
		</div>

		<!-- Right: Lottie Animations -->
		<div class="hero-animations" class:visible>
			<div class="lottie-primary">
				<DotLottieSvelte
					src="https://lottie.host/b8c5e970-94c2-4db4-8b57-a38458f1f6bf/38GstfX0Uc.lottie"
					loop
					autoplay
					dotLottieRefCallback={(ref) => dotLottie = ref}
				/>
			</div>
			<div class="lottie-secondary">
				<DotLottieSvelte
					src="https://lottie.host/3f8f045f-a7f9-467c-b90e-5d8fec25020d/2QVqFu04nF.lottie"
					loop
					autoplay
				/>
			</div>
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

	.chip-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #e91e63;
		animation: pulse 2.2s ease-in-out infinite;
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
	}
	.hero-animations.visible {
		opacity: 1;
		transform: translateX(0);
	}

	@media (max-width: 1024px) {
		.hero-animations {
			transform: translateY(30px);
		}
		.hero-animations.visible {
			transform: translateY(0);
		}
	}

	.lottie-primary {
		width: 100%;
		height: 100%;
		position: relative;
		z-index: 2;
	}

	.lottie-secondary {
		position: absolute;
		width: 45%;
		height: 45%;
		bottom: 2%;
		right: -8%;
		z-index: 3;
		filter: drop-shadow(0 15px 25px rgba(233, 30, 99, 0.15));
		animation: float-lottie 6s ease-in-out infinite;
	}

	.hero-animations :global(div),
	.hero-animations :global(canvas) {
		width: 100% !important;
		height: 100% !important;
		display: block !important;
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
			max-width: 300px;
			height: 300px;
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

	.btn-ghost {
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
