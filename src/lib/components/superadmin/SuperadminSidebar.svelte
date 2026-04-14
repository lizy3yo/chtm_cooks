<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { authStore, user } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { sidebarCollapsed, mobileSidebarOpen } from '$lib/stores/superadmin';
	import logo from '$lib/assets/CHTM_LOGO.png';
	import SignOutModal from '$lib/components/ui/SignOutModal.svelte';
	
	interface NavItem {
		name: string;
		href: string;
		icon: string;
	}
	
	let isMobileMenuOpen = $derived($mobileSidebarOpen);
	let signOutOpen = $state(false);
	
	function toggleCollapse() {
		sidebarCollapsed.update(val => !val);
	}
	
	const navItems: NavItem[] = [
		{
			name: 'Dashboard',
			href: '/superadmin/dashboard',
			icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
		},
		{
			name: 'User Management',
			href: '/superadmin/users',
			icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z'
		},
		{
			name: 'System Settings',
			href: '/superadmin/settings',
			icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z'
		},
		{
			name: 'Audit Logs',
			href: '/superadmin/audit',
			icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
		},
		{
			name: 'Analytics & Reports',
			href: '/superadmin/analytics',
			icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
		},
		{
			name: 'Database Management',
			href: '/superadmin/database',
			icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4'
		},
		{
			name: 'System Health',
			href: '/superadmin/health',
			icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
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
		mobileSidebarOpen.set(false);
	}
</script>

<!-- Overlay for mobile -->
{#if $mobileSidebarOpen}
	<button
		type="button"
		class="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
		onclick={closeMobileMenu}
		onkeydown={(e) => e.key === 'Escape' && closeMobileMenu()}
		aria-label="Close sidebar"
	></button>
{/if}

<!-- Sidebar -->
<aside
	class="fixed inset-y-0 left-0 z-50 transform border-r border-gray-200 shadow-lg transition-all duration-300 ease-in-out {$mobileSidebarOpen
		? 'translate-x-0'
		: '-translate-x-full'} lg:translate-x-0 {$sidebarCollapsed ? 'lg:w-20' : 'w-56 md:w-72'}"
	style="background-color: #ffffff;"
>
	<div class="flex h-full flex-col overflow-hidden">
		<!-- Logo -->
		<div class="flex h-16 items-center justify-between border-b border-gray-200 px-4 overflow-hidden {$sidebarCollapsed ? 'lg:px-3 lg:justify-center' : 'px-6'}">
			<div class="flex items-center overflow-hidden">
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br from-purple-500 to-indigo-600 shadow-md transition-all hover:shadow-lg {$sidebarCollapsed ? 'lg:h-9 lg:w-9' : ''}">
					<img src={logo} alt="CHTM Logo" class="h-8 w-8 object-contain {$sidebarCollapsed ? 'lg:h-7 lg:w-7' : ''}" />
				</div>
				{#if !$sidebarCollapsed}
					<div class="ml-3">
						<h1 class="text-lg font-bold text-gray-900">Superadmin</h1>
						<p class="text-xs text-gray-500">System Control</p>
					</div>
				{/if}
			</div>
			
			<!-- Desktop Collapse Toggle - In Header when expanded -->
			{#if !$sidebarCollapsed}
				<button
					onclick={toggleCollapse}
					class="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg hover:bg-purple-50 hover:text-purple-600 text-gray-600 transition-all duration-200"
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
				class="hidden lg:flex shrink-0 items-center justify-center h-8 w-8 rounded-full bg-white border-2 border-gray-200 hover:border-purple-500 hover:bg-purple-50 hover:text-purple-600 text-gray-600 shadow-md hover:shadow-lg transition-all duration-200 absolute top-4 -right-4 z-50"
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
						class="relative flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 {isItemActive
							? 'bg-purple-50 text-purple-700 shadow-sm'
							: 'text-gray-700 hover:bg-purple-50 hover:text-purple-600 hover:shadow-sm'} {$sidebarCollapsed ? 'lg:justify-center lg:px-2 lg:py-3' : ''}"
						title={$sidebarCollapsed ? item.name : ''}
					>
						{#if isItemActive && $sidebarCollapsed}
							<div class="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-purple-600 rounded-r-full hidden lg:block"></div>
						{/if}
						<svg
							class="h-5 w-5 transition-all {isItemActive ? 'text-purple-600 scale-110' : 'text-gray-400 group-hover:text-purple-500'} {$sidebarCollapsed ? 'lg:h-6 lg:w-6' : ''}"
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

