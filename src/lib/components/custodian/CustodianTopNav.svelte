<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore, user } from '$lib/stores/auth';
	import { themeStore } from '$lib/stores/theme';
	import { toastStore } from '$lib/stores/toast';
	import { sidebarCollapsed, mobileSidebarOpen } from '$lib/stores/custodian';
	import { Moon, Sun, HelpCircle, Bell, ChevronDown, LogOut, User, Settings, CalendarDays } from 'lucide-svelte';
	import SignOutModal from '$lib/components/ui/SignOutModal.svelte';
	import logo from '$lib/assets/CHTM_LOGO.png';

	// Only render on custodian routes
	const isCustodianRoute = $derived($page.url.pathname.startsWith('/custodian'));

	let profileOpen = $state(false);
	let notifOpen   = $state(false);
	let signOutOpen = $state(false);

	// ── Live clock ────────────────────────────────────────────────────────────
	let now = $state(new Date());
	let ticker: ReturnType<typeof setInterval>;

	onMount(() => {
		ticker = setInterval(() => { now = new Date(); }, 1000);
		// Apply top padding for mobile nav
		document.body.style.paddingTop = '4rem';
		return () => { document.body.style.paddingTop = ''; };
	});
	onDestroy(() => {
		clearInterval(ticker);
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
