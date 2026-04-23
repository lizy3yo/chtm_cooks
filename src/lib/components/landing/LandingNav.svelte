<script lang="ts">
	import { goto } from '$app/navigation';
	import favicon from '$lib/assets/CHTM_LOGO.png';

	let scrollY = $state(0);
	let mobileMenuOpen = $state(false);
	let activeSection = $state('home');

	const navLinks = [
		{ id: 'home', label: 'Home' },
		{ id: 'dashboard', label: 'Dashboard' },
		{ id: 'catalog', label: 'Catalog' },
		{ id: 'request-flow', label: 'Request Flow' },
		{ id: 'ai-assistant', label: 'AI Assistant' },
		{ id: 'qr-code', label: 'QR Code' }
	];

	function scrollToSection(sectionId: string) {
		mobileMenuOpen = false;
		if (sectionId === 'home') {
			window.scrollTo({ top: 0, behavior: 'smooth' });
			return;
		}
		const el = document.getElementById(sectionId);
		if (el) {
			const offset = 90;
			const top = el.getBoundingClientRect().top + window.scrollY - offset;
			window.scrollTo({ top, behavior: 'smooth' });
		}
	}

	function handleScroll() {
		scrollY = window.scrollY;

		// Determine active section
		const sections = navLinks.map((l) => l.id);
		let current = 'home';
		for (const id of sections) {
			const el = document.getElementById(id);
			if (el) {
				const rect = el.getBoundingClientRect();
				if (rect.top <= 120) {
					current = id;
				}
			}
		}
		activeSection = current;
	}

	import { onMount } from 'svelte';
	onMount(() => {
		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => window.removeEventListener('scroll', handleScroll);
	});
</script>

<nav class="landing-nav" class:scrolled={scrollY > 20} class:at-top={scrollY <= 20}>
	<div class="nav-container">
		<!-- Logo -->
		<button class="nav-logo" onclick={() => scrollToSection('home')}>
			<div class="logo-glow"></div>
			<img src={favicon} alt="CHTM Cooks Logo" class="logo-img" />
			<div class="logo-text">
				<span class="logo-title">CHTM Cooks</span>
				<span class="logo-subtitle">Student Guide</span>
			</div>
		</button>

		<!-- Desktop Nav Links -->
		<div class="nav-links-desktop">
			{#each navLinks as link}
				<button
					class="nav-link"
					class:active={activeSection === link.id}
					onclick={() => scrollToSection(link.id)}
				>
					<span class="nav-link-text">{link.label}</span>
					<span class="nav-link-indicator"></span>
				</button>
			{/each}
		</div>

		<!-- CTA + Mobile Toggle -->
		<div class="nav-actions">
			<button class="nav-cta" onclick={() => goto('/auth/login')}> Sign In </button>

			<!-- Mobile Hamburger -->
			<button
				class="mobile-toggle"
				onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
				aria-label="Toggle navigation"
			>
				<div class="hamburger" class:open={mobileMenuOpen}>
					<span></span>
					<span></span>
					<span></span>
				</div>
			</button>
		</div>
	</div>

	<!-- Mobile Menu -->
	{#if mobileMenuOpen}
		<div class="mobile-menu">
			<div class="mobile-menu-inner">
				{#each navLinks as link}
					<button
						class="mobile-link"
						class:active={activeSection === link.id}
						onclick={() => scrollToSection(link.id)}
					>
						{link.label}
					</button>
				{/each}
				<div class="mobile-divider"></div>
				<button
					class="mobile-cta"
					onclick={() => {
						mobileMenuOpen = false;
						goto('/auth/login');
					}}
				>
					Sign In to Portal
				</button>
			</div>
		</div>
	{/if}
</nav>

<!-- Spacer to offset fixed nav -->
<div class="nav-spacer"></div>

<style>
	/* ─── Nav Shell ───────────────────────────────────────── */
	.landing-nav {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 100;
		transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.landing-nav.at-top {
		background: transparent;
		border-bottom: 1px solid transparent;
		backdrop-filter: none;
	}

	.landing-nav.scrolled {
		background: rgba(255, 255, 255, 0.82);
		border-bottom: 1px solid rgba(233, 30, 99, 0.08);
		backdrop-filter: blur(20px) saturate(180%);
		-webkit-backdrop-filter: blur(20px) saturate(180%);
		box-shadow:
			0 1px 3px rgba(233, 30, 99, 0.06),
			0 8px 32px rgba(233, 30, 99, 0.04);
	}

	.nav-container {
		max-width: 1280px;
		margin: 0 auto;
		padding: 0 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 72px;
	}

	.nav-spacer {
		height: 72px;
	}

	/* ─── Logo ────────────────────────────────────────────── */
	.nav-logo {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		transition: transform 0.3s ease;
		position: relative;
	}

	.nav-logo:hover {
		transform: scale(1.03);
	}

	.logo-glow {
		position: absolute;
		inset: -4px;
		background: radial-gradient(circle, rgba(233, 30, 99, 0.15), transparent 70%);
		border-radius: 50%;
		filter: blur(8px);
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.nav-logo:hover .logo-glow {
		opacity: 1;
	}

	.logo-img {
		width: 44px;
		height: 44px;
		position: relative;
		z-index: 1;
		filter: drop-shadow(0 2px 8px rgba(233, 30, 99, 0.2));
	}

	.logo-text {
		display: flex;
		flex-direction: column;
		position: relative;
		z-index: 1;
	}

	.logo-title {
		font-size: 1.25rem;
		font-weight: 900;
		color: #1f2937;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}

	.logo-subtitle {
		font-size: 0.65rem;
		font-weight: 600;
		color: #e91e63;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	/* ─── Desktop Links ───────────────────────────────────── */
	.nav-links-desktop {
		display: none;
		align-items: center;
		gap: 0.25rem;
	}

	@media (min-width: 1024px) {
		.nav-links-desktop {
			display: flex;
		}
	}

	.nav-link {
		position: relative;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.5rem 0.875rem;
		border-radius: 0.625rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: #6b7280;
		transition: all 0.25s ease;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}

	.nav-link:hover {
		color: #e91e63;
		background: rgba(233, 30, 99, 0.05);
	}

	.nav-link.active {
		color: #e91e63;
		font-weight: 600;
	}

	.nav-link-indicator {
		width: 0;
		height: 2px;
		background: linear-gradient(90deg, #e91e63, #f43f5e);
		border-radius: 1px;
		transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.nav-link.active .nav-link-indicator {
		width: 100%;
	}

	/* ─── Actions ─────────────────────────────────────────── */
	.nav-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.nav-cta {
		display: none;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1.25rem;
		background: linear-gradient(135deg, #e91e63 0%, #f43f5e 100%);
		color: #fff;
		font-size: 0.8125rem;
		font-weight: 600;
		border: none;
		border-radius: 0.75rem;
		cursor: pointer;
		transition: all 0.3s ease;
		box-shadow:
			0 2px 8px rgba(233, 30, 99, 0.3),
			0 0 0 0 rgba(233, 30, 99, 0);
	}

	.nav-cta:hover {
		transform: translateY(-1px);
		box-shadow:
			0 4px 16px rgba(233, 30, 99, 0.35),
			0 0 0 3px rgba(233, 30, 99, 0.1);
	}

	@media (min-width: 640px) {
		.nav-cta {
			display: inline-flex;
		}
	}

	/* ─── Mobile Toggle ───────────────────────────────────── */
	.mobile-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: none;
		border: 1px solid rgba(233, 30, 99, 0.15);
		border-radius: 0.625rem;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.mobile-toggle:hover {
		background: rgba(233, 30, 99, 0.06);
		border-color: rgba(233, 30, 99, 0.25);
	}

	@media (min-width: 1024px) {
		.mobile-toggle {
			display: none;
		}
	}

	.hamburger {
		width: 18px;
		height: 14px;
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
	}

	.hamburger span {
		display: block;
		width: 100%;
		height: 2px;
		background: #e91e63;
		border-radius: 1px;
		transition: all 0.3s ease;
		transform-origin: center;
	}

	.hamburger.open span:nth-child(1) {
		transform: translateY(6px) rotate(45deg);
	}
	.hamburger.open span:nth-child(2) {
		opacity: 0;
		transform: scaleX(0);
	}
	.hamburger.open span:nth-child(3) {
		transform: translateY(-6px) rotate(-45deg);
	}

	/* ─── Mobile Menu ─────────────────────────────────────── */
	.mobile-menu {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: rgba(255, 255, 255, 0.97);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-bottom: 1px solid rgba(233, 30, 99, 0.1);
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.08);
		animation: slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.mobile-menu-inner {
		max-width: 1280px;
		margin: 0 auto;
		padding: 0.75rem 1.5rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.mobile-link {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.75rem 1rem;
		background: none;
		border: none;
		border-radius: 0.75rem;
		font-size: 0.9375rem;
		font-weight: 500;
		color: #4b5563;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.mobile-link:hover,
	.mobile-link.active {
		color: #e91e63;
		background: rgba(233, 30, 99, 0.06);
	}

	.mobile-link.active {
		font-weight: 600;
	}

	.mobile-divider {
		height: 1px;
		background: rgba(233, 30, 99, 0.1);
		margin: 0.5rem 0;
	}

	.mobile-cta {
		display: block;
		width: 100%;
		padding: 0.875rem;
		background: linear-gradient(135deg, #e91e63 0%, #f43f5e 100%);
		color: #fff;
		font-size: 0.9375rem;
		font-weight: 600;
		border: none;
		border-radius: 0.75rem;
		cursor: pointer;
		text-align: center;
		transition: all 0.3s ease;
		box-shadow: 0 4px 16px rgba(233, 30, 99, 0.25);
	}

	.mobile-cta:hover {
		box-shadow: 0 6px 20px rgba(233, 30, 99, 0.35);
	}

	@media (min-width: 1024px) {
		.mobile-menu {
			display: none;
		}
	}
</style>
