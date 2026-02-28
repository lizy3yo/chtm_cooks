<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { authStore, user } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { sidebarCollapsed } from '$lib/stores/custodian';
	import logo from '$lib/assets/CHTM_LOGO.png';
	
	interface NavItem {
		name: string;
		href: string;
		icon: string;
		children?: { name: string; href: string }[];
	}
	
	let isMobileMenuOpen = $state(false);
	let isProfileDropdownOpen = $state(false);
	let expandedSections = $state<Record<string, boolean>>({
		inventory: false,
		requests: false,
		financial: false,
		operations: false,
		reports: false
	});
	
	function toggleCollapse() {
		sidebarCollapsed.update(val => !val);
	}
	
	const navItems: NavItem[] = [
		{
			name: 'Dashboard',
			href: '/custodian/dashboard',
			icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
		},
		{
			name: 'Inventory',
			href: '/custodian/inventory',
			icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'
		},
		{
			name: 'Requests & Loans',
			href: '/custodian/requests',
			icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
		},
		{
			name: 'Financial',
			href: '/custodian/financial',
			icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
		},
		{
			name: 'Operations',
			href: '/custodian/operations',
			icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'
		},
		{
			name: 'Reports & Analytics',
			href: '/custodian/reports',
			icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
		}
	];
	
	function toggleSection(section: string) {
		expandedSections[section] = !expandedSections[section];
	}
	
	function isActive(href: string): boolean {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}
	
	function getSectionKey(itemName: string): string {
		return itemName.toLowerCase().replace(/\s+&\s+/g, '-').replace(/\s+/g, '-');
	}
	
	async function handleLogout() {
		await authStore.logout();
		toastStore.success('You have been logged out successfully.', 'Logged Out');
		goto('/auth/login');
	}
	
	function closeMobileMenu() {
		isMobileMenuOpen = false;
	}
	
	function toggleProfileDropdown() {
		isProfileDropdownOpen = !isProfileDropdownOpen;
	}
</script>

<!-- Mobile Menu Button -->
<button
	onclick={() => (isMobileMenuOpen = !isMobileMenuOpen)}
	class="fixed left-4 top-4 z-50 rounded-lg bg-white p-2 shadow-lg lg:hidden"
	aria-label="Toggle menu"
>
	<svg class="h-6 w-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		{#if isMobileMenuOpen}
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
		{:else}
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
		{/if}
	</svg>
</button>

<!-- Overlay for mobile -->
{#if isMobileMenuOpen}
	<div
		class="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
		onclick={closeMobileMenu}
		role="button"
		tabindex="0"
	></div>
{/if}

<!-- Sidebar -->
<aside
    class="fixed inset-y-0 left-0 z-40 transform border-r border-gray-200 shadow-lg transition-all duration-300 ease-in-out {isMobileMenuOpen
		? 'translate-x-0'
		: '-translate-x-full'} lg:translate-x-0 {$sidebarCollapsed ? 'lg:w-20' : 'w-72'}"
	style="background-color: #ffffff;"
>
	<div class="flex h-full flex-col overflow-hidden">
		<!-- Logo -->
		<div class="flex h-16 items-center justify-between border-b border-gray-200 px-4 overflow-hidden {$sidebarCollapsed ? 'lg:px-3 lg:justify-center' : 'px-6'}">
			<div class="flex items-center overflow-hidden">
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-md transition-all hover:shadow-lg {$sidebarCollapsed ? 'lg:h-9 lg:w-9' : ''}">
					<img src={logo} alt="CHTM Logo" class="h-8 w-8 object-contain {$sidebarCollapsed ? 'lg:h-7 lg:w-7' : ''}" />
				</div>
				{#if !$sidebarCollapsed}
					<div class="ml-3">
						<h1 class="text-lg font-bold text-gray-900">Custodian</h1>
						<p class="text-xs text-gray-500">Lab Management</p>
					</div>
				{/if}
			</div>
			
			<!-- Desktop Collapse Toggle - In Header when expanded -->
			{#if !$sidebarCollapsed}
					<button
						onclick={toggleCollapse}
						class="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg hover:bg-pink-50 hover:text-pink-600 text-gray-600 transition-all duration-200"
					aria-label="Collapse sidebar"
					title="Collapse sidebar"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
					</svg>
				</button>
			{/if}
		</div>
		
		<!-- Desktop Collapse Toggle - Floating on Side when collapsed -->
		{#if $sidebarCollapsed}
			<button
				onclick={toggleCollapse}
				class="hidden lg:flex items-center justify-center h-8 w-8 rounded-full bg-white border-2 border-gray-200 hover:border-pink-500 hover:bg-pink-50 hover:text-pink-600 text-gray-600 shadow-md hover:shadow-lg transition-all duration-200 absolute top-4 -right-4 z-50"
				aria-label="Expand sidebar"
				title="Expand sidebar"
			>
				<svg class="h-4 w-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
				</svg>
			</button>
		{/if}
		
		<!-- Navigation -->
		<nav class="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 {$sidebarCollapsed ? 'lg:px-2 lg:py-3' : ''}">
			<div class="space-y-1 {$sidebarCollapsed ? 'lg:space-y-2' : ''}">
				{#each navItems as item}
					{@const sectionKey = getSectionKey(item.name)}
					{@const hasChildren = item.children && item.children.length > 0}
					{@const isItemActive = isActive(item.href)}
					
					<div class="group">
						{#if hasChildren}
							<!-- Parent item with children -->
							<button
								onclick={() => toggleSection(sectionKey)}
								class="relative flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 {isItemActive
									? 'bg-pink-50 text-pink-700 shadow-sm'
									: 'text-gray-700 hover:bg-pink-50 hover:text-pink-600 hover:shadow-sm'} {$sidebarCollapsed ? 'lg:justify-center lg:px-2 lg:py-3' : ''}"
								title={$sidebarCollapsed ? item.name : ''}
							>
								{#if isItemActive && $sidebarCollapsed}
									<div class="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-pink-600 rounded-r-full hidden lg:block"></div>
								{/if}
								<div class="flex items-center {$sidebarCollapsed ? 'lg:justify-center' : ''}">
									<svg
										class="h-5 w-5 transition-all {isItemActive ? 'text-pink-600 scale-110' : 'text-gray-400 group-hover:text-pink-500'} {$sidebarCollapsed ? 'lg:h-6 lg:w-6' : ''}"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon}/>
									</svg>
									{#if !$sidebarCollapsed}
										<span class="ml-3">{item.name}</span>
									{/if}
								</div>
								{#if !$sidebarCollapsed}
									<svg
										class="h-4 w-4 transition-transform duration-200 {expandedSections[sectionKey] ? 'rotate-180' : ''}"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
									</svg>
								{/if}
							</button>
							
							<!-- Children items -->
							{#if expandedSections[sectionKey] && !$sidebarCollapsed}
								<div class="ml-8 mt-1 space-y-1 border-l-2 border-gray-200 pl-3">
									{#each item.children as child}
										<a
											href={child.href}
											onclick={closeMobileMenu}
											class="block rounded-md px-3 py-2 text-sm transition-colors {isActive(child.href)
												? 'bg-pink-50 font-medium text-pink-700'
												: 'text-gray-600 hover:bg-pink-50 hover:text-pink-600'}"
										>
											{child.name}
										</a>
									{/each}
								</div>
							{/if}
						{:else}
							<!-- Single item without children -->
							<a
								href={item.href}
								onclick={closeMobileMenu}
								class="relative flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 {isItemActive
									? 'bg-pink-50 text-pink-700 shadow-sm'
									: 'text-gray-700 hover:bg-pink-50 hover:text-pink-600 hover:shadow-sm'} {$sidebarCollapsed ? 'lg:justify-center lg:px-2 lg:py-3' : ''}"
								title={$sidebarCollapsed ? item.name : ''}
							>
								{#if isItemActive && $sidebarCollapsed}
									<div class="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-pink-600 rounded-r-full hidden lg:block"></div>
								{/if}
								<svg
									class="h-5 w-5 transition-all {isItemActive ? 'text-pink-600 scale-110' : 'text-gray-400 group-hover:text-pink-500'} {$sidebarCollapsed ? 'lg:h-6 lg:w-6' : ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon}/>
								</svg>
								{#if !$sidebarCollapsed}
									<span class="ml-3">{item.name}</span>
								{/if}
							</a>
						{/if}
					</div>
				{/each}
			</div>
		</nav>
		
			<!-- User Info & Logout -->
			<div class="relative border-t border-gray-200 bg-gradient-to-b from-gray-50 to-white p-4 overflow-visible {$sidebarCollapsed ? 'lg:p-3 lg:py-4' : ''}">
			{#if $user}
				{#if $sidebarCollapsed}
					<!-- Collapsed View - Stacked Icons -->
					<div class="hidden lg:flex flex-col items-center gap-3">
						<!-- Profile Button -->
							<button
								onclick={toggleProfileDropdown}
								class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-pink-50 border-2 border-pink-200 text-pink-700 font-semibold shadow-sm transition-all hover:shadow-md"
								title="{$user.firstName} {$user.lastName}"
							>
							{$user.firstName?.charAt(0)}{$user.lastName?.charAt(0)}
						</button>
					</div>
				{:else}
					<!-- Expanded View - Profile Dropdown -->
					<button
						onclick={toggleProfileDropdown}
						class="flex items-center w-full rounded-lg p-2 transition-all hover:bg-pink-50"
						title="{$user.firstName} {$user.lastName}"
					>
						<div class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-pink-50 border-2 border-pink-200 text-pink-700 font-semibold shadow-sm transition-all">
							{$user.firstName?.charAt(0)}{$user.lastName?.charAt(0)}
						</div>
						<div class="ml-3 flex-1 min-w-0 text-left">
							<p class="truncate text-sm font-medium text-gray-900">
								{$user.firstName} {$user.lastName}
							</p>
							<p class="truncate text-xs text-gray-500">{$user.email}</p>
						</div>
						<svg
							class="h-4 w-4 text-gray-400 transition-transform duration-200 {isProfileDropdownOpen ? 'rotate-180' : ''}"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
						</svg>
					</button>
				{/if}
				
				<!-- Dropdown Menu -->
				{#if isProfileDropdownOpen && !$sidebarCollapsed}
					<div class="absolute bottom-full left-0 right-0 mb-2 mx-4 rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden">
						<a
							href="/custodian/account/profile"
							onclick={() => { closeMobileMenu(); isProfileDropdownOpen = false; }}
							class="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-pink-50 hover:text-pink-600 transition-colors"
						>
							<svg class="h-5 w-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
							</svg>
							Profile
						</a>
						<a
							href="/custodian/account/settings"
							onclick={() => { closeMobileMenu(); isProfileDropdownOpen = false; }}
							class="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-pink-50 hover:text-pink-600 transition-colors border-t border-gray-100"
						>
							<svg class="h-5 w-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
							</svg>
							Settings
						</a>
						<a
							href="/custodian/notifications"
							onclick={() => { closeMobileMenu(); isProfileDropdownOpen = false; }}
							class="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-pink-50 hover:text-pink-600 transition-colors border-t border-gray-100"
						>
							<svg class="h-5 w-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
							</svg>
							Notifications
						</a>
						
						<button
							onclick={() => { handleLogout(); isProfileDropdownOpen = false; }}
							class="flex items-center w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-gray-100"
						>
							<svg class="h-5 w-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
							</svg>
							Log out
						</button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</aside>
