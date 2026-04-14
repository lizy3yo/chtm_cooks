<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { authStore, user } from '$lib/stores/auth';
	import { themeStore } from '$lib/stores/theme';
	import { toastStore } from '$lib/stores/toast';
	import { sidebarCollapsed } from '$lib/stores/student';
	import logo from '$lib/assets/CHTM_LOGO.png';
	import SignOutModal from '$lib/components/ui/SignOutModal.svelte';
	
	interface NavItem {
		name: string;
		href: string;
		icon: string;
		badge?: number;
	}
	
	import { derived } from 'svelte/store';
	import { onMount } from 'svelte';

	let isMobileMenuOpen = $state(false);
	let isProfileDropdownOpen = $state(false);
	let signOutOpen = $state(false);

	// Show the mobile top nav only on student routes
	const showTopNav = derived(page, $page => $page.url.pathname.startsWith('/student'));

	// Apply body padding only when the mobile top nav is visible
	onMount(() => {
		const unsub = showTopNav.subscribe(val => {
			if (val) document.body.style.paddingTop = '3.5rem';
			else document.body.style.paddingTop = '';
		});
		return () => {
			unsub();
			document.body.style.paddingTop = '';
		};
	});
	
	function toggleCollapse() {
		sidebarCollapsed.update(val => !val);
	}
	
	const navItems: NavItem[] = [
		{
			name: 'Dashboard',
			href: '/student/dashboard',
			icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
		},
		{
			name: 'Equipment Catalog',
			href: '/student/catalog',
			icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
		},
		{
			name: 'Request Equipment',
			href: '/student/request',
			icon: 'M12 4v16m8-8H4'
		},
		{
			name: 'My Requests',
			href: '/student/requests',
			icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
			badge: 0 // Will be dynamic
		},
		{
			name: 'My Borrowed Items',
			href: '/student/borrowed',
			icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4',
			badge: 0 // Will be dynamic
		}
	];
	
	function isActive(href: string): boolean {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
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

	function getUserInitials(firstName?: string, lastName?: string): string {
		return `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase();
	}
</script>

<!-- Mobile Top Navigation -->
{#if showTopNav}
	<div class="fixed top-0 left-0 right-0 z-30 lg:hidden">
		<div class="flex items-center h-14 px-4 bg-white border-b border-gray-200 shadow-sm">
			{#if !isMobileMenuOpen}
				<button
					onclick={() => (isMobileMenuOpen = !isMobileMenuOpen)}
					class="rounded-lg bg-white p-2 shadow-md"
					aria-label="Toggle menu"
				>
					<svg class="h-6 w-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
					</svg>
				</button>
			{/if}
		</div>
	</div>
{/if}

<!-- Overlay for mobile -->
{#if isMobileMenuOpen}
	<div
		class="fixed inset-0 z-40 bg-transparent lg:hidden"
		onclick={closeMobileMenu}
		onkeydown={(e) => e.key === 'Enter' && closeMobileMenu()}
		role="button"
		tabindex="0"
		aria-label="Close menu"
	></div>
{/if}

<!-- Sidebar -->
<aside
	class="fixed inset-y-0 left-0 z-50 transform border-r border-gray-200 shadow-lg transition-all duration-300 ease-in-out {isMobileMenuOpen
		? 'translate-x-0'
		: '-translate-x-full'} lg:translate-x-0 {$sidebarCollapsed ? 'lg:w-20' : 'w-56 md:w-72'}"
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
						<h1 class="text-lg font-bold text-gray-900">Student Portal</h1>
						<p class="text-xs text-gray-500">CHTM-Cooks</p>
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
					{@const isItemActive = isActive(item.href)}
					
					<a
						href={item.href}
						onclick={closeMobileMenu}
						class="relative flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 {isItemActive
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
						{#if item.badge !== undefined && item.badge > 0}
							<span class="flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-semibold text-white bg-red-500 rounded-full {$sidebarCollapsed ? 'lg:absolute lg:top-1 lg:right-1' : ''}">
								{item.badge > 99 ? '99+' : item.badge}
							</span>
						{/if}
					</a>
				{/each}
			</div>
		</nav>
	</div>
</aside>

<SignOutModal
	open={signOutOpen}
	onconfirm={handleLogout}
	oncancel={() => (signOutOpen = false)}
/>

