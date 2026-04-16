<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore, user } from '$lib/stores/auth';
	import { themeStore } from '$lib/stores/theme';
	import { toastStore } from '$lib/stores/toast';
	import { notificationsAPI, type NotificationRecord } from '$lib/api/notifications';
	import { sidebarCollapsed } from '$lib/stores/student';
	import { requestCartCount, requestCartStore, requestCartItems } from '$lib/stores/requestCart';
	import { catalogAPI } from '$lib/api/catalog';
	import { Moon, Sun, HelpCircle, Bell, ChevronDown, LogOut, User, Settings, History, CalendarDays, ShoppingBag } from 'lucide-svelte';
	import SignOutModal from '$lib/components/ui/SignOutModal.svelte';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
	import logo from '$lib/assets/CHTM_LOGO.png';

	// Only render on student routes — prevents flash on other pages during navigation
	const isStudentRoute = $derived($page.url.pathname.startsWith('/student'));

	let profileOpen = $state(false);
	let notifOpen   = $state(false);
	let signOutOpen = $state(false);
	let showRequestListDropdown = $state(false);
	let recentNotifications = $state<NotificationRecord[]>([]);
	let unreadCount = $state(0);
	let loadingNotifications = $state(false);
	let catalogData = $state<any>(null);

	// ── Live clock ────────────────────────────────────────────────────────────
	let now = $state(new Date());
	let ticker: ReturnType<typeof setInterval>;
	let notificationTicker: ReturnType<typeof setInterval>;

	onMount(() => {
		ticker = setInterval(() => { now = new Date(); }, 1000);
		void loadNotifications();
		void loadCatalogData();
		notificationTicker = setInterval(() => {
			void loadNotifications();
		}, 60000);
	});
	onDestroy(() => {
		clearInterval(ticker);
		clearInterval(notificationTicker);
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

	const formattedDateMobile = $derived(
		now.toLocaleString('en-US', {
			month: 'short',
			day:   'numeric',
			year:  'numeric'
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
			showRequestListDropdown = false;
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

	function toggleRequestListDropdown(event: MouseEvent) {
		event.stopPropagation();
		showRequestListDropdown = !showRequestListDropdown;
		profileOpen = false;
		notifOpen = false;
	}

	function closeRequestListDropdown() {
		showRequestListDropdown = false;
	}

	function removeFromCart(itemId: string) {
		// Check if item is constant before attempting removal
		const item = $requestCartItems.find(i => i.itemId === itemId);
		if (item) {
			const catalogItem = catalogData?.items.find((i: any) => i.id === item.itemId);
			if (catalogItem?.isConstant === true) {
				toastStore.warning('Constant items cannot be removed from your request list. You can only adjust their quantity.', 'Cannot Remove Item');
				return;
			}
		}

		requestCartStore.removeItem(itemId).catch((error) => {
			console.error('Failed to remove item:', error);
			const errorMessage = error instanceof Error ? error.message : 'Failed to remove item';
			
			// Check if it's a constant item error from backend
			if (errorMessage.includes('constant')) {
				toastStore.warning('Constant items cannot be removed from your request list.', 'Cannot Remove Item');
			} else {
				toastStore.error('Failed to remove item from request list', 'Error');
			}
		});
		toastStore.info('Item removed from request list', 'Request List Updated');
	}

	function updateCartQuantity(itemId: string, quantity: number) {
		requestCartStore.setQuantity(itemId, quantity).catch((error) => {
			console.error('Failed to update quantity:', error);
			toastStore.error('Failed to update quantity', 'Error');
		});
	}

	async function loadCatalogData() {
		try {
			const data = await catalogAPI.getCatalog({ limit: 1000 });
			catalogData = data;
		} catch (error) {
			console.error('Failed to load catalog data:', error);
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

{#if isStudentRoute}
<header
	class="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm transition-all duration-300 sm:px-6
		{$sidebarCollapsed ? 'lg:pl-24' : 'lg:pl-76'}"
>
	<!-- Left: branding on mobile/tablet, hidden on desktop (sidebar takes over) -->
	<div class="flex items-center gap-3 lg:hidden">
		<!-- Logo + wordmark — always visible -->
		<div class="flex items-center gap-2">
			<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white shadow-md">
				<img src={logo} alt="CHTM Logo" class="h-5 w-5 object-contain" />
			</div>
			<div class="leading-tight">
				<p class="text-xs font-bold text-gray-900">Student Portal</p>
				<p class="text-[10px] text-gray-400">CHTM-Cooks</p>
			</div>
		</div>

		<!-- Divider + date — tablet only (sm to lg) -->
		<div class="hidden items-center gap-1.5 text-gray-500 sm:flex">
			<div class="mr-1.5 h-6 w-px bg-gray-200"></div>
			<CalendarDays size={15} strokeWidth={1.75} class="shrink-0" />
			<span class="text-sm">{formattedDateTime}</span>
		</div>
	</div>

	<!-- Date — desktop only (lg+), branding is in the sidebar -->
	<div class="hidden items-center gap-1.5 text-gray-500 lg:flex">
		<CalendarDays size={15} strokeWidth={1.75} class="shrink-0" />
		<span class="text-sm">{formattedDateTime}</span>
	</div>

	<!-- Right: all controls -->
	<div class="ml-auto flex items-center gap-0.5">

		<!-- Request List Dropdown -->
		<div class="relative" data-topnav-dropdown>
			<button
				onclick={toggleRequestListDropdown}
				class="relative flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-gray-600 transition-all duration-200 hover:bg-pink-50 hover:text-pink-600"
				aria-label="Request list"
				aria-expanded={showRequestListDropdown}
				title="Request List"
			>
				<ShoppingBag size={18} strokeWidth={1.75} />
				{#if $requestCartCount > 0}
					<span class="absolute -right-1 -top-1 inline-flex min-h-4.5 min-w-4.5 items-center justify-center rounded-full bg-pink-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
						{$requestCartCount}
					</span>
				{/if}
			</button>

			{#if showRequestListDropdown}
				<div
					class="fixed left-2 right-2 top-17 rounded-xl border border-gray-200 bg-white shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
					role="dialog"
					aria-label="Request List"
				>
					<!-- Header -->
					<div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
						<p class="text-sm font-semibold text-gray-900">Request List</p>
						<a href="/student/request" onclick={() => showRequestListDropdown = false} class="text-xs font-medium text-pink-600 hover:text-pink-700">View all</a>
					</div>

					<!-- Items List - Scrollable -->
					<div class="max-h-80 overflow-y-auto py-2">
						{#if $requestCartCount === 0}
							<div class="py-8 text-center">
								<ShoppingBag size={28} class="mx-auto mb-2 text-pink-600" />
								<p class="text-sm text-gray-500">No items in request list</p>
							</div>
						{:else}
							{@const constantItems = $requestCartItems.filter((item) => {
								const catalogItem = catalogData?.items.find((i: any) => i.id === item.itemId);
								return catalogItem?.isConstant === true;
							})}
							{@const additionalItems = $requestCartItems.filter((item) => {
								const catalogItem = catalogData?.items.find((i: any) => i.id === item.itemId);
								return catalogItem?.isConstant !== true;
							})}

							<!-- Constant Items Section -->
							{#if constantItems.length > 0}
								<div class="border-b border-gray-100 bg-blue-50/50 px-4 py-2">
									<div class="flex items-center gap-2">
										<h3 class="text-xs font-semibold text-blue-900 uppercase tracking-wide">Constant Items</h3>
										<span class="ml-auto text-xs text-blue-600 font-medium">{constantItems.length}</span>
									</div>
								</div>
								<div>
									{#each constantItems as cartItem (cartItem.itemId)}
										<div class="border-l-2 border-blue-500 bg-blue-50/30 px-4 py-2 transition-colors hover:bg-blue-50">
											<div class="flex gap-3">
												<!-- Item Image -->
												<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-blue-200 bg-gray-100 flex items-center justify-center">
													{#if cartItem.picture}
														<img 
															src={cartItem.picture} 
															alt={cartItem.name} 
															class="h-full w-full object-cover" 
															loading="lazy"
															onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
														/>
													{/if}
													{#if !cartItem.picture}
														<ItemImagePlaceholder size="sm" />
													{/if}
												</div>

												<!-- Item Details -->
												<div class="min-w-0 flex-1">
													<div class="flex items-start justify-between gap-2">
														<p class="text-sm font-medium text-gray-900 line-clamp-1">{cartItem.name}</p>
														<span class="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 uppercase">Constant</span>
													</div>
													<p class="mt-0.5 text-xs text-gray-500">Qty: {cartItem.quantity} / Max: {cartItem.maxQuantity}</p>
													
													<!-- Quantity Controls -->
													<div class="mt-1.5 flex items-center gap-1.5">
														<div class="flex items-center rounded border border-blue-300 bg-white">
															<button
																onclick={() => updateCartQuantity(cartItem.itemId, Math.max(1, cartItem.quantity - 1))}
																disabled={cartItem.quantity <= 1}
																class="flex h-6 w-6 items-center justify-center text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
																aria-label="Decrease quantity"
															>
																<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4" />
																</svg>
															</button>
															<span class="flex h-6 w-8 items-center justify-center text-xs font-semibold text-gray-900">
																{cartItem.quantity}
															</span>
															<button
																onclick={() => updateCartQuantity(cartItem.itemId, Math.min(cartItem.maxQuantity, cartItem.quantity + 1))}
																disabled={cartItem.quantity >= cartItem.maxQuantity}
																class="flex h-6 w-6 items-center justify-center text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
																aria-label="Increase quantity"
															>
																<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
																</svg>
															</button>
														</div>
														<!-- Constant items cannot be removed - show disabled button with tooltip -->
														<div class="relative group">
															<button
																disabled
																class="flex h-6 w-6 items-center justify-center rounded text-gray-300 cursor-not-allowed"
																aria-label="Cannot remove constant item"
																title="Constant items cannot be removed"
															>
																<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
																</svg>
															</button>
															<!-- Tooltip -->
															<div class="pointer-events-none absolute bottom-full right-0 mb-1 hidden w-40 rounded bg-gray-900 px-2 py-1 text-[10px] text-white group-hover:block">
																Required item - cannot be removed
															</div>
														</div>
													</div>
												</div>
											</div>
										</div>
									{/each}
								</div>
							{/if}

							<!-- Additional Items Section -->
							{#if additionalItems.length > 0}
								<div class="border-b border-gray-100 bg-gray-50 px-4 py-2">
									<div class="flex items-center gap-2">
										<svg class="h-3.5 w-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
										</svg>
										<h3 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Additional Items</h3>
										<span class="ml-auto text-xs text-gray-600 font-medium">{additionalItems.length}</span>
									</div>
								</div>
								<div>
									{#each additionalItems as cartItem (cartItem.itemId)}
										<div class="border-l-2 border-transparent px-4 py-2 transition-colors hover:bg-gray-50">
											<div class="flex gap-3">
												<!-- Item Image -->
												<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 flex items-center justify-center">
													{#if cartItem.picture}
														<img 
															src={cartItem.picture} 
															alt={cartItem.name} 
															class="h-full w-full object-cover" 
															loading="lazy"
															onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
														/>
													{/if}
													{#if !cartItem.picture}
														<ItemImagePlaceholder size="sm" />
													{/if}
												</div>

												<!-- Item Details -->
												<div class="min-w-0 flex-1">
													<p class="text-sm font-medium text-gray-900 line-clamp-1">{cartItem.name}</p>
													<p class="mt-0.5 text-xs text-gray-500">Qty: {cartItem.quantity} / Max: {cartItem.maxQuantity}</p>
													
													<!-- Quantity Controls -->
													<div class="mt-1.5 flex items-center gap-1.5">
														<div class="flex items-center rounded border border-gray-300 bg-white">
															<button
																onclick={() => updateCartQuantity(cartItem.itemId, Math.max(1, cartItem.quantity - 1))}
																disabled={cartItem.quantity <= 1}
																class="flex h-6 w-6 items-center justify-center text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
																aria-label="Decrease quantity"
															>
																<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20 12H4" />
																</svg>
															</button>
															<span class="flex h-6 w-8 items-center justify-center text-xs font-semibold text-gray-900">
																{cartItem.quantity}
															</span>
															<button
																onclick={() => updateCartQuantity(cartItem.itemId, Math.min(cartItem.maxQuantity, cartItem.quantity + 1))}
																disabled={cartItem.quantity >= cartItem.maxQuantity}
																class="flex h-6 w-6 items-center justify-center text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
																aria-label="Increase quantity"
															>
																<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																	<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
																</svg>
															</button>
														</div>
														<button
															onclick={() => removeFromCart(cartItem.itemId)}
															class="flex h-6 w-6 items-center justify-center rounded text-red-600 hover:bg-red-50 transition-colors"
															aria-label="Remove item"
															title="Remove from list"
														>
															<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
															</svg>
														</button>
													</div>
												</div>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						{/if}
					</div>
				</div>
			{/if}
		</div>

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
					<span class="absolute -right-1 -top-1 inline-flex min-h-4.5 min-w-4.5 items-center justify-center rounded-full bg-pink-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
						{Math.min(unreadCount, 99)}
					</span>
				{/if}
			</button>

			{#if notifOpen}
				<div
					class="fixed left-2 right-2 top-17 rounded-xl border border-gray-200 bg-white shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
					role="dialog"
					aria-label="Notifications"
				>
					<div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
						<p class="text-sm font-semibold text-gray-900">Notifications</p>
						<a href="/student/account/notifications" onclick={() => notifOpen = false} class="text-xs font-medium text-pink-600 hover:text-pink-700">View all</a>
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
					<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-pink-100 to-pink-50 border-2 border-pink-200 text-pink-700 text-xs font-semibold shadow-sm">
						{#if $user.profilePhotoUrl}
							<img src={$user.profilePhotoUrl} alt="{$user.firstName} {$user.lastName}" class="h-full w-full object-cover" />
						{:else}
							{initials($user.firstName, $user.lastName)}
						{/if}
					</div>
					<span class="hidden max-w-30 truncate text-sm font-medium text-gray-900 sm:block">
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
						<a href="/student/account/profile"  onclick={() => profileOpen = false} role="menuitem" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-pink-50 hover:text-pink-600">
							<User size={15} class="text-gray-400" /> Profile
						</a>
						<a href="/student/account/settings" onclick={() => profileOpen = false} role="menuitem" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-pink-50 hover:text-pink-600">
							<Settings size={15} class="text-gray-400" /> Settings
						</a>
						<a href="/student/account/history"  onclick={() => profileOpen = false} role="menuitem" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-pink-50 hover:text-pink-600">
							<History size={15} class="text-gray-400" /> History
						</a>
						<a href="/student/account/help" onclick={() => profileOpen = false} role="menuitem" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-pink-50 hover:text-pink-600">
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
