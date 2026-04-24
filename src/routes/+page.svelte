<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isAuthenticated, user, isLoading } from '$lib/stores/auth';
	import favicon from '$lib/assets/CHTM_LOGO.png';
	import LandingNav  from '$lib/components/landing/LandingNav.svelte';
	import LandingHero from '$lib/components/landing/LandingHero.svelte';
	import { Bot, QrCode, ChevronLeft, ChevronRight, Search, ShoppingCart, Send, CheckCircle2, Package, RefreshCw, BarChart3, Boxes } from 'lucide-svelte';

	let authCheckComplete = $state(false);
	let diffPosition = $state(50);
	let carouselEl: HTMLElement | null = $state(null);

	function scrollCarousel(direction: number) {
		if (!carouselEl) return;
		const scrollAmount = carouselEl.clientWidth; // full width for single-item slide
		carouselEl.scrollBy({ left: scrollAmount * direction, behavior: 'smooth' });
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
		{ step:1, title:'Browse Catalog',      desc:'Find cooking equipment with real-time stock info.',             icon: Search },
		{ step:2, title:'Add to Request',      desc:'Select items, quantities, and set your borrow schedule.',       icon: ShoppingCart },
		{ step:3, title:'Submit for Review',   desc:'Your request is sent to your class instructor for approval.',   icon: Send },
		{ step:4, title:'Instructor Approves', desc:'Instructor reviews, then custodian prepares your items.',       icon: CheckCircle2 },
		{ step:5, title:'Pick Up Equipment',   desc:'Show your QR code at the custodian desk and collect items.',    icon: Package },
		{ step:6, title:'Return On Time',      desc:'Return items on schedule to keep your Trust Score high.',       icon: RefreshCw }
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
						<span class="bento-icon"><BarChart3 size={32} strokeWidth={2.5} color="#e91e63" /></span>
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
						<span class="bento-icon"><Boxes size={32} strokeWidth={2.5} color="#9c27b0" /></span>
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
		</div>
		<div class="carousel-container">
				<div class="carousel" bind:this={carouselEl}>
					{#each requestSteps as s}
					{@const Icon = s.icon}
					<div class="carousel-item">
						<div class="step-card">
							<div class="step-num">{s.step}</div>
							<div class="step-icon">
								<Icon size={36} strokeWidth={2.5} color="#e91e63" />
							</div>
							<h3>{s.title}</h3>
							<p>{s.desc}</p>
						</div>
					</div>
					{/each}
				</div>
				
				<div class="carousel-controls">
					<button class="carousel-btn" onclick={() => scrollCarousel(-1)} aria-label="Previous step">
						<ChevronLeft size={20} strokeWidth={2.5} />
					</button>
					<button class="carousel-btn" onclick={() => scrollCarousel(1)} aria-label="Next step">
						<ChevronRight size={20} strokeWidth={2.5} />
					</button>
				</div>
			</div>
	</section>

	<!-- ══ SMART FEATURES ════════════════════════════════ -->
	<section id="smart-features" class="guide-section">
		<div class="section-wrap">
			<span class="section-chip">🚀 Smart Technology</span>
			<h2 class="section-heading">Next-Gen Capabilities</h2>
			<p class="section-sub">Leverage cutting-edge AI and contactless features to streamline your entire borrowing process.</p>
			
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
								<p>Contactless handoffs. Generate a unique QR code for approved requests to verify identity and quickly retrieve or return items.</p>
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
				<div class="diff-item diff-ai" style="clip-path: polygon(0 0, {diffPosition}% 0, {diffPosition}% 100%, 0 100%);">
					<div class="diff-grid">
						<div class="diff-content diff-content-left">
							<div class="diff-text-block dark-theme">
								<div class="diff-header">
									<div class="icon-wrap blue"><Bot size={28} strokeWidth={2.5} /></div>
									<h3>AI Assistant</h3>
								</div>
								<p>Your 24/7 smart helper. Ask questions about equipment, system features, or get step-by-step guidance on navigating the platform.</p>
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
				<input type="range" min="0" max="100" bind:value={diffPosition} class="diff-range-input" aria-label="Slide to compare AI Assistant and QR Code features" />

				<!-- Slider Handle Visual -->
				<div class="diff-resizer-handle" style="left: {diffPosition}%;">
					<div class="handle-line"></div>
					<div class="handle-knob">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
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
	.guide-section { min-height:100vh; display:flex; flex-direction:column; justify-content:center; padding:5rem 1.5rem; overflow:hidden; position:relative; }
	.guide-section.alt { background:linear-gradient(180deg, #ffffff 0%, rgba(253,232,240,0.35) 55%, rgba(251,182,205,0.45) 100%); }
	.section-wrap { max-width:1100px; width:100%; margin:0 auto; position:relative; z-index:2; }
	.section-chip { display:inline-block;font-size:0.75rem;font-weight:700;color:#e91e63;background:rgba(233,30,99,0.08);padding:0.35rem 0.9rem;border-radius:999px;margin-bottom:1rem;letter-spacing:0.03em; }
	.section-heading { font-size:clamp(1.75rem,4vw,2.5rem);font-weight:900;color:#1a0a12;letter-spacing:-0.025em;margin:0 0 0.75rem; }
	.section-sub { font-size:1.05rem;color:#78516a;line-height:1.7;max-width:600px;margin:0 0 2.5rem; }
	
	/* Request Flow Full Screen Override */
	#request-flow { padding-left:0; padding-right:0; }
	#request-flow .section-wrap { padding-left:1.5rem; padding-right:1.5rem; }

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

	/* Steps Carousel (DaisyUI Style Full Width) */
	.carousel-container { position:relative; width:100%; margin:2rem 0 0; }
	.carousel { display:flex; overflow-x:auto; scroll-snap-type:x mandatory; scroll-behavior:smooth; padding:1.5rem 0; scrollbar-width:none; -ms-overflow-style:none; }
	.carousel::-webkit-scrollbar { display:none; }
	.carousel-item { scroll-snap-align:center; flex:0 0 100%; display:flex; flex-direction:column; padding:0 4rem; box-sizing:border-box; }
	@media (max-width:768px) {
		.carousel-item { padding:0 1rem; }
	}
	
	.carousel-controls { display:flex; justify-content:space-between; align-items:center; position:absolute; top:50%; left:2rem; right:2rem; transform:translateY(-50%); pointer-events:none; z-index:10; }
	@media (max-width:768px) {
		.carousel-controls { left: 1rem; right: 1rem; }
	}
	.carousel-btn { pointer-events:auto; width:48px; height:48px; border-radius:50%; background:rgba(255,255,255,0.95); backdrop-filter:blur(8px); border:1px solid rgba(233,30,99,0.2); display:flex; align-items:center; justify-content:center; color:#e91e63; cursor:pointer; transition:all 0.2s ease; box-shadow:0 8px 20px rgba(233,30,99,0.15); }
	.carousel-btn:hover { background:#e91e63; color:#fff; transform:translateY(-2px); box-shadow:0 12px 24px rgba(233,30,99,0.25); }
	
	.step-card { max-width:800px; width:100%; margin:0 auto; position:relative;padding:3rem 2rem;border-radius:1.5rem;background:#fff;border:1px solid rgba(233,30,99,0.1);text-align:center;transition:transform 0.3s ease,box-shadow 0.3s ease; display:flex; flex-direction:column; align-items:center; }
	.step-card:hover { transform:translateY(-4px);box-shadow:0 12px 40px rgba(233,30,99,0.1);border-color:rgba(233,30,99,0.25); }
	.step-num { position:absolute;top:-16px;left:50%;transform:translateX(-50%);width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#e91e63,#f43f5e);color:#fff;font-size:0.875rem;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(233,30,99,0.3); }
	.step-icon { font-size:3rem;margin-bottom:1.5rem; display:flex; align-items:center; justify-content:center; width:80px; height:80px; background:rgba(233,30,99,0.05); border-radius:50%; border:1px solid rgba(233,30,99,0.1); }
	.step-card h3 { font-size:1.5rem;font-weight:800;color:#1a0a12;margin:0 0 0.75rem; }
	.step-card p { font-size:1.0625rem;color:#78516a;line-height:1.6;margin:0; max-width:500px; }

	/* Footer */
	.site-footer { border-top:1px solid rgba(233,30,99,0.08);padding:2rem 1.5rem;background:#fff; }
	.footer-wrap { max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem; }
	.footer-brand { display:flex;align-items:center;gap:0.625rem;font-size:1rem;font-weight:800;color:#1a0a12; }
	.footer-logo { width:30px;height:30px; }
	.footer-copy { font-size:0.8125rem;color:#9ca3af;margin:0; }

	/* Diff Component Showcase */
	.diff-showcase { position:relative; width:100%; min-height:450px; background:transparent; user-select:none; }
	.diff-item { position:absolute; inset:0; width:100%; height:100%; overflow:hidden; border-radius:1.5rem; }
	.diff-qr { background:#ffffff; border:1px solid rgba(233,30,99,0.15); box-shadow:0 20px 40px rgba(233,30,99,0.05); z-index:1; }
	.diff-ai { background:linear-gradient(135deg, #1f0814 0%, #3a0d24 100%); border:1px solid rgba(233,30,99,0.2); box-shadow:0 20px 40px rgba(233,30,99,0.15); z-index:2; will-change: clip-path; }
	
	.diff-grid { display:grid; grid-template-columns:1fr 1fr; width:100%; height:100%; }
	.diff-content { padding:3rem; display:flex; align-items:center; }
	.diff-content-left { padding-right:4rem; }
	.diff-content-right { padding-left:4rem; }
	
	.diff-text-block { display:flex; flex-direction:column; gap:1.25rem; width: 100%; max-width: 480px; }
	.diff-header { display:flex; align-items:center; gap:1rem; }
	.icon-wrap { width:52px; height:52px; border-radius:1rem; display:flex; align-items:center; justify-content:center; color:#fff; box-shadow:0 8px 20px rgba(0,0,0,0.15); flex-shrink:0; }
	.icon-wrap.green, .icon-wrap.blue { background:linear-gradient(135deg, #f43f5e, #e91e63); box-shadow:0 8px 20px rgba(233,30,99,0.3); }
	
	.diff-text-block h3 { font-size:1.875rem; font-weight:800; margin:0; letter-spacing:-0.03em; }
	.light-theme h3 { color:#1a0a12; }
	.dark-theme h3 { color:#fdf2f8; }
	
	.diff-text-block p { font-size:1.0625rem; line-height:1.6; margin:0; }
	.light-theme p { color:#78516a; }
	.dark-theme p { color:#fbcfe8; opacity:0.9; }
	
	.diff-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.75rem; padding-top:1.25rem; }
	.light-theme .diff-list { border-top:1px solid rgba(233,30,99,0.1); }
	.dark-theme .diff-list { border-top:1px solid rgba(244,63,94,0.15); }
	
	.diff-list li { font-size:0.9375rem; display:flex; align-items:center; gap:0.75rem; font-weight:500; }
	.light-theme .diff-list li { color:#4a3341; }
	.dark-theme .diff-list li { color:#fce7f3; }
	
	.diff-list li::before { content:'✓'; font-weight:bold; font-size:1.125rem; color:#e91e63; }
	.dark-theme .diff-list li::before { color:#f43f5e; }
	
	.diff-visual { display:flex; align-items:center; justify-content:center; padding:3rem; }
	
	/* AI Mockup (Dark Theme) */
	.mockup-chat { width:100%; max-width:340px; background:rgba(26,10,18,0.6); backdrop-filter:blur(12px); border-radius:1.5rem; padding:1.5rem; box-shadow:0 20px 40px rgba(0,0,0,0.3); display:flex; flex-direction:column; gap:1.25rem; border:1px solid rgba(244,63,94,0.15); }
	.chat-bubble { padding:0.875rem 1.25rem; border-radius:1.25rem; font-size:0.9375rem; line-height:1.5; max-width:85%; animation:pulse 3s infinite ease-in-out; }
	.chat-user { align-self:flex-end; background:rgba(255,255,255,0.08); color:#fdf2f8; border-bottom-right-radius:0.375rem; }
	.chat-ai { align-self:flex-start; background:linear-gradient(135deg, #e91e63, #c2185b); color:#fff; border-bottom-left-radius:0.375rem; position:relative; box-shadow:0 10px 20px rgba(233,30,99,0.25); }
	.ai-dot { display:inline-block; width:6px; height:6px; background:#fdf2f8; border-radius:50%; margin-right:8px; vertical-align:middle; box-shadow:0 0 8px #fdf2f8; }
	.chat-input-bar { display:flex; gap:0.75rem; align-items:center; margin-top:0.5rem; }
	.chat-input-pill { flex:1; height:44px; background:rgba(255,255,255,0.05); border-radius:999px; border:1px solid rgba(255,255,255,0.1); }
	.chat-send-btn { width:44px; height:44px; background:#e91e63; border-radius:50%; display:flex; align-items:center; justify-content:center; opacity:0.9; }
	
	/* QR Mockup (Light Theme) */
	.mockup-qr { position:relative; width:260px; height:260px; background:#fff; border-radius:2rem; padding:2rem; box-shadow:0 20px 40px rgba(233,30,99,0.1); border:1px solid rgba(233,30,99,0.1); display:flex; align-items:center; justify-content:center; }
	.qr-corners { position:absolute; inset:1rem; border:4px solid #e91e63; border-radius:1.25rem; opacity:0.15; }
	.qr-blocks { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; width:100%; height:100%; }
	.qr-block { background:#78516a; border-radius:6px; opacity:0.8; }
	.qr-block:nth-child(2n) { opacity:0.3; }
	.qr-block:nth-child(3n) { opacity:0.5; }
	.qr-block:nth-child(1), .qr-block:nth-child(4), .qr-block:nth-child(13) { background:#e91e63; opacity:1; border-radius:10px; }
	.qr-scan-line { position:absolute; top:0; left:0; width:100%; height:4px; background:#ff4081; box-shadow:0 0 20px #ff4081; animation:scan 2.5s infinite linear; border-radius:4px; z-index:10; }
	
	@keyframes scan { 0%{top:10%;opacity:0;} 10%{opacity:1;} 90%{opacity:1;} 100%{top:90%;opacity:0;} }
	
	/* Diff Controls */
	.diff-range-input { position:absolute; inset:0; width:100%; height:100%; opacity:0; z-index:10; cursor:ew-resize; margin:0; }
	.diff-resizer-handle { position:absolute; top:-10px; bottom:-10px; width:0; z-index:5; pointer-events:none; }
	.handle-line { position:absolute; top:10px; bottom:10px; left:-1.5px; width:3px; background:rgba(255,255,255,0.9); box-shadow:0 0 10px rgba(0,0,0,0.3); border-radius:3px; }
	.handle-knob { position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:52px; height:52px; background:#fff; border-radius:50%; box-shadow:0 6px 20px rgba(233,30,99,0.25); display:flex; align-items:center; justify-content:center; color:#c2185b; gap:2px; border:1px solid rgba(233,30,99,0.1); transition:transform 0.2s ease, box-shadow 0.2s ease; }
	.diff-range-input:active ~ .diff-resizer-handle .handle-knob, .diff-range-input:hover ~ .diff-resizer-handle .handle-knob { transform:translate(-50%, -50%) scale(1.1); box-shadow:0 8px 24px rgba(233,30,99,0.35); color:#e91e63; border-color:rgba(233,30,99,0.2); }
	
	@media(max-width:900px) {
		.diff-showcase { min-height:800px; }
		.diff-grid { grid-template-columns:1fr; grid-template-rows:1fr 1fr; }
		.diff-item.diff-ai { clip-path: polygon(0 0, 100% 0, 100% var(--pos, 50%), 0 var(--pos, 50%)) !important; }
		.diff-content { padding:2rem; align-items:flex-start; }
		.diff-content-left, .diff-content-right { padding:2rem; }
		.diff-visual { padding:2rem; align-items:center; }
		.diff-resizer-handle { left:0 !important; top:var(--pos, 50%); width:100%; height:0; }
		.handle-line { top:-1.5px; left:10px; right:10px; bottom:auto; height:3px; width:auto; }
		.handle-knob { flex-direction:column; transform:translate(-50%, -50%) rotate(90deg); }
		.diff-range-input { cursor:ns-resize; }
	}

	/* Keyframes */
	@keyframes glow { 0%,100%{opacity:0.6} 50%{opacity:1} }
	@keyframes bounce { from{transform:translateY(0)} to{transform:translateY(-8px)} }
	@keyframes dot { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
</style>
