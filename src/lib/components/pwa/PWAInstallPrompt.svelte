<script lang="ts">
	import { onMount } from 'svelte';
	import { Download, X } from 'lucide-svelte';
	import favicon from '$lib/assets/CHTM_LOGO.png';

	let deferredPrompt: any = $state(null);
	let showBanner = $state(false);
	let showButton = $state(false);
	let isIOS = $state(false);
	let isStandalone = $state(false);
	let deviceType: 'mobile' | 'tablet' | 'desktop' = $state('mobile');
	let isInstalling = $state(false);
	let canInstall = $state(false);

	// Industry-standard dismissal behavior
	const DISMISSAL_RULES = {
		// First dismissal: Show again after 3 days
		FIRST_DISMISSAL_DAYS: 3,
		// Second dismissal: Show again after 7 days
		SECOND_DISMISSAL_DAYS: 7,
		// Third+ dismissal: Show again after 30 days
		PERMANENT_DISMISSAL_DAYS: 30,
		// Maximum dismissal count before permanent (30 days)
		MAX_DISMISSAL_COUNT: 2
	};

	function getDismissalInfo() {
		const dismissed = localStorage.getItem('pwa-install-dismissed');
		const dismissCount = parseInt(localStorage.getItem('pwa-dismiss-count') || '0');

		if (!dismissed) {
			return { shouldShow: true, dismissCount: 0 };
		}

		const dismissedTime = parseInt(dismissed);
		const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);

		// Determine cooldown period based on dismissal count
		let cooldownDays: number;
		if (dismissCount === 0) {
			cooldownDays = DISMISSAL_RULES.FIRST_DISMISSAL_DAYS;
		} else if (dismissCount === 1) {
			cooldownDays = DISMISSAL_RULES.SECOND_DISMISSAL_DAYS;
		} else {
			cooldownDays = DISMISSAL_RULES.PERMANENT_DISMISSAL_DAYS;
		}

		const shouldShow = daysSinceDismissed >= cooldownDays;

		console.log('PWA: Dismissal info:', {
			dismissCount,
			daysSinceDismissed: daysSinceDismissed.toFixed(2),
			cooldownDays,
			shouldShow
		});

		return { shouldShow, dismissCount };
	}

	onMount(() => {
		console.log('PWA: Component mounted');

		// Check if already installed
		isStandalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as any).standalone === true;

		// Detect iOS
		isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

		// Detect device type based on screen size and touch capability
		const width = window.innerWidth;
		const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

		if (width < 768) {
			deviceType = 'mobile';
		} else if (width >= 768 && width < 1024 && hasTouch) {
			deviceType = 'tablet';
		} else {
			deviceType = 'desktop';
		}

		console.log('PWA: Device type:', deviceType);
		console.log('PWA: Is standalone:', isStandalone);
		console.log('PWA: Is iOS:', isIOS);

		// Don't show if already installed
		if (isStandalone) {
			console.log('PWA: Already installed, not showing prompt');
			return;
		}

		// Check dismissal rules
		const { shouldShow, dismissCount } = getDismissalInfo();

		console.log('PWA: Should show based on dismissal rules:', shouldShow);

		// Listen for the beforeinstallprompt event
		window.addEventListener('beforeinstallprompt', (e) => {
			console.log('PWA: beforeinstallprompt event fired');
			e.preventDefault();
			deferredPrompt = e;
			canInstall = true;

			if (shouldShow) {
				// Show appropriate UI based on device after delay
				setTimeout(() => {
					console.log('PWA: Showing prompt for', deviceType);
					if (deviceType === 'mobile' || deviceType === 'tablet') {
						showBanner = true;
					} else {
						showButton = true;
					}
				}, 2000);
			} else {
				console.log('PWA: Not showing due to dismissal cooldown');
			}
		});

		// For iOS, show banner after user engagement
		if (isIOS && shouldShow) {
			console.log('PWA: iOS detected, showing prompt');
			canInstall = true;
			setTimeout(() => {
				if (deviceType === 'mobile' || deviceType === 'tablet') {
					showBanner = true;
				} else {
					showButton = true;
				}
			}, 3000);
		}

		// TESTING MODE: Show immediately if no prompt event (for local development)
		// This ensures the UI shows up for testing even without HTTPS
		// However, only show if we have a real prompt or are on a supported platform
		if (!isStandalone && shouldShow) {
			setTimeout(() => {
				// Only show in testing mode if we actually have the prompt event
				// or if we're on a platform that might support it
				const isLikelySupported = 
					!isIOS && // iOS needs manual instructions
					('BeforeInstallPromptEvent' in window || // Chrome/Edge support
					 navigator.userAgent.includes('Chrome') ||
					 navigator.userAgent.includes('Edge'));
				
				if (!canInstall && !deferredPrompt && isLikelySupported) {
					console.log('PWA: Testing mode - showing UI for supported browser');
					console.warn('PWA: Note - Install button may not work without beforeinstallprompt event');
					canInstall = false; // Don't set to true in testing mode without prompt
					// Don't show the button in testing mode without a real prompt
					// This prevents the "nothing happens" issue
				}
			}, 1500);
		}

		// Handle window resize
		const handleResize = () => {
			const newWidth = window.innerWidth;
			const newHasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

			const oldDeviceType = deviceType;

			if (newWidth < 768) {
				deviceType = 'mobile';
			} else if (newWidth >= 768 && newWidth < 1024 && newHasTouch) {
				deviceType = 'tablet';
			} else {
				deviceType = 'desktop';
			}

			// Switch UI if device type changed
			if (oldDeviceType !== deviceType && canInstall) {
				if (deviceType === 'desktop') {
					showBanner = false;
					showButton = true;
				} else if (showButton) {
					showButton = false;
					showBanner = true;
				}
			}
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	async function handleInstall() {
		console.log('PWA: Install clicked');
		console.log('PWA: deferredPrompt available:', !!deferredPrompt);
		console.log('PWA: isIOS:', isIOS);
		console.log('PWA: canInstall:', canInstall);

		if (isIOS) {
			// For iOS, just keep the banner open with instructions
			console.log('PWA: iOS - showing instructions in banner');
			return;
		}

		if (!deferredPrompt) {
			console.warn('PWA: No deferred prompt available');
			console.log('PWA: This means either:');
			console.log('  1. The beforeinstallprompt event has not fired yet');
			console.log('  2. The app is already installed');
			console.log('  3. The browser does not support PWA installation');
			console.log('  4. PWA requirements are not met (HTTPS, manifest, service worker)');
			
			// Show helpful message to user
			alert(
				'Unable to install automatically.\n\n' +
				'Please use your browser\'s install option:\n' +
				'• Chrome/Edge: Look for the install icon (⊕) in the address bar\n' +
				'• Or check the browser menu for "Install app" or "Add to Home Screen"'
			);
			return;
		}

		isInstalling = true;

		try {
			console.log('PWA: Showing install prompt');
			// Show the install prompt
			await deferredPrompt.prompt();

			// Wait for the user to respond
			const { outcome } = await deferredPrompt.userChoice;

			console.log('PWA: User choice:', outcome);

			if (outcome === 'accepted') {
				console.log('PWA: Installed successfully');
				showBanner = false;
				showButton = false;
				localStorage.removeItem('pwa-install-dismissed');
				localStorage.removeItem('pwa-dismiss-count');
			} else {
				console.log('PWA: User declined installation');
			}

			deferredPrompt = null;
		} catch (error) {
			console.error('PWA: Install error:', error);
			alert('Installation failed. Please try using your browser\'s install option from the menu.');
		} finally {
			isInstalling = false;
		}
	}

	function handleDismiss() {
		console.log('PWA: Dismissed by user');
		showBanner = false;
		showButton = false;

		// Get current dismissal count
		const currentCount = parseInt(localStorage.getItem('pwa-dismiss-count') || '0');
		const newCount = currentCount + 1;

		// Store dismissal time and increment count
		localStorage.setItem('pwa-install-dismissed', Date.now().toString());
		localStorage.setItem('pwa-dismiss-count', newCount.toString());

		// Determine next show time based on dismissal count
		let nextShowDays: number;
		if (newCount === 1) {
			nextShowDays = DISMISSAL_RULES.FIRST_DISMISSAL_DAYS;
		} else if (newCount === 2) {
			nextShowDays = DISMISSAL_RULES.SECOND_DISMISSAL_DAYS;
		} else {
			nextShowDays = DISMISSAL_RULES.PERMANENT_DISMISSAL_DAYS;
		}

		console.log(
			`PWA: Dismissed ${newCount} time(s). Will show again in ${nextShowDays} day(s)`
		);
	}

	function handleButtonClick() {
		if (deviceType === 'mobile' || deviceType === 'tablet') {
			showBanner = true;
		} else {
			handleInstall();
		}
	}
</script>

<!-- Mobile/Tablet Toast (Top) -->
{#if showBanner && (deviceType === 'mobile' || deviceType === 'tablet')}
	<div class="pwa-toast-container">
		<div class="pwa-toast" class:tablet={deviceType === 'tablet'}>
			<!-- App Icon -->
			<div class="toast-icon-wrapper">
				<img src={favicon} alt="CHTM Cooks" class="toast-app-icon" />
			</div>

			<!-- Content -->
			<div class="toast-content">
				<h3 class="toast-title">Install CHTM Cooks</h3>
				{#if isIOS}
					<p class="toast-description">
						Tap <svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							style="display: inline; vertical-align: middle; margin: 0 2px;"
						>
							<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
							<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
						</svg> Share, then "Add to Home Screen"
					</p>
				{:else if !deferredPrompt}
					<p class="toast-description">
						Look for the install icon <svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							style="display: inline; vertical-align: middle; margin: 0 2px;"
						>
							<path d="M12 5v14M5 12l7 7 7-7" />
						</svg> in your browser
					</p>
				{:else}
					<p class="toast-description">Quick access & offline mode</p>
				{/if}
			</div>

			<!-- Install Button (only if native prompt available) -->
			{#if !isIOS && deferredPrompt}
				<button
					class="toast-install-btn"
					onclick={handleInstall}
					disabled={isInstalling}
					aria-label="Install app"
				>
					{#if isInstalling}
						<span class="spinner-small"></span>
					{:else}
						Install
					{/if}
				</button>
			{/if}
		</div>
	</div>
{/if}

<!-- Desktop Floating Button (Bottom Right) -->
{#if showButton && deviceType === 'desktop'}
	<div class="pwa-floating-card">
		<button
			class="pwa-install-button"
			onclick={handleButtonClick}
			aria-label="Install CHTM Cooks app"
			title="Install CHTM Cooks"
		>
			<Download size={22} strokeWidth={2.5} />
			<span>Install App</span>
		</button>
	</div>
{/if}

<style>
	/* ═══════════════════════════════════════════════════════
	   MOBILE/TABLET TOAST (TOP)
	   ═══════════════════════════════════════════════════════ */

	.pwa-toast-container {
		position: fixed;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 9999;
		width: calc(100% - 2rem);
		max-width: 28rem;
		pointer-events: none;
	}

	.pwa-toast {
		pointer-events: auto;
		background: #1a0a12;
		border-radius: 1rem;
		padding: 1rem;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
		animation: slideDown 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		align-items: center;
		gap: 0.875rem;
		position: relative;
		border: 1px solid rgba(233, 30, 99, 0.2);
	}

	.pwa-toast.tablet {
		padding: 1.25rem;
		gap: 1rem;
	}

	@keyframes slideDown {
		from {
			transform: translateY(-100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.toast-icon-wrapper {
		flex-shrink: 0;
	}

	.toast-app-icon {
		width: 48px;
		height: 48px;
		border-radius: 0.75rem;
		box-shadow: 0 4px 12px rgba(233, 30, 99, 0.2);
	}

	.tablet .toast-app-icon {
		width: 56px;
		height: 56px;
	}

	.toast-content {
		flex: 1;
		min-width: 0;
	}

	.toast-title {
		font-size: 0.9375rem;
		font-weight: 700;
		color: #fdf2f8;
		margin: 0 0 0.25rem;
		letter-spacing: -0.01em;
	}

	.tablet .toast-title {
		font-size: 1rem;
	}

	.toast-description {
		font-size: 0.8125rem;
		color: #fbcfe8;
		margin: 0;
		line-height: 1.4;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		opacity: 0.9;
	}

	.tablet .toast-description {
		font-size: 0.875rem;
	}

	.toast-install-btn {
		padding: 0.625rem 1.25rem;
		background: linear-gradient(135deg, #e91e63, #c2185b);
		color: #ffffff;
		border: none;
		border-radius: 0.625rem;
		font-size: 0.875rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.3s ease;
		box-shadow: 0 4px 12px rgba(233, 30, 99, 0.3);
		flex-shrink: 0;
		min-width: 70px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tablet .toast-install-btn {
		padding: 0.75rem 1.5rem;
		font-size: 0.9375rem;
		min-width: 80px;
	}

	.toast-install-btn:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 20px rgba(233, 30, 99, 0.4);
	}

	.toast-install-btn:active {
		transform: translateY(0);
	}

	.toast-install-btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
		transform: none;
	}

	.spinner-small {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #ffffff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ═══════════════════════════════════════════════════════
	   DESKTOP FLOATING CARD (BOTTOM RIGHT)
	   ═══════════════════════════════════════════════════════ */

	.pwa-floating-card {
		position: fixed;
		bottom: 2rem;
		right: 6rem;
		z-index: 9999;
		background: linear-gradient(135deg, #e91e63, #c2185b);
		border-radius: 3rem;
		padding: 0.25rem;
		box-shadow: 0 8px 32px rgba(233, 30, 99, 0.4);
		animation: fadeInScale 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	@keyframes fadeInScale {
		from {
			opacity: 0;
			transform: scale(0.8) translateY(20px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.pwa-install-button {
		background: transparent;
		color: #ffffff;
		border: none;
		border-radius: 3rem;
		padding: 1rem 2rem;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		align-items: center;
		gap: 0.625rem;
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 1rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		position: relative;
	}

	.pwa-install-button::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 3rem;
		background: rgba(255, 255, 255, 0.1);
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.pwa-install-button:hover::before {
		opacity: 1;
	}

	.pwa-install-button:hover {
		transform: translateY(-2px);
	}

	.pwa-install-button:active {
		transform: translateY(0);
	}

	/* ═══════════════════════════════════════════════════════
	   RESPONSIVE ADJUSTMENTS
	   ═══════════════════════════════════════════════════════ */

	@media (max-width: 480px) {
		.pwa-toast-container {
			width: calc(100% - 1.5rem);
		}

		.pwa-toast {
			padding: 0.875rem;
			gap: 0.75rem;
		}

		.toast-app-icon {
			width: 42px;
			height: 42px;
		}

		.toast-title {
			font-size: 0.875rem;
		}

		.toast-description {
			font-size: 0.75rem;
		}

		.toast-install-btn {
			padding: 0.5rem 1rem;
			font-size: 0.8125rem;
			min-width: 60px;
		}
	}

	@media (max-width: 360px) {
		.pwa-toast {
			flex-wrap: wrap;
		}

		.toast-install-btn {
			width: 100%;
			margin-top: 0.5rem;
		}
	}

	/* Dark mode support (already dark) */
	@media (prefers-color-scheme: light) {
		.pwa-toast {
			background: #ffffff;
			border-color: rgba(233, 30, 99, 0.15);
		}

		.toast-title {
			color: #1a0a12;
		}

		.toast-description {
			color: #78516a;
		}
	}

	/* Accessibility */
	@media (prefers-reduced-motion: reduce) {
		.pwa-toast,
		.pwa-floating-card {
			animation: none;
		}

		.toast-install-btn:hover,
		.pwa-install-button:hover {
			transform: none;
		}
	}

	/* Safe area for notched devices */
	@supports (padding: max(0px)) {
		.pwa-toast-container {
			top: max(1rem, env(safe-area-inset-top));
		}
	}
</style>
