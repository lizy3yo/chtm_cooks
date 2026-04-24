<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isAuthenticated, user, isLoading } from '$lib/stores/auth';
	import favicon from '$lib/assets/CHTM_LOGO.png';
	import LandingNav  from '$lib/components/landing/LandingNav.svelte';
	import LandingHero from '$lib/components/landing/LandingHero.svelte';

	let authCheckComplete = $state(false);

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
		{ step:1, title:'Browse Catalog',      desc:'Find cooking equipment with real-time stock info.',             icon:'🔍' },
		{ step:2, title:'Add to Request',      desc:'Select items, quantities, and set your borrow schedule.',       icon:'🛒' },
		{ step:3, title:'Submit for Review',   desc:'Your request is sent to your class instructor for approval.',   icon:'📤' },
		{ step:4, title:'Instructor Approves', desc:'Instructor reviews, then custodian prepares your items.',       icon:'✅' },
		{ step:5, title:'Pick Up Equipment',   desc:'Show your QR code at the custodian desk and collect items.',    icon:'📦' },
		{ step:6, title:'Return On Time',      desc:'Return items on schedule to keep your Trust Score high.',       icon:'🔄' }
	];
</script>

<svelte:head>
	<title>CHTM Cooks · Student Guide</title>
	<meta name="description" content="Your complete guide to using the CHTM Cooks laboratory equipment management system as a student." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
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
	<section id="core-features" class="guide-section">
		<div class="section-wrap">
			<span class="section-chip">✨ Platform Essentials</span>
			<h2 class="section-heading">Everything You Need</h2>
			<p class="section-sub">A complete suite of tools designed to make your laboratory experience seamless, professional, and efficient.</p>
			
			<div class="cards-2">
				<!-- Dashboard -->
				<div class="bento-card pink">
					<div class="bento-header">
						<span class="bento-icon">📊</span>
						<h3>Dashboard & Trust Score</h3>
					</div>
					<p>Your personal hub. Track active loans, monitor due dates, and maintain your Trust Score with on-time returns and performance metrics.</p>
					<ul class="bento-list">
						<li>Trust Score tracking and metrics</li>
						<li>KPIs for active and pending loans</li>
						<li>Automated 7-day due date alerts</li>
					</ul>
				</div>

				<!-- Catalog -->
				<div class="bento-card purple">
					<div class="bento-header">
						<span class="bento-icon">📦</span>
						<h3>Live Catalog</h3>
					</div>
					<p>Browse available equipment with real-time stock updates. Search, filter, and view detailed specifications before adding items to your request.</p>
					<ul class="bento-list">
						<li>Real-time availability sync</li>
						<li>Advanced search and filtering</li>
						<li>High-res photos and item details</li>
					</ul>
				</div>
			</div>
		</div>
	</section>

	<!-- ══ REQUEST FLOW ══════════════════════════ -->
	<section id="request-flow" class="guide-section alt">
		<div class="section-wrap">
			<span class="section-chip">📝 Request Flow</span>
			<h2 class="section-heading">How Borrowing Works</h2>
			<p class="section-sub">The entire borrowing process is 100% digital — from request to return in six clear steps.</p>
			<div class="steps-grid">
				{#each requestSteps as s}
				<div class="step-card">
					<div class="step-num">{s.step}</div>
					<div class="step-icon">{s.icon}</div>
					<h3>{s.title}</h3>
					<p>{s.desc}</p>
				</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ══ SMART FEATURES ════════════════════════════════ -->
	<section id="smart-features" class="guide-section">
		<div class="section-wrap">
			<span class="section-chip">🚀 Smart Technology</span>
			<h2 class="section-heading">Next-Gen Capabilities</h2>
			<p class="section-sub">Leverage cutting-edge AI and contactless features to streamline your entire borrowing process.</p>
			
			<div class="cards-2">
				<!-- AI Assistant -->
				<div class="bento-card blue">
					<div class="bento-header">
						<span class="bento-icon">🤖</span>
						<h3>AI Assistant</h3>
					</div>
					<p>Your 24/7 smart helper. Ask questions about equipment, system features, or get step-by-step guidance on navigating the platform.</p>
					<ul class="bento-list">
						<li>Instant answers on any page</li>
						<li>Step-by-step request guidance</li>
						<li>Always available via chat bubble</li>
					</ul>
				</div>

				<!-- QR Code -->
				<div class="bento-card green">
					<div class="bento-header">
						<span class="bento-icon">📱</span>
						<h3>QR Code System</h3>
					</div>
					<p>Contactless handoffs. Generate a unique QR code for approved requests to verify identity and quickly retrieve or return items.</p>
					<ul class="bento-list">
						<li>Auto-generated for each request</li>
						<li>Contactless custodian scanning</li>
						<li>Digital verification and records</li>
					</ul>
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
			<p class="footer-copy">© {new Date().getFullYear()} CHTM Cooks · College of Hospitality & Tourism Management</p>
		</div>
	</footer>
</div>

<style>
	:global(body) { margin: 0; font-family: 'Inter', system-ui, sans-serif; }

	/* Loading */
	.loading-screen { position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:#fff; }
	.loading-inner { text-align:center; }
	.loading-logo-wrap { position:relative;width:80px;height:80px;margin:0 auto 1rem; }
	.loading-glow { position:absolute;inset:-4px;border-radius:50%;background:rgba(233,30,99,0.18);filter:blur(12px);animation:glow 2s ease-in-out infinite; }
	.loading-logo { width:80px;height:80px;position:relative;z-index:1;animation:bounce 1s ease-in-out infinite alternate; }
	.loading-dots { display:flex;gap:0.5rem;justify-content:center; }
	.loading-dots span { width:8px;height:8px;border-radius:50%;background:#e91e63;animation:dot 1s ease-in-out infinite; }

	/* Page root */
	.page-root { background:#fff;min-height:100vh; }
	.page-root.hidden { opacity:0;pointer-events:none; }

	/* Sections */
	.guide-section { padding:5rem 1.5rem; }
	.guide-section.alt { background:linear-gradient(180deg,#fdf2f8 0%,#fff 100%); }
	.section-wrap { max-width:1100px;margin:0 auto; }
	.section-chip { display:inline-block;font-size:0.75rem;font-weight:700;color:#e91e63;background:rgba(233,30,99,0.08);padding:0.35rem 0.9rem;border-radius:999px;margin-bottom:1rem;letter-spacing:0.03em; }
	.section-heading { font-size:clamp(1.75rem,4vw,2.5rem);font-weight:900;color:#1a0a12;letter-spacing:-0.025em;margin:0 0 0.75rem; }
	.section-sub { font-size:1.05rem;color:#78516a;line-height:1.7;max-width:600px;margin:0 0 2.5rem; }

	/* 2-col cards (Bento) */
	.cards-2 { display:grid;grid-template-columns:repeat(2,1fr);gap:1.5rem; }
	@media(max-width:768px){ .cards-2{ grid-template-columns:1fr; } }

	/* Bento Card */
	.bento-card { padding:2rem;border-radius:1.25rem;border:1px solid rgba(0,0,0,0.06);background:#fff;transition:transform 0.3s ease,box-shadow 0.3s ease; display:flex; flex-direction:column; gap:1rem; }
	.bento-card:hover { transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,0.08); }
	.bento-header { display:flex;align-items:center;gap:0.875rem; }
	.bento-icon { font-size:2rem; }
	.bento-card h3 { font-size:1.25rem;font-weight:800;color:#1a0a12;margin:0; }
	.bento-card p { font-size:0.9375rem;color:#78516a;line-height:1.6;margin:0; flex-grow:1; }
	.bento-list { list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:0.5rem; border-top: 1px solid rgba(0,0,0,0.06); padding-top: 1.25rem; }
	.bento-list li { font-size:0.875rem;color:#4a3341; display:flex;align-items:center;gap:0.625rem; }
	.bento-list li::before { content:'✓'; color:#e91e63; font-weight:bold; font-size:1rem; }
	
	.bento-card.pink  { border-top:4px solid #e91e63; }
	.bento-card.purple{ border-top:4px solid #9c27b0; }
	.bento-card.blue  { border-top:4px solid #1e88e5; }
	.bento-card.green { border-top:4px solid #43a047; }

	/* Steps */
	.steps-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem; }
	@media(max-width:768px){ .steps-grid{ grid-template-columns:1fr; } }
	.step-card { position:relative;padding:2rem 1.5rem 1.5rem;border-radius:1.25rem;background:#fff;border:1px solid rgba(233,30,99,0.1);text-align:center;transition:transform 0.3s ease,box-shadow 0.3s ease; }
	.step-card:hover { transform:translateY(-4px);box-shadow:0 12px 40px rgba(233,30,99,0.1);border-color:rgba(233,30,99,0.25); }
	.step-num { position:absolute;top:-13px;left:50%;transform:translateX(-50%);width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#e91e63,#f43f5e);color:#fff;font-size:0.75rem;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(233,30,99,0.3); }
	.step-icon { font-size:2.25rem;margin-bottom:0.75rem; }
	.step-card h3 { font-size:1rem;font-weight:700;color:#1a0a12;margin:0 0 0.375rem; }
	.step-card p { font-size:0.8125rem;color:#78516a;line-height:1.6;margin:0; }

	/* Footer */
	.site-footer { border-top:1px solid rgba(233,30,99,0.08);padding:2rem 1.5rem;background:#fff; }
	.footer-wrap { max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem; }
	.footer-brand { display:flex;align-items:center;gap:0.625rem;font-size:1rem;font-weight:800;color:#1a0a12; }
	.footer-logo { width:30px;height:30px; }
	.footer-copy { font-size:0.8125rem;color:#9ca3af;margin:0; }

	/* Keyframes */
	@keyframes glow { 0%,100%{opacity:0.6} 50%{opacity:1} }
	@keyframes bounce { from{transform:translateY(0)} to{transform:translateY(-8px)} }
	@keyframes dot { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
</style>
