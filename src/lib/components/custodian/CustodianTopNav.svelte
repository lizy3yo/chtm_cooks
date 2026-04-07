<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore, user } from '$lib/stores/auth';
	import { themeStore } from '$lib/stores/theme';
	import { toastStore } from '$lib/stores/toast';
	import { sidebarCollapsed, mobileSidebarOpen } from '$lib/stores/custodian';
	import { notificationsAPI, type NotificationRecord } from '$lib/api/notifications';
	import { Moon, Sun, HelpCircle, Bell, ChevronDown, LogOut, User, Settings, CalendarDays, History, ScanLine, X, CheckCircle2 } from 'lucide-svelte';
	import SignOutModal from '$lib/components/ui/SignOutModal.svelte';
	import logo from '$lib/assets/CHTM_LOGO.png';
	import { borrowRequestsAPI } from '$lib/api/borrowRequests';
	import QrScanner from '$lib/components/custodian/QrScanner.svelte';

	// Only render on custodian routes
	const isCustodianRoute = $derived($page.url.pathname.startsWith('/custodian'));

	let profileOpen = $state(false);
	let notifOpen   = $state(false);
	let signOutOpen = $state(false);
	let recentNotifications = $state<NotificationRecord[]>([]);
	let unreadCount = $state(0);
	let loadingNotifications = $state(false);

	// ── QR Scanner ────────────────────────────────────────────────────────────
	let scannerOpen   = $state(false);
	let scannerResult = $state<{ id: string; code: string; studentName: string; status: string } | null>(null);
	let lookingUp     = $state(false);

	function openScanner() {
		scannerOpen   = true;
		scannerResult = null;
	}

	async function handleScanResult(rawId: string) {
		lookingUp = true;
		try {
			const res = await borrowRequestsAPI.getById(rawId);
			const studentName = res.student?.fullName ?? `Student ${res.studentId.slice(-6).toUpperCase()}`;
			scannerResult = { id: rawId, code: `REQ-${rawId.slice(-6).toUpperCase()}`, studentName, status: res.status };
		} catch {
			toastStore.error('QR code not recognised as a valid request.', 'Scan Error');
		} finally {
			lookingUp = false;
		}
	}

	function closeScanner() {
		scannerOpen   = false;
		scannerResult = null;
		lookingUp     = false;
	}

	function goToRequest() {
		if (!scannerResult) return;
		const id = scannerResult.id;
		closeScanner();
		goto(`/custodian/requests?requestId=${id}`);
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
	let notificationTicker: ReturnType<typeof setInterval>;

	onMount(() => {
		ticker = setInterval(() => { now = new Date(); }, 1000);
		void loadNotifications();
		notificationTicker = setInterval(() => {
			void loadNotifications();
		}, 60000);
		document.body.style.paddingTop = '4rem';
		return () => { document.body.style.paddingTop = ''; };
	});
	onDestroy(() => {
		clearInterval(ticker);
		clearInterval(notificationTicker);
		document.body.style.paddingTop = '';
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

	function formatRelativeTime(dateValue: string): string {
		const date = new Date(dateValue);
		const diffMs = Date.now() - date.getTime();
		const diffMinutes = Math.floor(diffMs / 60000);

		if (diffMinutes < 1) return 'Just now';
		if (diffMinutes < 60) return `${diffMinutes}m ago`;
		const diffHours = Math.floor(diffMinutes / 60);
		if (diffHours < 24) return `${diffHours}h ago`;
		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	}

	async function loadNotifications() {
		loadingNotifications = true;
		try {
			const data = await notificationsAPI.list(5, 0);
			recentNotifications = data.notifications;
			unreadCount = data.unreadCount;
		} catch {
			recentNotifications = [];
			unreadCount = 0;
		} finally {
			loadingNotifications = false;
		}
	}

	async function toggleNotifications(event: MouseEvent) {
		event.stopPropagation();
		notifOpen = !notifOpen;
		profileOpen = false;
		if (notifOpen) {
			await loadNotifications();
		}
	}

	async function openNotification(notification: NotificationRecord) {
		if (!notification.isRead) {
			await notificationsAPI.markAsRead(notification.id);
		}
		notifOpen = false;
		await loadNotifications();
		if (notification.link) {
			goto(notification.link);
		}
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={(e) => e.key === 'Escape' && (profileOpen = false, notifOpen = false)} />

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

		<!-- QR Scanner - hidden on mobile/tablet, visible on desktop -->
		<button
			onclick={openScanner}
			class="hidden h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-all duration-200 hover:bg-pink-50 hover:text-pink-600 lg:flex"
			aria-label="Scan QR code"
			title="Scan QR Code"
		>
			<ScanLine size={18} strokeWidth={1.75} />
		</button>

		<!-- Notifications -->
		<div class="relative" data-topnav-dropdown>
			<button
				onclick={toggleNotifications}
				class="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-all duration-200 hover:bg-pink-50 hover:text-pink-600"
				aria-label="Notifications"
				aria-expanded={notifOpen}
				title="Notifications"
			>
				<Bell size={18} strokeWidth={1.75} />
				{#if unreadCount > 0}
					<span class="absolute -right-1 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pink-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
						{Math.min(unreadCount, 99)}
					</span>
				{/if}
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
					{#if loadingNotifications}
						<div class="py-8 text-center text-sm text-gray-500">Loading notifications...</div>
					{:else if recentNotifications.length === 0}
						<div class="py-8 text-center">
							<Bell size={28} class="mx-auto mb-2 text-pink-600" />
							<p class="text-sm text-gray-500">No new notifications</p>
						</div>
					{:else}
						<div class="max-h-80 overflow-y-auto py-2">
							{#each recentNotifications as notification (notification.id)}
								<button
									type="button"
									onclick={() => openNotification(notification)}
									class="w-full border-l-2 px-4 py-2 text-left transition-colors hover:bg-gray-50 {notification.isRead ? 'border-transparent' : 'border-pink-500 bg-pink-50/40'}"
								>
									<p class="text-sm font-medium text-gray-900">{notification.title}</p>
									<p class="mt-0.5 line-clamp-2 text-xs text-gray-600">{notification.message}</p>
									<p class="mt-1 text-[11px] text-gray-400">{formatRelativeTime(notification.createdAt)}</p>
								</button>
							{/each}
						</div>
					{/if}
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
						<a href="/custodian/reports" onclick={() => profileOpen = false} role="menuitem" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-pink-50 hover:text-pink-600 lg:hidden">
							<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
							</svg>
							Reports & Analytics
						</a>
						<a href="/custodian/account/help" onclick={() => profileOpen = false} role="menuitem" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-pink-50 hover:text-pink-600">
							<HelpCircle size={15} class="text-gray-400" /> Support & Assistance
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
		<button type="button" class="fixed inset-0 bg-black/60 backdrop-blur-sm" onclick={closeScanner} aria-label="Close scanner" tabindex="-1"></button>

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
				{#if lookingUp}
					<!-- Looking up request -->
					<div class="flex flex-col items-center gap-3 py-10">
						<div class="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-pink-600"></div>
						<p class="text-sm text-gray-500">Looking up request…</p>
					</div>
				{:else if scannerResult}
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
							<button onclick={() => { scannerResult = null; }} class="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
								Scan Again
							</button>
							<button onclick={goToRequest} class="flex-1 rounded-xl bg-pink-600 py-3 text-sm font-semibold text-white hover:bg-pink-700 transition-colors">
								Open Request
							</button>
						</div>
					</div>
				{:else}
					<!-- Scanner component -->
					<QrScanner onResult={handleScanResult} onClose={closeScanner} />
				{/if}
			</div>
		</div>
	</div>
{/if}
