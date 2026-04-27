<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isAuthenticated, user, isLoading } from '$lib/stores/auth';
	import favicon from '$lib/assets/CHTM_LOGO.png';
	import LandingNav from '$lib/components/landing/LandingNav.svelte';
	import LandingHero from '$lib/components/landing/LandingHero.svelte';
	import {
		Bot,
		QrCode,
		ChevronLeft,
		ChevronRight,
		Search,
		ShoppingCart,
		Send,
		CheckCircle2,
		Package,
		RefreshCw,
		BarChart3,
		Boxes
	} from 'lucide-svelte';

	let authCheckComplete = $state(false);
	let diffPosition = $state(50);
	let carouselEl: HTMLElement | null = $state(null);

	function scrollCarousel(direction: number) {
		if (!carouselEl) return;
		const scrollAmount = carouselEl.clientWidth;
		carouselEl.scrollBy({ left: scrollAmount * direction, behavior: 'smooth' });
	}

	function scrollToSlide(index: number) {
		if (!carouselEl) return;
		const scrollAmount = carouselEl.clientWidth * index;
		carouselEl.scrollTo({ left: scrollAmount, behavior: 'smooth' });
	}

	$effect(() => {
		if (!$isLoading && !authCheckComplete) {
			authCheckComplete = true;
			if ($isAuthenticated && $user) {
				const routes: Record<string, string> = {
					student: '/student/dashboard',
					instructor: '/instructor/dashboard',
					custodian: '/custodian/dashboard',
					superadmin: '/superadmin/dashboard',
					admin: '/superadmin/dashboard'
				};
				goto(routes[$user.role] || '/auth/login', { replaceState: true });
			}
		}
	});

	const requestSteps = [
		{
			step: 1,
			title: 'Browse Catalog',
			desc: 'Find cooking equipment with real-time stock info.',
			icon: Search
		},
		{
			step: 2,
			title: 'Add to Request',
			desc: 'Select items, quantities, and set your borrow schedule.',
			icon: ShoppingCart
		},
		{
			step: 3,
			title: 'Submit for Review',
			desc: 'Your request is sent to your class instructor for approval.',
			icon: Send
		},
		{
			step: 4,
			title: 'Instructor Approves',
			desc: 'Instructor reviews, then custodian prepares your items.',
			icon: CheckCircle2
		},
		{
			step: 5,
			title: 'Pick Up Equipment',
			desc: 'Show your QR code at the custodian desk and collect items.',
			icon: Package
		},
		{
			step: 6,
			title: 'Return On Time',
			desc: 'Return items on schedule to keep your Trust Score high.',
			icon: RefreshCw
		}
	];
</script>

<svelte:head>
	<title>CHTM Cooks · Student Guide</title>
	<meta
		name="description"
		content="Your complete guide to using the CHTM Cooks laboratory equipment management system as a student."
	/>
	<!-- Preconnect to external resources -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link rel="preconnect" href="https://lottie.host" crossorigin="anonymous" />
	<!-- DNS prefetch for faster resolution -->
	<link rel="dns-prefetch" href="https://lottie.host" />
	<!-- Preload critical fonts -->
	<link
		rel="preload"
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
		as="style"
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
		rel="stylesheet"
	/>
	<!-- Preload Lottie animation -->
	<link
		rel="preload"
		href="https://lottie.host/3f8f045f-a7f9-467c-b90e-5d8fec25020d/2QVqFu04nF.lottie"
		as="fetch"
		crossorigin="anonymous"
	/>
</svelte:head>

{#if $isLoading}
	<div class="loading-screen">
		<div class="loading-inner">
			<div class="loading-logo-wrap">
				<div class="loading-glow"></div>
				<img src={favicon} alt="CHTM Logo" class="loading-logo" />
			</div>
			<div class="loading-dots">
				<span style="animation-delay:0ms"></span>
				<span style="animation-delay:160ms"></span>
				<span style="animation-delay:320ms"></span>
			</div>
		</div>
	</div>
{/if}

<div class="page-root" class:hidden={$isLoading}>
	<LandingNav />
	<LandingHero />

	<!-- ══ CORE FEATURES ════════════════════════════════ -->
	<section id="core-features" class="guide-section features-modern">
		<div class="section-wrap">
			<div class="features-header">
				<span class="section-chip gradient-chip">
					<span class="chip-icon">✨</span>
					Platform Essentials
				</span>
				<h2 class="section-heading gradient-text">Everything You Need</h2>
				<p class="section-sub">
					A complete suite of tools designed to make your laboratory experience seamless,
					professional, and efficient.
				</p>
			</div>

			<div class="features-grid">
				<!-- Dashboard Feature -->
				<div class="feature-card card-primary" data-tilt>
					<div class="card-glow"></div>
					<div class="card-content">
						<div class="feature-icon-wrapper">
							<div class="icon-bg icon-bg-pink"></div>
							<BarChart3 size={40} strokeWidth={2.5} class="feature-icon" />
						</div>
						<div class="feature-text">
							<h3 class="feature-title">Dashboard & Trust Score</h3>
							<p class="feature-desc">
								Your personal hub. Track active loans, monitor due dates, and maintain your Trust
								Score with on-time returns and performance metrics.
							</p>
							<div class="feature-stats">
								<div class="stat-item">
									<div class="stat-value">100%</div>
									<div class="stat-label">Real-time</div>
								</div>
								<div class="stat-divider"></div>
								<div class="stat-item">
									<div class="stat-value">24/7</div>
									<div class="stat-label">Monitoring</div>
								</div>
								<div class="stat-divider"></div>
								<div class="stat-item">
									<div class="stat-value">7-Day</div>
									<div class="stat-label">Alerts</div>
								</div>
							</div>
						</div>
					</div>
					<div class="card-shine"></div>
				</div>

				<!-- Catalog Feature -->
				<div class="feature-card card-secondary" data-tilt>
					<div class="card-glow"></div>
					<div class="card-content">
						<div class="feature-icon-wrapper">
							<div class="icon-bg icon-bg-purple"></div>
							<Boxes size={40} strokeWidth={2.5} class="feature-icon" />
						</div>
						<div class="feature-text">
							<h3 class="feature-title">Live Catalog</h3>
							<p class="feature-desc">
								Browse available equipment with real-time stock updates. Search, filter, and view
								detailed specifications before adding items to your request.
							</p>
							<div class="feature-tags">
								<span class="tag">Real-time Sync</span>
								<span class="tag">Advanced Search</span>
								<span class="tag">HD Photos</span>
							</div>
						</div>
					</div>
					<div class="card-shine"></div>
				</div>
			</div>
		</div>

		<!-- Animated Background Elements -->
		<div class="features-bg">
			<div class="bg-orb orb-1"></div>
			<div class="bg-orb orb-2"></div>
			<div class="bg-orb orb-3"></div>
		</div>
	</section>

	<!-- ══ REQUEST FLOW ══════════════════════════ -->
	<section id="request-flow" class="guide-section flow-section">
		<div class="section-wrap">
			<div class="flow-header">
				<span class="section-chip gradient-chip">
					<span class="chip-icon">📝</span>
					Request Flow
				</span>
				<h2 class="section-heading flow-heading">How it works?</h2>
				<p class="section-sub">
					The entire borrowing process is 100% digital — from request to return in six clear steps.
				</p>
			</div>
		</div>
		<div class="carousel-container">
			<div class="carousel-track" bind:this={carouselEl}>
				{#each requestSteps as s, index}
					{@const Icon = s.icon}
					<div class="carousel-slide">
						<div class="flow-card" style="--card-index: {index}">
							<div class="card-number">0{s.step}</div>
							<div class="card-inner">
								<div class="flow-icon-wrapper">
									<Icon size={64} strokeWidth={2} class="flow-icon" />
								</div>
								<h3 class="flow-title">{s.title}</h3>
								<p class="flow-description">{s.desc}</p>
							</div>
							<div class="card-gradient"></div>
						</div>
					</div>
				{/each}
			</div>

			<div class="carousel-nav">
				<button class="nav-btn nav-prev" onclick={() => scrollCarousel(-1)} aria-label="Previous step">
					<ChevronLeft size={24} strokeWidth={2.5} />
				</button>
				<button class="nav-btn nav-next" onclick={() => scrollCarousel(1)} aria-label="Next step">
					<ChevronRight size={24} strokeWidth={2.5} />
				</button>
			</div>

			<div class="carousel-dots">
				{#each requestSteps as _, index}
					<button
						class="dot"
						class:active={index === 0}
						onclick={() => scrollToSlide(index)}
						aria-label="Go to step {index + 1}"
					></button>
				{/each}
			</div>
		</div>
	</section>

	<!-- ══ SMART FEATURES ════════════════════════════════ -->
	<section id="smart-features" class="guide-section">
		<div class="section-wrap">
			<span class="section-chip">🚀 Smart Technology</span>
			<h2 class="section-heading">Next-Gen Capabilities</h2>
			<p class="section-sub">
				Leverage cutting-edge AI and contactless features to streamline your entire borrowing
				process.
			</p>

			<div class="diff-showcase" style="--pos: {diffPosition}%">
				<!-- Base Layer: QR Code (Light Theme) -->
				<div class="diff-item diff-qr">
					<div class="diff-grid">
						<div class="diff-visual diff-visual-qr">
							<div class="mockup-qr">
								<div class="qr-corners"></div>
								<div class="qr-blocks">
									{#each Array(16) as _}
										<div class="qr-block"></div>
									{/each}
								</div>
								<div class="qr-scan-line"></div>
							</div>
						</div>
						<div class="diff-content diff-content-right">
							<div class="diff-text-block light-theme">
								<div class="diff-header">
									<div class="icon-wrap green"><QrCode size={28} strokeWidth={2.5} /></div>
									<h3>QR Code System</h3>
								</div>
								<p>
									Contactless handoffs. Generate a unique QR code for approved requests to verify
									identity and quickly retrieve or return items.
								</p>
								<ul class="diff-list">
									<li>Auto-generated for each request</li>
									<li>Contactless custodian scanning</li>
									<li>Digital verification and records</li>
								</ul>
							</div>
						</div>
					</div>
				</div>

				<!-- Top Layer: AI Assistant (Dark Theme, Clipped) -->
				<div
					class="diff-item diff-ai"
					style="clip-path: polygon(0 0, {diffPosition}% 0, {diffPosition}% 100%, 0 100%);"
				>
					<div class="diff-grid">
						<div class="diff-content diff-content-left">
							<div class="diff-text-block dark-theme">
								<div class="diff-header">
									<div class="icon-wrap blue"><Bot size={28} strokeWidth={2.5} /></div>
									<h3>AI Assistant</h3>
								</div>
								<p>
									Your 24/7 smart helper. Ask questions about equipment, system features, or get
									step-by-step guidance on navigating the platform.
								</p>
								<ul class="diff-list">
									<li>Instant answers on any page</li>
									<li>Step-by-step request guidance</li>
									<li>Always available via chat bubble</li>
								</ul>
							</div>
						</div>
						<div class="diff-visual diff-visual-ai">
							<div class="mockup-chat dark">
								<div class="chat-bubble chat-user">Do we have stand mixers?</div>
								<div class="chat-bubble chat-ai">
									<span class="ai-dot"></span>
									Yes, there are 4 KitchenAid mixers available!
								</div>
								<div class="chat-input-bar">
									<div class="chat-input-pill"></div>
									<div class="chat-send-btn"></div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Invisible native range slider for interaction -->
				<input
					type="range"
					min="0"
					max="100"
					bind:value={diffPosition}
					class="diff-range-input"
					aria-label="Slide to compare AI Assistant and QR Code features"
				/>

				<!-- Slider Handle Visual -->
				<div class="diff-resizer-handle" style="left: {diffPosition}%;">
					<div class="handle-line"></div>
					<div class="handle-knob">
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg
						>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg
						>
					</div>
				</div>
			</div>
		</div>
	</section>
	<!-- ══ FOOTER ════════════════════════════════ -->
	<footer class="site-footer">
		<div class="footer-wrap">
			<div class="footer-brand">
				<img src={favicon} alt="CHTM" class="footer-logo" />
				<span>CHTM Cooks</span>
			</div>
			<p class="footer-copy">
				© {new Date().getFullYear()} CHTM Cooks · College of Hospitality & Tourism Management
			</p>
		</div>
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Inter', system-ui, sans-serif;
	}

	/* Loading */
	.loading-screen {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fff;
	}
	.loading-inner {
		text-align: center;
	}
	.loading-logo-wrap {
		position: relative;
		width: 80px;
		height: 80px;
		margin: 0 auto 1rem;
	}
	.loading-glow {
		position: absolute;
		inset: -4px;
		border-radius: 50%;
		background: rgba(233, 30, 99, 0.18);
		filter: blur(12px);
		animation: glow 2s ease-in-out infinite;
	}
	.loading-logo {
		width: 80px;
		height: 80px;
		position: relative;
		z-index: 1;
		animation: bounce 1s ease-in-out infinite alternate;
	}
	.loading-dots {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}
	.loading-dots span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #e91e63;
		animation: dot 1s ease-in-out infinite;
	}

	/* Page root */
	.page-root {
		background: #fff;
		min-height: 100vh;
	}
	.page-root.hidden {
		opacity: 0;
		pointer-events: none;
	}

	/* Sections */
	.guide-section {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 5rem 1.5rem;
		overflow: hidden;
		position: relative;
	}

	.flow-section {
		background: linear-gradient(
			180deg,
			#ffffff 0%,
			rgba(253, 232, 240, 0.35) 55%,
			rgba(251, 182, 205, 0.45) 100%
		);
		padding-bottom: 8rem;
	}

	@media (max-width: 768px) {
		.guide-section {
			padding: 4rem 1.25rem;
			min-height: auto;
		}
	}

	@media (max-width: 480px) {
		.guide-section {
			padding: 3rem 1rem;
		}
	}
	.section-wrap {
		max-width: 1100px;
		width: 100%;
		margin: 0 auto;
		position: relative;
		z-index: 2;
	}
	.section-chip {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 700;
		color: #e91e63;
		background: rgba(233, 30, 99, 0.08);
		padding: 0.35rem 0.9rem;
		border-radius: 999px;
		margin-bottom: 1rem;
		letter-spacing: 0.03em;
	}
	.section-heading {
		font-size: clamp(1.75rem, 4vw, 2.5rem);
		font-weight: 900;
		color: #1a0a12;
		letter-spacing: -0.025em;
		margin: 0 0 0.75rem;
	}

	@media (max-width: 480px) {
		.section-heading {
			font-size: clamp(1.5rem, 6vw, 2rem);
		}
	}
	.section-sub {
		font-size: 1.05rem;
		color: #78516a;
		line-height: 1.7;
		max-width: 600px;
		margin: 0 0 2.5rem;
	}

	@media (max-width: 480px) {
		.section-sub {
			font-size: 0.9375rem;
			line-height: 1.6;
			margin: 0 0 2rem;
		}
	}

	/* Request Flow Full Screen Override */
	#request-flow {
		padding-left: 0;
		padding-right: 0;
	}
	#request-flow .section-wrap {
		padding-left: 1.5rem;
		padding-right: 1.5rem;
	}

	/* ══════════════════════════════════════════════════════════════
	   MODERN FEATURES SECTION - Creative & Industry Standard
	   ══════════════════════════════════════════════════════════════ */

	.features-modern {
		position: relative;
		background: linear-gradient(
			180deg,
			#ffffff 0%,
			rgba(253, 232, 240, 0.2) 50%,
			rgba(251, 182, 205, 0.3) 100%
		);
		overflow: hidden;
	}

	.features-header {
		text-align: center;
		margin-bottom: 4rem;
		position: relative;
		z-index: 2;
	}

	.gradient-chip {
		background: linear-gradient(135deg, rgba(233, 30, 99, 0.1), rgba(156, 39, 176, 0.1));
		border: 1px solid rgba(233, 30, 99, 0.2);
		backdrop-filter: blur(10px);
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1.25rem;
		animation: float 3s ease-in-out infinite;
	}

	.chip-icon {
		display: inline-block;
		animation: sparkle 2s ease-in-out infinite;
	}

	@keyframes sparkle {
		0%,
		100% {
			transform: scale(1) rotate(0deg);
		}
		50% {
			transform: scale(1.2) rotate(180deg);
		}
	}

	@keyframes float {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-5px);
		}
	}

	.gradient-text {
		background: linear-gradient(135deg, #e91e63 0%, #9c27b0 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		animation: gradient-shift 3s ease infinite;
		background-size: 200% 200%;
	}

	@keyframes gradient-shift {
		0%,
		100% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
	}

	/* Features Grid */
	.features-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 2rem;
		position: relative;
		z-index: 2;
	}

	@media (max-width: 900px) {
		.features-grid {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}
	}

	/* Feature Card - Glassmorphism with 3D Tilt Effect */
	.feature-card {
		position: relative;
		background: rgba(255, 255, 255, 0.7);
		backdrop-filter: blur(20px);
		border-radius: 2rem;
		border: 1px solid rgba(255, 255, 255, 0.5);
		padding: 2.5rem;
		overflow: hidden;
		transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		transform-style: preserve-3d;
		perspective: 1000px;
	}

	.feature-card::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			135deg,
			rgba(233, 30, 99, 0.05) 0%,
			rgba(156, 39, 176, 0.05) 100%
		);
		opacity: 0;
		transition: opacity 0.4s ease;
		border-radius: 2rem;
	}

	.feature-card:hover::before {
		opacity: 1;
	}

	.feature-card:hover {
		transform: translateY(-12px) scale(1.02);
		box-shadow:
			0 30px 60px rgba(233, 30, 99, 0.2),
			0 0 0 1px rgba(233, 30, 99, 0.1);
		border-color: rgba(233, 30, 99, 0.3);
	}

	@media (max-width: 480px) {
		.feature-card {
			padding: 2rem;
		}
	}

	/* Card Glow Effect */
	.card-glow {
		position: absolute;
		top: -50%;
		left: -50%;
		width: 200%;
		height: 200%;
		background: radial-gradient(
			circle,
			rgba(233, 30, 99, 0.15) 0%,
			transparent 70%
		);
		opacity: 0;
		transition: opacity 0.6s ease;
		pointer-events: none;
	}

	.feature-card:hover .card-glow {
		opacity: 1;
		animation: glow-pulse 2s ease-in-out infinite;
	}

	@keyframes glow-pulse {
		0%,
		100% {
			transform: scale(1);
			opacity: 0.3;
		}
		50% {
			transform: scale(1.1);
			opacity: 0.6;
		}
	}

	/* Card Shine Effect */
	.card-shine {
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(
			90deg,
			transparent 0%,
			rgba(255, 255, 255, 0.4) 50%,
			transparent 100%
		);
		transition: left 0.6s ease;
		pointer-events: none;
	}

	.feature-card:hover .card-shine {
		left: 100%;
	}

	/* Card Content */
	.card-content {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Feature Icon */
	.feature-icon-wrapper {
		position: relative;
		width: 80px;
		height: 80px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 0.5rem;
	}

	.icon-bg {
		position: absolute;
		inset: 0;
		border-radius: 1.5rem;
		opacity: 0.15;
		transition: all 0.4s ease;
	}

	.icon-bg-pink {
		background: linear-gradient(135deg, #e91e63, #f43f5e);
	}

	.icon-bg-purple {
		background: linear-gradient(135deg, #9c27b0, #7b1fa2);
	}

	.feature-card:hover .icon-bg {
		opacity: 0.25;
		transform: rotate(10deg) scale(1.1);
	}

	.feature-card :global(.feature-icon) {
		position: relative;
		z-index: 1;
		color: #e91e63;
		transition: all 0.4s ease;
	}

	.card-secondary :global(.feature-icon) {
		color: #9c27b0;
	}

	.feature-card:hover :global(.feature-icon) {
		transform: scale(1.1) rotate(-5deg);
		filter: drop-shadow(0 4px 12px rgba(233, 30, 99, 0.4));
	}

	/* Feature Text */
	.feature-text {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.feature-title {
		font-size: 1.75rem;
		font-weight: 800;
		color: #1a0a12;
		margin: 0;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}

	@media (max-width: 480px) {
		.feature-title {
			font-size: 1.5rem;
		}
	}

	.feature-desc {
		font-size: 1rem;
		color: #78516a;
		line-height: 1.7;
		margin: 0;
	}

	@media (max-width: 480px) {
		.feature-desc {
			font-size: 0.9375rem;
		}
	}

	/* Feature Stats */
	.feature-stats {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid rgba(233, 30, 99, 0.1);
	}

	.stat-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 800;
		background: linear-gradient(135deg, #e91e63, #f43f5e);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		line-height: 1;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #78516a;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat-divider {
		width: 1px;
		height: 40px;
		background: linear-gradient(
			180deg,
			transparent 0%,
			rgba(233, 30, 99, 0.2) 50%,
			transparent 100%
		);
	}

	/* Feature Tags */
	.feature-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding-top: 1.5rem;
		border-top: 1px solid rgba(156, 39, 176, 0.1);
	}

	.tag {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 1rem;
		background: rgba(156, 39, 176, 0.08);
		border: 1px solid rgba(156, 39, 176, 0.15);
		border-radius: 999px;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #7b1fa2;
		transition: all 0.3s ease;
	}

	.tag:hover {
		background: rgba(156, 39, 176, 0.15);
		border-color: rgba(156, 39, 176, 0.3);
		transform: translateY(-2px);
	}

	/* Animated Background Orbs */
	.features-bg {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		z-index: 0;
	}

	.bg-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(80px);
		opacity: 0.3;
		animation: float-orb 20s ease-in-out infinite;
	}

	.orb-1 {
		width: 400px;
		height: 400px;
		background: radial-gradient(circle, rgba(233, 30, 99, 0.4), transparent);
		top: -10%;
		left: -5%;
		animation-delay: 0s;
	}

	.orb-2 {
		width: 500px;
		height: 500px;
		background: radial-gradient(circle, rgba(156, 39, 176, 0.3), transparent);
		bottom: -15%;
		right: -10%;
		animation-delay: 7s;
	}

	.orb-3 {
		width: 350px;
		height: 350px;
		background: radial-gradient(circle, rgba(244, 63, 94, 0.25), transparent);
		top: 40%;
		left: 50%;
		animation-delay: 14s;
	}

	@keyframes float-orb {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		33% {
			transform: translate(30px, -30px) scale(1.1);
		}
		66% {
			transform: translate(-20px, 20px) scale(0.9);
		}
	}

	@media (max-width: 768px) {
		.orb-1,
		.orb-2,
		.orb-3 {
			width: 250px;
			height: 250px;
		}
	}

	/* Footer */
	.site-footer {
		border-top: 1px solid rgba(233, 30, 99, 0.08);
		padding: 2rem 1.5rem;
		background: #fff;
	}
	.footer-wrap {
		max-width: 1100px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
	}
	.footer-brand {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		font-size: 1rem;
		font-weight: 800;
		color: #1a0a12;
	}
	.footer-logo {
		width: 30px;
		height: 30px;
	}
	.footer-copy {
		font-size: 0.8125rem;
		color: #9ca3af;
		margin: 0;
	}

	/* Diff Component Showcase */
	.diff-showcase {
		position: relative;
		width: 100%;
		min-height: 450px;
		background: transparent;
		user-select: none;
	}
	.diff-item {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
		border-radius: 1.5rem;
	}
	.diff-qr {
		background: #ffffff;
		border: 1px solid rgba(233, 30, 99, 0.15);
		box-shadow: 0 20px 40px rgba(233, 30, 99, 0.05);
		z-index: 1;
	}
	.diff-ai {
		background: linear-gradient(135deg, #1f0814 0%, #3a0d24 100%);
		border: 1px solid rgba(233, 30, 99, 0.2);
		box-shadow: 0 20px 40px rgba(233, 30, 99, 0.15);
		z-index: 2;
		will-change: clip-path;
	}

	.diff-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		width: 100%;
		height: 100%;
	}
	.diff-content {
		padding: 3rem;
		display: flex;
		align-items: center;
	}
	.diff-content-left {
		padding-right: 4rem;
	}
	.diff-content-right {
		padding-left: 4rem;
	}

	.diff-text-block {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		width: 100%;
		max-width: 480px;
	}
	.diff-header {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.icon-wrap {
		width: 52px;
		height: 52px;
		border-radius: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
		flex-shrink: 0;
	}
	.icon-wrap.green,
	.icon-wrap.blue {
		background: linear-gradient(135deg, #f43f5e, #e91e63);
		box-shadow: 0 8px 20px rgba(233, 30, 99, 0.3);
	}

	.diff-text-block h3 {
		font-size: 1.875rem;
		font-weight: 800;
		margin: 0;
		letter-spacing: -0.03em;
	}
	.light-theme h3 {
		color: #1a0a12;
	}
	.dark-theme h3 {
		color: #fdf2f8;
	}

	.diff-text-block p {
		font-size: 1.0625rem;
		line-height: 1.6;
		margin: 0;
	}
	.light-theme p {
		color: #78516a;
	}
	.dark-theme p {
		color: #fbcfe8;
		opacity: 0.9;
	}

	.diff-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-top: 1.25rem;
	}
	.light-theme .diff-list {
		border-top: 1px solid rgba(233, 30, 99, 0.1);
	}
	.dark-theme .diff-list {
		border-top: 1px solid rgba(244, 63, 94, 0.15);
	}

	.diff-list li {
		font-size: 0.9375rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-weight: 500;
	}
	.light-theme .diff-list li {
		color: #4a3341;
	}
	.dark-theme .diff-list li {
		color: #fce7f3;
	}

	.diff-list li::before {
		content: '✓';
		font-weight: bold;
		font-size: 1.125rem;
		color: #e91e63;
	}
	.dark-theme .diff-list li::before {
		color: #f43f5e;
	}

	.diff-visual {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3rem;
	}

	/* AI Mockup (Dark Theme) */
	.mockup-chat {
		width: 100%;
		max-width: 340px;
		background: rgba(26, 10, 18, 0.6);
		backdrop-filter: blur(12px);
		border-radius: 1.5rem;
		padding: 1.5rem;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		border: 1px solid rgba(244, 63, 94, 0.15);
	}
	.chat-bubble {
		padding: 0.875rem 1.25rem;
		border-radius: 1.25rem;
		font-size: 0.9375rem;
		line-height: 1.5;
		max-width: 85%;
		animation: pulse 3s infinite ease-in-out;
	}
	.chat-user {
		align-self: flex-end;
		background: rgba(255, 255, 255, 0.08);
		color: #fdf2f8;
		border-bottom-right-radius: 0.375rem;
	}
	.chat-ai {
		align-self: flex-start;
		background: linear-gradient(135deg, #e91e63, #c2185b);
		color: #fff;
		border-bottom-left-radius: 0.375rem;
		position: relative;
		box-shadow: 0 10px 20px rgba(233, 30, 99, 0.25);
	}
	.ai-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		background: #fdf2f8;
		border-radius: 50%;
		margin-right: 8px;
		vertical-align: middle;
		box-shadow: 0 0 8px #fdf2f8;
	}
	.chat-input-bar {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		margin-top: 0.5rem;
	}
	.chat-input-pill {
		flex: 1;
		height: 44px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	.chat-send-btn {
		width: 44px;
		height: 44px;
		background: #e91e63;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.9;
	}

	/* QR Mockup (Light Theme) */
	.mockup-qr {
		position: relative;
		width: 260px;
		height: 260px;
		background: #fff;
		border-radius: 2rem;
		padding: 2rem;
		box-shadow: 0 20px 40px rgba(233, 30, 99, 0.1);
		border: 1px solid rgba(233, 30, 99, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.qr-corners {
		position: absolute;
		inset: 1rem;
		border: 4px solid #e91e63;
		border-radius: 1.25rem;
		opacity: 0.15;
	}
	.qr-blocks {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
		width: 100%;
		height: 100%;
	}
	.qr-block {
		background: #78516a;
		border-radius: 6px;
		opacity: 0.8;
	}
	.qr-block:nth-child(2n) {
		opacity: 0.3;
	}
	.qr-block:nth-child(3n) {
		opacity: 0.5;
	}
	.qr-block:nth-child(1),
	.qr-block:nth-child(4),
	.qr-block:nth-child(13) {
		background: #e91e63;
		opacity: 1;
		border-radius: 10px;
	}
	.qr-scan-line {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 4px;
		background: #ff4081;
		box-shadow: 0 0 20px #ff4081;
		animation: scan 2.5s infinite linear;
		border-radius: 4px;
		z-index: 10;
	}

	@keyframes scan {
		0% {
			top: 10%;
			opacity: 0;
		}
		10% {
			opacity: 1;
		}
		90% {
			opacity: 1;
		}
		100% {
			top: 90%;
			opacity: 0;
		}
	}

	/* Diff Controls */
	.diff-range-input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		z-index: 10;
		cursor: ew-resize;
		margin: 0;
	}
	.diff-resizer-handle {
		position: absolute;
		top: -10px;
		bottom: -10px;
		width: 0;
		z-index: 5;
		pointer-events: none;
	}
	.handle-line {
		position: absolute;
		top: 10px;
		bottom: 10px;
		left: -1.5px;
		width: 3px;
		background: rgba(255, 255, 255, 0.9);
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
		border-radius: 3px;
	}
	.handle-knob {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 52px;
		height: 52px;
		background: #fff;
		border-radius: 50%;
		box-shadow: 0 6px 20px rgba(233, 30, 99, 0.25);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #c2185b;
		gap: 2px;
		border: 1px solid rgba(233, 30, 99, 0.1);
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
	}
	.diff-range-input:active ~ .diff-resizer-handle .handle-knob,
	.diff-range-input:hover ~ .diff-resizer-handle .handle-knob {
		transform: translate(-50%, -50%) scale(1.1);
		box-shadow: 0 8px 24px rgba(233, 30, 99, 0.35);
		color: #e91e63;
		border-color: rgba(233, 30, 99, 0.2);
	}

	@media (max-width: 900px) {
		.diff-showcase {
			min-height: 800px;
		}
		.diff-grid {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr 1fr;
		}
		.diff-item.diff-ai {
			clip-path: polygon(0 0, 100% 0, 100% var(--pos, 50%), 0 var(--pos, 50%)) !important;
		}
		.diff-content {
			padding: 2rem;
			align-items: flex-start;
		}
		.diff-content-left,
		.diff-content-right {
			padding: 2rem;
		}
		.diff-visual {
			padding: 2rem;
			align-items: center;
		}
		.diff-resizer-handle {
			left: 0 !important;
			top: var(--pos, 50%);
			width: 100%;
			height: 0;
		}
		.handle-line {
			top: -1.5px;
			left: 10px;
			right: 10px;
			bottom: auto;
			height: 3px;
			width: auto;
		}
		.handle-knob {
			flex-direction: column;
			transform: translate(-50%, -50%) rotate(90deg);
		}
		.diff-range-input {
			cursor: ns-resize;
		}
	}

	@media (max-width: 480px) {
		.diff-showcase {
			min-height: 700px;
		}
		.diff-content {
			padding: 1.5rem;
		}
		.diff-content-left,
		.diff-content-right {
			padding: 1.5rem;
		}
		.diff-visual {
			padding: 1.5rem;
		}
		.diff-text-block h3 {
			font-size: 1.5rem;
		}
		.diff-text-block p {
			font-size: 0.9375rem;
		}
		.mockup-chat {
			max-width: 280px;
			padding: 1.25rem;
		}
		.mockup-qr {
			width: 220px;
			height: 220px;
			padding: 1.5rem;
		}
	}

	/* Keyframes */
	@keyframes glow {
		0%,
		100% {
			opacity: 0.6;
		}
		50% {
			opacity: 1;
		}
	}
	@keyframes bounce {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-8px);
		}
	}
	@keyframes dot {
		0%,
		80%,
		100% {
			transform: scale(0.6);
			opacity: 0.4;
		}
		40% {
			transform: scale(1);
			opacity: 1;
		}
	}

	/* ══════════════════════════════════════════════════════════════
	   MODERN CAROUSEL - Stacked Card Design
	   ══════════════════════════════════════════════════════════════ */

	.flow-header {
		text-align: center;
		margin-bottom: 4rem;
	}

	.flow-heading {
		color: #1a0a12;
		font-size: clamp(2.5rem, 5vw, 4rem);
		margin-bottom: 1rem;
	}

	.flow-section .section-sub {
		color: #78516a;
		max-width: 700px;
		margin-left: auto;
		margin-right: auto;
	}

	.carousel-container {
		position: relative;
		width: 100%;
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem 0 4rem;
	}

	.carousel-track {
		display: flex;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scroll-behavior: smooth;
		scrollbar-width: none;
		-ms-overflow-style: none;
		gap: 2rem;
		padding: 2rem 10%;
	}

	.carousel-track::-webkit-scrollbar {
		display: none;
	}

	.carousel-slide {
		flex: 0 0 100%;
		scroll-snap-align: center;
		display: flex;
		justify-content: center;
		perspective: 1500px;
	}

	/* Flow Card - Glassmorphism with Pink Theme */
	.flow-card {
		position: relative;
		width: 100%;
		max-width: 480px;
		background: rgba(255, 255, 255, 0.85);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(233, 30, 99, 0.2);
		border-radius: 2rem;
		padding: 3rem 2.5rem;
		box-shadow:
			0 20px 60px rgba(233, 30, 99, 0.15),
			inset 0 1px 0 rgba(255, 255, 255, 0.8);
		transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
		transform-style: preserve-3d;
		animation: cardFloat 3s ease-in-out infinite;
		animation-delay: calc(var(--card-index) * 0.2s);
	}

	@keyframes cardFloat {
		0%,
		100% {
			transform: translateY(0) rotateY(0deg);
		}
		50% {
			transform: translateY(-10px) rotateY(2deg);
		}
	}

	.flow-card:hover {
		transform: translateY(-20px) scale(1.03);
		box-shadow:
			0 30px 80px rgba(233, 30, 99, 0.25),
			inset 0 1px 0 rgba(255, 255, 255, 1);
		border-color: rgba(233, 30, 99, 0.4);
	}

	.card-gradient {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			circle at top right,
			rgba(244, 63, 94, 0.2) 0%,
			transparent 60%
		);
		border-radius: 2rem;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.5s ease;
	}

	.flow-card:hover .card-gradient {
		opacity: 1;
	}

	.card-number {
		position: absolute;
		top: 1.5rem;
		right: 2rem;
		font-size: 1rem;
		font-weight: 700;
		color: rgba(233, 30, 99, 0.3);
		letter-spacing: 0.1em;
	}

	.card-inner {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 1.5rem;
	}

	.flow-icon-wrapper {
		width: 140px;
		height: 140px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, rgba(233, 30, 99, 0.1), rgba(244, 63, 94, 0.08));
		border-radius: 50%;
		border: 2px solid rgba(233, 30, 99, 0.2);
		box-shadow:
			0 10px 40px rgba(233, 30, 99, 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.5);
		transition: all 0.4s ease;
		position: relative;
		overflow: hidden;
	}

	.flow-icon-wrapper::before {
		content: '';
		position: absolute;
		inset: -50%;
		background: conic-gradient(
			from 0deg,
			transparent 0deg,
			rgba(233, 30, 99, 0.3) 90deg,
			transparent 180deg
		);
		animation: iconRotate 3s linear infinite;
		opacity: 0;
		transition: opacity 0.4s ease;
	}

	.flow-card:hover .flow-icon-wrapper::before {
		opacity: 1;
	}

	@keyframes iconRotate {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.flow-card:hover .flow-icon-wrapper {
		transform: scale(1.1);
		box-shadow:
			0 15px 50px rgba(233, 30, 99, 0.5),
			inset 0 1px 0 rgba(255, 255, 255, 0.2);
		border-color: rgba(233, 30, 99, 0.5);
	}

	.flow-card :global(.flow-icon) {
		color: #e91e63;
		filter: drop-shadow(0 4px 12px rgba(233, 30, 99, 0.3));
		transition: all 0.4s ease;
		position: relative;
		z-index: 1;
	}

	.flow-card:hover :global(.flow-icon) {
		transform: scale(1.1) rotate(-5deg);
		color: #c2185b;
	}

	.flow-title {
		font-size: 2rem;
		font-weight: 800;
		color: #1a0a12;
		margin: 0;
		letter-spacing: -0.02em;
		line-height: 1.2;
		text-shadow: 0 2px 10px rgba(233, 30, 99, 0.1);
	}

	.flow-description {
		font-size: 1.0625rem;
		color: #78516a;
		line-height: 1.7;
		margin: 0;
		max-width: 380px;
	}

	/* Navigation Buttons */
	.carousel-nav {
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
		transform: translateY(-50%);
		display: flex;
		justify-content: space-between;
		padding: 0 2rem;
		pointer-events: none;
		z-index: 10;
	}

	.nav-btn {
		pointer-events: auto;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: linear-gradient(135deg, rgba(233, 30, 99, 0.9), rgba(194, 24, 91, 0.9));
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.3s ease;
		box-shadow: 0 8px 24px rgba(233, 30, 99, 0.4);
	}

	.nav-btn:hover {
		transform: scale(1.1);
		box-shadow: 0 12px 32px rgba(233, 30, 99, 0.6);
		background: linear-gradient(135deg, rgba(244, 63, 94, 0.95), rgba(233, 30, 99, 0.95));
	}

	.nav-btn:active {
		transform: scale(0.95);
	}

	/* Carousel Dots */
	.carousel-dots {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		margin-top: 3rem;
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.3);
		cursor: pointer;
		transition: all 0.3s ease;
		padding: 0;
	}

	.dot:hover {
		background: rgba(233, 30, 99, 0.5);
		transform: scale(1.2);
	}

	.dot.active {
		width: 32px;
		border-radius: 5px;
		background: linear-gradient(90deg, #e91e63, #f43f5e);
		border-color: rgba(233, 30, 99, 0.5);
		box-shadow: 0 4px 12px rgba(233, 30, 99, 0.5);
	}

	/* Responsive Design */
	@media (max-width: 768px) {
		.carousel-track {
			padding: 2rem 5%;
		}

		.flow-card {
			max-width: 400px;
			padding: 2.5rem 2rem;
		}

		.flow-icon-wrapper {
			width: 120px;
			height: 120px;
		}

		.flow-card :global(.flow-icon) {
			width: 56px;
			height: 56px;
		}

		.flow-title {
			font-size: 1.75rem;
		}

		.flow-description {
			font-size: 1rem;
		}

		.carousel-nav {
			padding: 0 1rem;
		}

		.nav-btn {
			width: 48px;
			height: 48px;
		}
	}

	@media (max-width: 480px) {
		.flow-section {
			padding-bottom: 6rem;
		}

		.carousel-track {
			padding: 2rem 2%;
		}

		.flow-card {
			max-width: 340px;
			padding: 2rem 1.5rem;
		}

		.flow-icon-wrapper {
			width: 100px;
			height: 100px;
		}

		.flow-card :global(.flow-icon) {
			width: 48px;
			height: 48px;
		}

		.flow-title {
			font-size: 1.5rem;
		}

		.flow-description {
			font-size: 0.9375rem;
		}

		.card-number {
			font-size: 0.875rem;
			top: 1rem;
			right: 1.5rem;
		}

		.nav-btn {
			width: 44px;
			height: 44px;
		}
	}
</style>
