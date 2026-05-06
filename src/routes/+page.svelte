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
	let activeStep = $state(0);
	const totalSteps = 6;

	function nextStep() {
		activeStep = (activeStep + 1) % totalSteps;
	}

	function prevStep() {
		activeStep = (activeStep - 1 + totalSteps) % totalSteps;
	}

	function goToStep(index: number) {
		activeStep = index;
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
			<div class="flow-header">
				<h2 class="section-heading flow-heading">Everything You Need</h2>
			</div>

			<div class="features-bento-grid">
				<!-- Card 1 (Pink - Span 2) -->
				<div class="bento-card bento-dark bento-span-2">
					<h3 class="bento-title">Dashboard & Trust Score</h3>
					<p class="bento-desc">
						Your personal hub. Track active loans, monitor due dates, and maintain your Trust Score
						with on-time returns and performance metrics.
					</p>
				</div>

				<!-- Card 2 (Light - Span 3) -->
				<div class="bento-card bento-light bento-span-3">
					<h3 class="bento-title">Live Equipment Catalog</h3>
					<p class="bento-desc">
						Browse available laboratory equipment with real-time stock updates. Search, filter, and
						view detailed specifications before adding items to your request to avoid delays.
					</p>
				</div>

				<!-- Card 3 (Light - Span 1) -->
				<div class="bento-card bento-light bento-span-1-bot">
					<h3 class="bento-title">Instructor Approvals</h3>
					<p class="bento-desc">
						Submit requests directly to your class instructor. Once approved, the system alerts the
						custodian to prepare your items for pickup.
					</p>
				</div>

				<!-- Card 4 (Light - Span 1) -->
				<div class="bento-card bento-light bento-span-1-bot">
					<h3 class="bento-title">Smart QR Codes</h3>
					<p class="bento-desc">
						Generate unique digital QR tickets instantly. Present your code at the custodian desk
						for fast, contactless equipment claiming.
					</p>
				</div>

				<!-- Card 5 (Pink - Span 1) -->
				<div class="bento-card bento-dark bento-span-1-bot">
					<h3 class="bento-title">Real-time Tracking</h3>
					<p class="bento-desc">
						Easily track your request status. Get live updates on approvals, preparation, and return
						deadlines for a seamless borrowing experience.
					</p>
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
				<h2 class="section-heading flow-heading">How it works?</h2>
			</div>
		</div>
		<div class="carousel-container">
			<div class="carousel-stacked-track">
				{#each requestSteps as s, index}
					{@const Icon = s.icon}
					{@const isActive = index === activeStep}
					{@const offset = index - activeStep}
					{@const absOffset = Math.abs(offset)}
					{@const isPast = offset < 0}

					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="carousel-slide-stacked"
						class:active={isActive}
						class:past={isPast}
						style="--offset: {offset}; --abs-offset: {absOffset}; z-index: {20 - absOffset};"
						onclick={() => goToStep(index)}
					>
						<div class="flow-card">
							<div class="card-number">0{s.step}</div>
							<div class="card-inner">
								<div class="flow-icon-wrapper">
									<Icon size={isActive ? 64 : 48} strokeWidth={2} class="flow-icon" />
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
				<button class="nav-btn nav-prev" onclick={prevStep} aria-label="Previous step">
					<ChevronLeft size={24} strokeWidth={2.5} />
				</button>
				<button class="nav-btn nav-next" onclick={nextStep} aria-label="Next step">
					<ChevronRight size={24} strokeWidth={2.5} />
				</button>
			</div>

			<div class="carousel-dots">
				{#each requestSteps as _, index}
					<button
						class="dot"
						class:active={index === activeStep}
						onclick={() => goToStep(index)}
						aria-label="Go to step {index + 1}"
					></button>
				{/each}
			</div>
		</div>
	</section>

	<!-- ══ SMART FEATURES ════════════════════════════════ -->
	<section id="smart-features" class="guide-section">
		<div class="section-wrap">
			<div class="flow-header">
				<h2 class="section-heading flow-heading">Next-Gen Capabilities</h2>
			</div>

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
		padding: 8rem 1.5rem 5rem;
		overflow: hidden;
		position: relative;
		scroll-margin-top: 6rem;
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
		background: #ffffff;
		overflow: hidden;
	}

	/* Bento Grid Layout */
	.features-bento-grid {
		display: grid;
		grid-template-columns: repeat(15, 1fr);
		gap: 1.5rem;
		position: relative;
		z-index: 2;
	}

	.bento-card {
		border-radius: 1rem;
		padding: 2.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		transition:
			transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
			box-shadow 0.3s ease;
	}

	.bento-card:hover {
		transform: translateY(-4px);
	}

	.bento-dark {
		background: linear-gradient(135deg, #e91e63, #c2185b); /* Signature pink gradient */
		color: #ffffff;
		box-shadow: 0 10px 30px rgba(233, 30, 99, 0.2);
	}

	.bento-dark:hover {
		box-shadow: 0 20px 40px rgba(233, 30, 99, 0.3);
	}

	.bento-light {
		background: #ffffff;
		color: #111827;
		border: 1px solid #f3f4f6;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
	}

	.bento-light:hover {
		box-shadow: 0 12px 24px -5px rgba(0, 0, 0, 0.05);
		border-color: #e5e7eb;
	}

	/* Layout Proportions via 15-col grid */
	.bento-span-2 {
		grid-column: span 6; /* 40% width */
	}

	.bento-span-3 {
		grid-column: span 9; /* 60% width */
	}

	.bento-span-1-bot {
		grid-column: span 5; /* 33.3% width */
	}

	/* Text Styling */
	.bento-title {
		font-size: 1.375rem;
		font-weight: 700;
		margin: 0;
		letter-spacing: -0.015em;
		line-height: 1.3;
	}

	.bento-dark .bento-title {
		color: #ffffff;
	}

	.bento-light .bento-title {
		color: #1a0a12;
	}

	.bento-desc {
		font-size: 0.9375rem;
		line-height: 1.6;
		margin: 0;
	}

	.bento-dark .bento-desc {
		color: rgba(255, 255, 255, 0.85);
	}

	.bento-light .bento-desc {
		color: #4b5563;
	}

	@media (max-width: 1024px) {
		/* Collapse to 2 columns on tablet */
		.features-bento-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.bento-span-2,
		.bento-span-3,
		.bento-span-1-bot {
			grid-column: span 1;
		}
		/* The last item takes full width on 2-col to avoid orphan */
		.bento-card:last-child {
			grid-column: span 2;
		}
	}

	@media (max-width: 768px) {
		/* Stack vertically on mobile */
		.features-bento-grid {
			grid-template-columns: 1fr;
		}
		.bento-span-2,
		.bento-span-3,
		.bento-span-1-bot,
		.bento-card:last-child {
			grid-column: span 1;
		}
		.bento-card {
			padding: 2rem 1.5rem;
		}
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
		opacity: 0.15;
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
		background: radial-gradient(circle, rgba(59, 130, 246, 0.25), transparent);
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
		background: linear-gradient(135deg, #e91e63, #c2185b);
		border: 1px solid rgba(233, 30, 99, 0.2);
		box-shadow: 0 20px 40px rgba(233, 30, 99, 0.2);
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
			display: flex;
			flex-direction: column;
			gap: 2rem;
			min-height: auto;
			background: transparent;
			box-shadow: none;
			border: none;
		}
		.diff-item {
			position: relative !important;
			inset: auto !important;
			clip-path: none !important;
			width: 100% !important;
			height: auto !important;
			border-radius: 1.5rem;
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
			overflow: hidden;
		}
		.diff-item.diff-qr {
			background: #ffffff;
			border: 1px solid #f3f4f6;
		}
		.diff-item.diff-ai {
			background: linear-gradient(135deg, #e91e63, #c2185b);
			border: 1px solid rgba(233, 30, 99, 0.2);
		}
		.diff-grid {
			grid-template-columns: 1fr;
			grid-template-rows: auto auto;
		}
		.diff-content,
		.diff-visual {
			width: 100%;
			padding: 2rem;
			align-items: center;
		}
		.diff-content-left,
		.diff-content-right {
			padding: 2rem;
		}
		.diff-resizer-handle,
		.diff-range-input {
			display: none !important;
		}
	}

	@media (max-width: 480px) {
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
		margin-bottom: 3.5rem;
		position: relative;
		z-index: 2;
	}

	.flow-heading {
		color: #1a0a12;
		font-size: clamp(2.5rem, 5vw, 4rem);
		margin-bottom: 0;
	}



	.carousel-container {
		position: relative;
		width: 100%;
		max-width: 1600px;
		margin: 0 auto;
		padding: 0 0 4rem;
		overflow: hidden;
	}

	.carousel-stacked-track {
		position: relative;
		height: 520px;
		width: 100%;
		max-width: 100%;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.carousel-slide-stacked {
		position: relative;
		height: 380px;
		width: 290px;
		transition: all 0.5s cubic-bezier(0.25, 1, 0.5, 1);
		cursor: pointer;
		margin-left: -130px; /* Compress them heavily to overlap deeply */
		flex-shrink: 0;
	}

	.carousel-slide-stacked:first-child {
		margin-left: 0;
	}

	.carousel-slide-stacked.active {
		height: 480px;
		width: 390px;
		margin-left: -30px;
		margin-right: 30px;
		cursor: default;
	}

	/* Flow Card - Stacked Theme */
	.flow-card {
		position: relative;
		width: 100%;
		height: 100%;
		background: #ffffff;
		border: 1px solid rgba(233, 30, 99, 0.1);
		border-radius: 1.5rem;
		padding: 2rem 1.5rem;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.06);
		transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		overflow: hidden;
	}

	/* Active Card Styling */
	.carousel-slide-stacked.active .flow-card {
		background: linear-gradient(135deg, #e91e63, #c2185b);
		border-color: rgba(233, 30, 99, 0.3);
		box-shadow: 0 20px 50px rgba(233, 30, 99, 0.2);
		padding: 3.5rem 2.5rem;
	}

	.card-gradient {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at top right, rgba(233, 30, 99, 0.15) 0%, transparent 60%);
		border-radius: 1.5rem;
		pointer-events: none;
	}

	.card-number {
		position: absolute;
		top: 1.5rem;
		right: 1.5rem;
		font-size: 1.125rem;
		font-weight: 700;
		color: #9ca3af;
		letter-spacing: 0.05em;
		transition: color 0.4s ease;
	}

	.carousel-slide-stacked.active .card-number {
		color: rgba(255, 255, 255, 0.6);
	}

	.card-inner {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 1.5rem;
		height: 100%;
		justify-content: center;
	}

	.flow-icon-wrapper {
		width: 100px;
		height: 100px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f9fafb;
		border-radius: 1rem;
		border: 1px solid #f3f4f6;
		transition: all 0.4s ease;
		margin-bottom: 1rem;
	}

	.carousel-slide-stacked.active .flow-icon-wrapper {
		width: 140px;
		height: 140px;
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.35);
		box-shadow:
			0 10px 40px rgba(0, 0, 0, 0.1),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
		border-radius: 50%;
	}

	.flow-card :global(.flow-icon) {
		color: #e91e63;
		transition: all 0.4s ease;
	}

	.carousel-slide-stacked.active .flow-card :global(.flow-icon) {
		color: #ffffff;
		filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.2));
	}

	.flow-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: #111827;
		margin: 0;
		letter-spacing: -0.015em;
		line-height: 1.2;
		transition: color 0.4s ease;
	}

	.carousel-slide-stacked.active .flow-title {
		font-size: 2rem;
		font-weight: 800;
		color: #ffffff;
		text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
	}

	.flow-description {
		font-size: 0.9375rem;
		color: #4b5563;
		line-height: 1.6;
		margin: 0;
		max-width: 320px;
		transition: color 0.4s ease;
		opacity: 1;
	}

	.carousel-slide-stacked.active .flow-description {
		font-size: 1.0625rem;
		color: rgba(255, 255, 255, 0.8);
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
	@media (max-width: 1024px) {
		.carousel-stacked-track {
			height: 440px;
		}

		.carousel-slide-stacked {
			width: 220px;
			height: 320px;
			margin-left: -90px;
		}

		.carousel-slide-stacked.active {
			width: 320px;
			height: 420px;
			margin-left: -20px;
			margin-right: 20px;
		}

		.flow-card {
			padding: 1.5rem 1.25rem;
		}

		.flow-icon-wrapper {
			width: 80px;
			height: 80px;
		}

		.flow-card :global(.flow-icon) {
			width: 40px;
			height: 40px;
		}

		.flow-title {
			font-size: 1.25rem;
		}

		.carousel-slide-stacked.active .flow-title {
			font-size: 1.75rem;
		}
	}

	@media (max-width: 768px) {
		.carousel-stacked-track {
			flex-direction: column;
			height: auto;
			padding: 0 5%;
			gap: 1.5rem;
		}

		.carousel-slide-stacked,
		.carousel-slide-stacked.active {
			position: relative;
			top: auto !important;
			bottom: auto !important;
			left: auto !important;
			width: 100% !important;
			height: auto !important;
			min-height: 280px;
			margin-left: 0 !important;
			margin-right: 0 !important;
			transform: none !important;
			opacity: 1 !important;
			pointer-events: none; /* Disable click-to-activate on mobile */
		}

		/* Reset active styling so they all look uniform on mobile vertical feed */
		.carousel-slide-stacked .flow-card {
			background: #ffffff !important;
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05) !important;
			padding: 2rem 1.5rem !important;
			border-color: rgba(233, 30, 99, 0.1) !important;
		}

		.carousel-slide-stacked .card-number {
			color: #9ca3af !important;
		}

		.carousel-slide-stacked .flow-title {
			color: #111827 !important;
			font-size: 1.5rem !important;
			text-shadow: none !important;
		}

		.carousel-slide-stacked .flow-description {
			color: #4b5563 !important;
			font-size: 0.9375rem !important;
		}

		.carousel-slide-stacked .flow-icon-wrapper {
			background: #f9fafb !important;
			border: 1px solid #f3f4f6 !important;
			width: 80px !important;
			height: 80px !important;
			box-shadow: none !important;
			margin-bottom: 1rem;
		}

		.carousel-slide-stacked .flow-card :global(.flow-icon) {
			filter: none !important;
			width: 40px !important;
			height: 40px !important;
		}

		.carousel-nav {
			display: none;
		}

		.carousel-dots {
			display: none;
		}
	}

	@media (max-width: 480px) {
		.flow-section {
			padding-bottom: 4rem;
		}

		.carousel-stacked-track {
			padding: 0 2%;
		}
	}
</style>
