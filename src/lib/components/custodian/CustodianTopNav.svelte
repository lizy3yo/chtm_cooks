<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore, user } from '$lib/stores/auth';
	import { themeStore } from '$lib/stores/theme';
	import { toastStore } from '$lib/stores/toast';
	import { sidebarCollapsed, mobileSidebarOpen } from '$lib/stores/custodian';
	import { Moon, Sun, HelpCircle, Bell, ChevronDown, LogOut, User, Settings, CalendarDays, History, ScanLine, X, CheckCircle2 } from 'lucide-svelte';
	import SignOutModal from '$lib/components/ui/SignOutModal.svelte';
	import logo from '$lib/assets/CHTM_LOGO.png';
	import { borrowRequestsAPI } from '$lib/api/borrowRequests';

	// Only render on custodian routes
	const isCustodianRoute = $derived($page.url.pathname.startsWith('/custodian'));

	let profileOpen = $state(false);
	let notifOpen   = $state(false);
	let signOutOpen = $state(false);

	// ── QR Scanner ────────────────────────────────────────────────────────────
	let scannerOpen   = $state(false);
	let scannerStatus = $state<'idle' | 'scanning' | 'success' | 'error' | 'loading'>('idle');
	let scannerMsg    = $state('');
	let scannerResult = $state<{ id: string; code: string; studentName: string; status: string } | null>(null);
	let videoEl       = $state<HTMLVideoElement | null>(null);
	let stream: MediaStream | null = null;
	let rafId: number | null = null;
	let fileInput: HTMLInputElement | null = null;

	// Camera device list
	let cameras = $state<MediaDeviceInfo[]>([]);
	let selectedCameraId = $state<string>('');

	// Check if BarcodeDetector is available (Chrome/Edge/Android)
	const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

	async function openScanner() {
		scannerOpen   = true;
		scannerStatus = 'idle';
		scannerResult = null;
		scannerMsg    = '';
		cameras = [];
		selectedCameraId = '';
		await new Promise(r => setTimeout(r, 80));
		// Enumerate cameras first (requires a brief getUserMedia to unlock device labels)
		try {
			const probe = await navigator.mediaDevices.getUserMedia({ video: true });
			probe.getTracks().forEach(t => t.stop());
		} catch {}
		const devices = await navigator.mediaDevices.enumerateDevices();
		cameras = devices.filter(d => d.kind === 'videoinput');
		// Default: prefer environment-facing or last device (usually rear/virtual)
		const env = cameras.find(c => /back|rear|environment|phone/i.test(c.label));
		selectedCameraId = env?.deviceId ?? cameras[cameras.length - 1]?.deviceId ?? '';
		startLiveCamera();
	}

	async function startLiveCamera(deviceId?: string) {
		stopStream();
		scannerStatus = 'loading';
		const id = deviceId ?? selectedCameraId;
		try {
			const constraints: MediaStreamConstraints = id
				? { video: { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } } }
				: { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } };
			stream = await navigator.mediaDevices.getUserMedia(constraints);
			if (!videoEl) { stopStream(); return; }
			videoEl.srcObject = stream;
			await videoEl.play();
			scannerStatus = 'scanning';
			if (hasBarcodeDetector) startBarcodeDetection();
		} catch {
			scannerStatus = 'error';
			scannerMsg = 'Camera unavailable. Use the button below to scan from a photo instead.';
		}
	}

	async function switchCamera(deviceId: string) {
		selectedCameraId = deviceId;
		await startLiveCamera(deviceId);
	}

	function startBarcodeDetection() {
		if (!videoEl) return;
		// @ts-ignore — BarcodeDetector not in TS lib yet
		const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
		async function detect() {
			if (!videoEl || scannerStatus !== 'scanning') return;
			try {
				const codes = await detector.detect(videoEl);
				if (codes.length > 0) {
					await handleScannedValue(codes[0].rawValue);
					return;
				}
			} catch {}
			rafId = requestAnimationFrame(detect);
		}
		rafId = requestAnimationFrame(detect);
	}

	async function handleScannedValue(rawId: string) {
		stopStream();
		scannerStatus = 'loading';
		scannerMsg = 'Looking up request…';
		try {
			const res = await borrowRequestsAPI.getById(rawId);
			const studentName = res.student?.fullName ?? `Student ${res.studentId.slice(-6).toUpperCase()}`;
			scannerResult = { id: rawId, code: `REQ-${rawId.slice(-6).toUpperCase()}`, studentName, status: res.status };
			scannerStatus = 'success';
			scannerMsg = '';
		} catch {
			scannerStatus = 'error';
			scannerMsg = 'QR code not recognised as a valid request. Try again.';
		}
	}

	// File-based fallback (iOS Safari, Firefox, or when camera is denied)
	async function handleFileInput(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		scannerStatus = 'loading';
		scannerMsg = 'Reading QR code…';
		try {
			const bitmap = await createImageBitmap(file);
			if (hasBarcodeDetector) {
				// @ts-ignore
				const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
				const codes = await detector.detect(bitmap);
				if (codes.length > 0) { await handleScannedValue(codes[0].rawValue); return; }
			}
			// Fallback: use jsQR via dynamic import
			const { default: jsQR } = await import('jsqr');
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width; canvas.height = bitmap.height;
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(bitmap, 0, 0);
			const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
			const result = jsQR(imageData.data, bitmap.width, bitmap.height);
			if (result) { await handleScannedValue(result.data); return; }
			scannerStatus = 'error';
			scannerMsg = 'No QR code found in the image. Try again.';
		} catch {
			scannerStatus = 'error';
			scannerMsg = 'Could not read the image. Try again.';
		}
	}

	function stopStream() {
		if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
		if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
		if (videoEl) { videoEl.srcObject = null; }
	}

	async function closeScanner() {
		stopStream();
		scannerOpen   = false;
		scannerStatus = 'idle';
		scannerResult = null;
		scannerMsg    = '';
	}

	function goToRequest() {
		if (!scannerResult) return;
		closeScanner();
		goto(`/custodian/requests?scan=${scannerResult.id}`);
	}

	async function rescan() {
		scannerResult = null;
		scannerMsg    = '';
		await new Promise(r => setTimeout(r, 60));
		startLiveCamera(selectedCameraId || undefined);
	}

	function statusLabel(s: string): string {
		const map: Record<string, string> = {
			approved_instructor: 'Pending Release',
			ready_for_pickup:    'Ready for Pickup',
			borrowed:            'Active Loan',
			pending_return:      'Pending Return',
			missing:             'Missing',
			returned:            'Returned'
		};
		return map[s] ?? s.replace(/_/g, ' ');
	}

	function statusColor(s: string): string {
		const map: Record<string, string> = {
			approved_instructor: 'bg-amber-100 text-amber-800',
			ready_for_pickup:    'bg-indigo-100 text-indigo-800',
			borrowed:            'bg-violet-100 text-violet-800',
			pending_return:      'bg-orange-100 text-orange-800',
			missing:             'bg-red-100 text-red-800',
			returned:            'bg-emerald-100 text-emerald-800'
		};
		return map[s] ?? 'bg-gray-100 text-gray-700';
	}
	// ─────────────────────────────────────────────────────────────────────────

	// ── Live clock ────────────────────────────────────────────────────────────
	let now = $state(new Date());
	let ticker: ReturnType<typeof setInterval>;

	onMount(() => {
		ticker = setInterval(() => { now = new Date(); }, 1000);
		document.body.style.paddingTop = '4rem';
		return () => { document.body.style.paddingTop = ''; };
	});
	onDestroy(() => {
		clearInterval(ticker);
		document.body.style.paddingTop = '';
		stopStream();
	});

	const formattedDateTime = $derived(
		now.toLocaleString('en-US', {
			weekday: 'long',
			month:   'short',
			day:     'numeric',
			year:    'numeric',
			hour:    'numeric',
			minute:  '2-digit',
			hour12:  true
		})
	);
	// ─────────────────────────────────────────────────────────────────────────

	function initials(first?: string, last?: string): string {
		return `${first?.charAt(0) ?? ''}${last?.charAt(0) ?? ''}`.toUpperCase() || '??';
	}

	async function logout() {
		profileOpen = false;
		await authStore.logout();
		toastStore.success('You have been logged out.', 'Logged Out');
		goto('/auth/login');
	}

	function handleWindowClick(e: MouseEvent) {
		if (!(e.target as HTMLElement).closest('[data-topnav-dropdown]')) {
			profileOpen = false;
			notifOpen   = false;
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

{#if isCustodianRoute}
<header
	class="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm transition-all duration-300 sm:px-6
		{$sidebarCollapsed ? 'lg:pl-24' : 'lg:pl-[19rem]'}"
>
	<!-- Left: branding on mobile/tablet, hidden on desktop (sidebar takes over) -->
	<div class="flex items-center gap-2">

		<!-- Branding — mobile/tablet only -->
		<div class="flex items-center gap-2 lg:hidden">
			<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white shadow-md">
				<img src={logo} alt="CHTM Logo" class="h-5 w-5 object-contain" />
			</div>
			<div class="leading-tight">
				<p class="text-xs font-bold text-gray-900">Custodian</p>
				<p class="text-[10px] text-gray-400">CHTM-Cooks</p>
			</div>
		</div>

		<!-- Divider + date — tablet only (sm to lg) -->
		<div class="hidden items-center gap-1.5 text-gray-500 sm:flex lg:hidden">
			<div class="ml-1 mr-1.5 h-6 w-px bg-gray-200"></div>
			<CalendarDays size={15} strokeWidth={1.75} class="shrink-0" />
			<span class="text-sm">{formattedDateTime}</span>
		</div>

		<!-- Date — desktop only (lg+) -->
		<div class="hidden items-center gap-1.5 text-gray-500 lg:flex">
			<CalendarDays size={15} strokeWidth={1.75} class="shrink-0" />
			<span class="text-sm">{formattedDateTime}</span>
		</div>
	</div>

	<!-- Right: controls -->
	<div class="ml-auto flex items-center gap-0.5">

		<!-- Dark mode toggle -->
		<button
			onclick={() => themeStore.toggle()}
			class="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-all duration-200 hover:bg-pink-50 hover:text-pink-600"
			aria-label={$themeStore === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
			title={$themeStore === 'dark' ? 'Light mode' : 'Dark mode'}
		>
			{#if $themeStore === 'dark'}
				<Sun size={18} strokeWidth={1.75} />
			{:else}
				<Moon size={18} strokeWidth={1.75} />
			{/if}
		</button>

		<!-- Help & Support -->
		<a
			href="/custodian/account/help"
			class="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-all duration-200 hover:bg-pink-50 hover:text-pink-600"
			aria-label="Help and support"
			title="Help & Support"
		>
			<HelpCircle size={18} strokeWidth={1.75} />
		</a>

		<!-- QR Scanner -->
		<button
			onclick={openScanner}
			class="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-all duration-200 hover:bg-pink-50 hover:text-pink-600"
			aria-label="Scan QR code"
			title="Scan QR Code"
		>
			<ScanLine size={18} strokeWidth={1.75} />
		</button>

		<!-- Notifications -->
		<div class="relative" data-topnav-dropdown>
			<button
				onclick={(e) => { e.stopPropagation(); notifOpen = !notifOpen; profileOpen = false; }}
				class="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-all duration-200 hover:bg-pink-50 hover:text-pink-600"
				aria-label="Notifications"
				aria-expanded={notifOpen}
				title="Notifications"
			>
				<Bell size={18} strokeWidth={1.75} />
				<span class="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-pink-500 ring-2 ring-white"></span>
			</button>

			{#if notifOpen}
				<div
					class="fixed left-2 right-2 top-[4.25rem] rounded-xl border border-gray-200 bg-white shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
					role="dialog"
					aria-label="Notifications"
				>
					<div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
						<p class="text-sm font-semibold text-gray-900">Notifications</p>
						<a href="/custodian/notifications" onclick={() => notifOpen = false} class="text-xs font-medium text-pink-600 hover:text-pink-700">View all</a>
					</div>
					<div class="py-8 text-center">
						<Bell size={28} class="mx-auto mb-2 text-gray-300" />
						<p class="text-sm text-gray-500">No new notifications</p>
					</div>
				</div>
			{/if}
		</div>

		<!-- Divider before avatar -->
		<div class="mx-2 h-6 w-px bg-gray-200"></div>

		{#if $user}
			<div class="relative" data-topnav-dropdown>
				<button
					onclick={(e) => { e.stopPropagation(); profileOpen = !profileOpen; notifOpen = false; }}
					class="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all duration-200 hover:bg-pink-50"
					aria-label="Account menu"
					aria-expanded={profileOpen}
				>
					<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-pink-100 to-pink-50 border-2 border-pink-200 text-pink-700 text-xs font-semibold shadow-sm">
						{#if $user.profilePhotoUrl}
							<img src={$user.profilePhotoUrl} alt="{$user.firstName} {$user.lastName}" class="h-full w-full object-cover" />
						{:else}
							{initials($user.firstName, $user.lastName)}
						{/if}
					</div>
					<span class="hidden max-w-[120px] truncate text-sm font-medium text-gray-900 sm:block">
						{$user.firstName} {$user.lastName}
					</span>
					<ChevronDown size={14} strokeWidth={2} class="hidden text-gray-400 transition-transform duration-200 sm:block {profileOpen ? 'rotate-180' : ''}" />
				</button>

				{#if profileOpen}
					<div
						class="absolute right-0 top-full mt-2 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
						role="menu"
					>
						<div class="border-b border-gray-100 px-4 py-3">
							<p class="truncate text-sm font-semibold text-gray-900">{$user.firstName} {$user.lastName}</p>
							<p class="truncate text-xs text-gray-500">{$user.email}</p>
						</div>
						<a href="/custodian/account/profile" onclick={() => profileOpen = false} role="menuitem" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-pink-50 hover:text-pink-600">
							<User size={15} class="text-gray-400" /> Profile
						</a>
						<a href="/custodian/account/settings" onclick={() => profileOpen = false} role="menuitem" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-pink-50 hover:text-pink-600">
							<Settings size={15} class="text-gray-400" /> Settings
						</a>
						<a href="/custodian/history" onclick={() => profileOpen = false} role="menuitem" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-pink-50 hover:text-pink-600">
							<History size={15} class="text-gray-400" /> History
						</a>
						<div class="my-1 border-t border-gray-100"></div>
						<button onclick={() => { profileOpen = false; signOutOpen = true; }} role="menuitem" class="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50">
							<LogOut size={15} /> Sign out
						</button>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</header>
{/if}

<SignOutModal
	open={signOutOpen}
	onconfirm={logout}
	oncancel={() => (signOutOpen = false)}
/>

<!-- ── QR Scanner Modal ──────────────────────────────────────────────────── -->
{#if scannerOpen}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="QR Scanner">
		<div class="fixed inset-0 bg-black/60 backdrop-blur-sm" onclick={closeScanner}></div>

		<div class="relative w-full max-w-sm rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
			<!-- Handle bar (mobile) -->
			<div class="flex justify-center pt-3 sm:hidden">
				<div class="h-1 w-10 rounded-full bg-gray-300"></div>
			</div>

			<!-- Header -->
			<div class="flex items-center justify-between px-5 pb-2 pt-4">
				<div>
					<h2 class="text-base font-bold text-gray-900">Scan QR Code</h2>
					<p class="text-xs text-gray-400">Point camera at student's request QR</p>
				</div>
				<button onclick={closeScanner} class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
					<X size={16} />
				</button>
			</div>

			<div class="px-5 pb-6">
				{#if scannerStatus === 'success' && scannerResult}
					<!-- Success -->
					<div class="flex flex-col items-center gap-4 py-4">
						<div class="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
							<CheckCircle2 size={32} class="text-emerald-600" />
						</div>
						<div class="text-center">
							<p class="text-xs font-semibold uppercase tracking-widest text-gray-400">Request Found</p>
							<p class="mt-1 font-mono text-xl font-bold text-gray-900">{scannerResult.code}</p>
							<p class="mt-0.5 text-sm text-gray-600">{scannerResult.studentName}</p>
							<span class="mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold {statusColor(scannerResult.status)}">
								{statusLabel(scannerResult.status)}
							</span>
						</div>
						<div class="flex w-full gap-3">
							<button onclick={rescan} class="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
								Scan Again
							</button>
							<button onclick={goToRequest} class="flex-1 rounded-xl bg-pink-600 py-3 text-sm font-semibold text-white hover:bg-pink-700 transition-colors">
								Open Request
							</button>
						</div>
					</div>

				{:else if scannerStatus === 'loading'}
					<!-- Loading -->
					<div class="flex flex-col items-center gap-3 py-10">
						<div class="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-pink-600"></div>
						<p class="text-sm text-gray-500">{scannerMsg || 'Starting camera…'}</p>
					</div>

				{:else if scannerStatus === 'error'}
					<!-- Error — show file fallback -->
					<div class="flex flex-col items-center gap-4 py-4">
						<div class="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
							<X size={24} class="text-red-500" />
						</div>
						<p class="text-center text-sm text-gray-600">{scannerMsg}</p>
						<!-- File-based fallback: works on all devices -->
						<label class="w-full cursor-pointer rounded-xl bg-pink-600 py-3 text-center text-sm font-semibold text-white hover:bg-pink-700 transition-colors">
							📷 Upload QR Photo
							<input
								type="file"
								accept="image/*"
								capture="environment"
								class="hidden"
								onchange={handleFileInput}
							/>
						</label>
						<button onclick={rescan} class="w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
							Try Camera Again
						</button>
					</div>

				{:else}
					<!-- Camera selector (shown when multiple cameras available) -->
					{#if cameras.length > 1}
						<div class="mb-3">
							<select
								value={selectedCameraId}
								onchange={(e) => switchCamera((e.target as HTMLSelectElement).value)}
								class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 focus:border-pink-400 focus:outline-none focus:ring-1 focus:ring-pink-400"
							>
								{#each cameras as cam, i}
									<option value={cam.deviceId}>{cam.label || `Camera ${i + 1}`}</option>
								{/each}
							</select>
						</div>
					{/if}
					<!-- Live camera viewfinder -->
					<div class="relative overflow-hidden rounded-2xl bg-black">
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							bind:this={videoEl}
							autoplay
							playsinline
							muted
							class="w-full rounded-2xl"
							style="max-height: 300px; object-fit: cover;"
						></video>
						<!-- Corner bracket overlay -->
						<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
							<div class="relative h-52 w-52">
								<span class="absolute left-0 top-0 h-8 w-8 rounded-tl-lg border-l-4 border-t-4 border-pink-400"></span>
								<span class="absolute right-0 top-0 h-8 w-8 rounded-tr-lg border-r-4 border-t-4 border-pink-400"></span>
								<span class="absolute bottom-0 left-0 h-8 w-8 rounded-bl-lg border-b-4 border-l-4 border-pink-400"></span>
								<span class="absolute bottom-0 right-0 h-8 w-8 rounded-br-lg border-b-4 border-r-4 border-pink-400"></span>
								<span class="absolute inset-x-2 h-0.5 animate-[scan_2s_ease-in-out_infinite] bg-pink-400/80 shadow-[0_0_8px_2px_rgba(236,72,153,0.5)]"></span>
							</div>
						</div>
					</div>
					<p class="mt-3 text-center text-xs text-gray-400">Align the QR code within the frame — it detects automatically</p>
					<!-- File fallback always available -->
					<label class="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-2.5 text-xs font-medium text-gray-500 hover:border-pink-400 hover:text-pink-600 transition-colors">
						<ScanLine size={14} /> Or upload a QR photo
						<input type="file" accept="image/*" capture="environment" class="hidden" onchange={handleFileInput} />
					</label>
				{/if}
			</div>
		</div>
	</div>
{/if}
