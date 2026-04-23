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

	<!-- ══ DASHBOARD & TRUST ══════════════════════ -->
	<section id="dashboard" class="guide-section">
		<div class="section-wrap">
			<span class="section-chip">📊 Dashboard</span>
			<h2 class="section-heading">Your Personal Dashboard</h2>
			<p class="section-sub">After signing in, your dashboard gives you a live overview of all your borrowing activity, metrics, and Trust Score.</p>
			<div class="cards-4">
				<div class="gcard pink">
					<div class="gcard-icon">🎯</div>
					<h3>Trust Score</h3>
					<p>A 0–100 score based on your borrowing behavior. Return items on time and undamaged to maintain Excellent standing.</p>
				</div>
				<div class="gcard purple">
					<div class="gcard-icon">📈</div>
					<h3>KPI Overview</h3>
					<p>Active loans, completed returns, pending requests, and overdue items — all visible at a glance with color-coded cards.</p>
				</div>
				<div class="gcard blue">
					<div class="gcard-icon">⏱️</div>
					<h3>Return Performance</h3>
					<p>Track on-time rate, late returns, and item health. Your history directly affects your Trust Score breakdown.</p>
				</div>
				<div class="gcard green">
					<div class="gcard-icon">🔔</div>
					<h3>Due Date Alerts</h3>
					<p>Items due within 7 days are flagged with urgency badges so you never miss a return deadline.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ══ CATALOG ════════════════════════════════ -->
	<section id="catalog" class="guide-section alt">
		<div class="section-wrap">
			<span class="section-chip">📦 Catalog</span>
			<h2 class="section-heading">Browse Available Equipment</h2>
			<p class="section-sub">The catalog shows all cooking equipment with real-time availability updated via live data sync.</p>
			<div class="cards-4">
				<div class="gcard pink">
					<div class="gcard-icon">🔍</div>
					<h3>Search & Filter</h3>
					<p>Search by name or description. Filter by category, status, or sort by recently added items.</p>
				</div>
				<div class="gcard purple">
					<div class="gcard-icon">🏷️</div>
					<h3>Live Availability</h3>
					<p>In Stock, Low Stock, Out of Stock, or In Maintenance — all updated in real time so you always see accurate data.</p>
				</div>
				<div class="gcard blue">
					<div class="gcard-icon">📋</div>
					<h3>Item Details</h3>
					<p>Click any item for full details: specifications, description, high-res photos, and current quantity.</p>
				</div>
				<div class="gcard green">
					<div class="gcard-icon">🛒</div>
					<h3>Add to Request</h3>
					<p>Click "Request" on any available item to add it to your cart, then finalize in the request form.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ══ REQUEST FLOW ══════════════════════════ -->
	<section id="request-flow" class="guide-section">
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

	<!-- ══ AI ASSISTANT ══════════════════════════ -->
	<section id="ai-assistant" class="guide-section alt">
		<div class="section-wrap">
			<span class="section-chip">🤖 AI Assistant</span>
			<h2 class="section-heading">Your Smart Helper</h2>
			<p class="section-sub">A built-in AI chatbot is available on every page to help you navigate the system instantly.</p>
			<div class="cards-3">
				<div class="gcard pink">
					<div class="gcard-icon">💬</div>
					<h3>Ask Anything</h3>
					<p>Get instant answers about features, equipment availability, or how to understand your Trust Score breakdown.</p>
				</div>
				<div class="gcard purple">
					<div class="gcard-icon">📖</div>
					<h3>Step-by-Step Guide</h3>
					<p>The AI knows every system feature and can walk you through any process — including your very first request.</p>
				</div>
				<div class="gcard blue">
					<div class="gcard-icon">⚡</div>
					<h3>Always Available</h3>
					<p>Look for the chat bubble in the bottom corner of any page. One click opens the AI assistant anytime.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ══ QR CODE ════════════════════════════════ -->
	<section id="qr-code" class="guide-section">
		<div class="section-wrap">
			<span class="section-chip">📱 QR Code</span>
			<h2 class="section-heading">Contactless Pickup & Return</h2>
			<p class="section-sub">Each approved request generates a unique QR code for fast, verified equipment handoff.</p>
			<div class="cards-3">
				<div class="gcard pink">
					<div class="gcard-icon">🔲</div>
					<h3>Auto-Generated</h3>
					<p>Once your request is approved and ready for pickup, a QR code appears automatically in your request details.</p>
				</div>
				<div class="gcard purple">
					<div class="gcard-icon">📷</div>
					<h3>Custodian Scans</h3>
					<p>Show your QR code at the custodian desk. They scan it to instantly verify your identity and retrieve your request.</p>
				</div>
				<div class="gcard green">
					<div class="gcard-icon">✅</div>
					<h3>Instant Verification</h3>
					<p>No paperwork needed. The QR system confirms pickup and return digitally with automatic record-keeping.</p>
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

	/* 4-col cards */
	.cards-4 { display:grid;grid-template-columns:repeat(4,1fr);gap:1.25rem; }
	@media(max-width:900px){ .cards-4{ grid-template-columns:repeat(2,1fr); } }
	@media(max-width:540px){ .cards-4{ grid-template-columns:1fr; } }

	/* 3-col cards */
	.cards-3 { display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem; }
	@media(max-width:768px){ .cards-3{ grid-template-columns:1fr; } }

	/* Generic card */
	.gcard { padding:1.75rem;border-radius:1.25rem;border:1px solid rgba(0,0,0,0.06);background:#fff;transition:transform 0.3s ease,box-shadow 0.3s ease; }
	.gcard:hover { transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,0.08); }
	.gcard-icon { font-size:2rem;margin-bottom:0.875rem; }
	.gcard h3 { font-size:1rem;font-weight:700;color:#1a0a12;margin:0 0 0.5rem; }
	.gcard p { font-size:0.875rem;color:#78516a;line-height:1.65;margin:0; }
	.gcard.pink  { border-left:3px solid #e91e63; }
	.gcard.purple{ border-left:3px solid #9c27b0; }
	.gcard.blue  { border-left:3px solid #1e88e5; }
	.gcard.green { border-left:3px solid #43a047; }

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
